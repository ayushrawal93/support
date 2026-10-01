"use strict";
/*
 * Human-only live chat. No AI anywhere in this file: every reply is typed by a person
 * in the agent console (/agent). Visitors and agents are connected with Server-Sent Events.
 * When a chat ends (visitor, agent, or 30 min of silence) the transcript is emailed.
 */
const crypto = require("crypto");
const { query } = require("../config/database");
const mailer = require("./mailer");

const IDLE_MS = 30 * 60 * 1000;
const visitorStreams = new Map(); // sessionId -> Set(res)
const agentStreams = new Set();   // res

async function initTables() {
  await query(`CREATE TABLE IF NOT EXISTS livechat_sessions (
    id VARCHAR(32) PRIMARY KEY,
    token VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'waiting',
    agent_name VARCHAR(100),
    transcript_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ)`);
  await query(`CREATE TABLE IF NOT EXISTS livechat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(32) NOT NULL REFERENCES livechat_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL,
    sender_name VARCHAR(120),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lcm_session ON livechat_messages(session_id, id)`);
  await query(`CREATE TABLE IF NOT EXISTS livechat_settings (key VARCHAR(40) PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
  setInterval(() => closeIdle().catch((e) => console.error("[LIVECHAT] idle sweep:", e.message)), 60 * 1000).unref();
}

/* ------------------------------ streams ------------------------------ */
function sse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

function openStream(req, res, onClose) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(": connected\n\n");
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); onClose(); });
}
function attachVisitor(req, res, id) {
  if (!visitorStreams.has(id)) visitorStreams.set(id, new Set());
  visitorStreams.get(id).add(res);
  openStream(req, res, () => visitorStreams.get(id)?.delete(res));
}
function attachAgent(req, res) { agentStreams.add(res); openStream(req, res, () => agentStreams.delete(res)); }
const toVisitor = (id, ev, d) => (visitorStreams.get(id) || []).forEach((r) => sse(r, ev, d));
const toAgents = (ev, d) => agentStreams.forEach((r) => sse(r, ev, d));

/* ------------------------------ settings (edited in the agent console) ------------------------------ */
/* forward_emails: comma separated addresses that receive every finished chat transcript (and new-chat alerts).
   Falls back to LIVECHAT_EMAIL_TO / EMAIL_TO from .env until someone saves it in the console. */
async function getSettings() {
  const rows = (await query("SELECT key,value FROM livechat_settings")).rows;
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const envList = String(process.env.LIVECHAT_EMAIL_TO || process.env.EMAIL_TO || "");
  const list = (m.forward_emails != null ? m.forward_emails : envList).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(validEmail);
  return {
    forward_emails: [...new Set(list)],
    notify_new_chat: m.notify_new_chat != null ? m.notify_new_chat === "1" : true,
    send_visitor_copy: m.send_visitor_copy != null ? m.send_visitor_copy === "1" : true
  };
}
async function saveSettings({ forward_emails, notify_new_chat, send_visitor_copy }) {
  const raw = Array.isArray(forward_emails) ? forward_emails.join(",") : String(forward_emails || "");
  const parts = raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const bad = parts.filter((e) => !validEmail(e));
  if (bad.length) throw Object.assign(new Error("Invalid email address: " + bad[0]), { status: 400 });
  const put = (k, v) => query("INSERT INTO livechat_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [k, v]);
  await put("forward_emails", [...new Set(parts)].join(","));
  await put("notify_new_chat", notify_new_chat ? "1" : "0");
  await put("send_visitor_copy", send_visitor_copy ? "1" : "0");
  return getSettings();
}

/* ------------------------------ sessions ------------------------------ */
const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 255;

async function getSession(id) {
  const r = await query("SELECT * FROM livechat_sessions WHERE id=$1", [id]);
  return r.rows[0] || null;
}
async function authVisitor(id, token) {
  const s = await getSession(String(id));
  if (!s || !token || s.token.length !== String(token).length) return null;
  return crypto.timingSafeEqual(Buffer.from(s.token), Buffer.from(String(token))) ? s : null;
}

async function addMessage(session, sender, senderName, body) {
  const r = await query(
    "INSERT INTO livechat_messages(session_id,sender,sender_name,body) VALUES($1,$2,$3,$4) RETURNING id,sender,sender_name,body,created_at",
    [session.id, sender, senderName, body]);
  await query("UPDATE livechat_sessions SET last_activity=NOW() WHERE id=$1", [session.id]);
  const m = r.rows[0];
  toVisitor(session.id, "message", m);
  toAgents("message", { session_id: session.id, ...m });
  return m;
}

async function start({ name, email, message }) {
  // Visitors can start a chat with just a message: name and email are optional.
  message = clean(message, 1000);
  if (!message) throw Object.assign(new Error("Please type your message."), { status: 400 });
  const id = crypto.randomBytes(12).toString("hex"), token = crypto.randomBytes(24).toString("hex");
  name = clean(name, 120) || `Visitor ${id.slice(0, 4).toUpperCase()}`;
  email = clean(email, 255).toLowerCase();
  if (email && !validEmail(email)) email = "";
  await query("INSERT INTO livechat_sessions(id,token,name,email) VALUES($1,$2,$3,$4)", [id, token, name, email]);
  const s = await getSession(id);
  toAgents("session_new", publicSession(s));
  await addMessage(s, "visitor", name, message);
  notifyNewChat(s, message).catch((e) => console.error("[LIVECHAT] new-chat alert failed:", e.message));
  return { id, token };
}

async function notifyNewChat(s, message) {
  const cfg = await getSettings();
  if (!cfg.notify_new_chat || !cfg.forward_emails.length) return;
  const base = String(process.env.WEBSITE_URL || "").replace(/\/+$/, "");
  const link = base ? base + "/agent" : "";
  const text = `New live chat from ${s.name}\n\n"${message}"\n\n${link ? "Reply here: " + link : "Open the agent console (/agent) to reply."}\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px"><h3 style="margin:0 0 8px">New live chat from ${esc(s.name)}</h3><p style="background:#f1f5f9;padding:10px 12px;border-radius:8px;white-space:pre-wrap">${esc(message)}</p><p>${link ? `<a href="${esc(link)}">Open the agent console to reply</a>` : "Open the agent console (/agent) to reply."}</p></div>`;
  for (const to of cfg.forward_emails) await mailer.send({ to, subject: `New live chat - ${s.name}`, html, text });
}

const publicSession = (s) => ({ id: s.id, name: s.name, email: s.email, status: s.status, agent_name: s.agent_name, created_at: s.created_at, last_activity: s.last_activity });

async function messages(id) {
  return (await query("SELECT id,sender,sender_name,body,created_at FROM livechat_messages WHERE session_id=$1 ORDER BY id", [id])).rows;
}

async function visitorSend(s, body) {
  body = clean(body, 1000);
  if (!body) throw Object.assign(new Error("Message is empty."), { status: 400 });
  if (s.status === "closed") throw Object.assign(new Error("This chat has ended."), { status: 409 });
  return addMessage(s, "visitor", s.name, body);
}

async function agentSend(s, agentName, body) {
  body = clean(body, 2000);
  if (!body) throw Object.assign(new Error("Message is empty."), { status: 400 });
  if (s.status === "closed") throw Object.assign(new Error("This chat has ended."), { status: 409 });
  if (s.status === "waiting" || !s.agent_name) {
    await query("UPDATE livechat_sessions SET status='active', agent_name=$2 WHERE id=$1", [s.id, agentName]);
    s.status = "active"; s.agent_name = agentName;
    toVisitor(s.id, "joined", { agent_name: agentName });
    toAgents("session_update", publicSession(s));
  }
  return addMessage(s, "agent", s.agent_name, body);
}

async function listSessions() {
  return (await query(
    `SELECT s.*, (SELECT body FROM livechat_messages m WHERE m.session_id=s.id AND m.sender<>'system' ORDER BY id DESC LIMIT 1) AS last_body
     FROM livechat_sessions s WHERE status<>'closed' OR closed_at > NOW() - INTERVAL '1 day'
     ORDER BY (status='closed'), last_activity DESC LIMIT 100`)).rows;
}

/* ------------------------------ closing + email ------------------------------ */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stamp = (d) => new Date(d).toUTCString().replace(" GMT", " UTC");

function buildTranscript(s, msgs) {
  const lines = msgs.map((m) => `[${stamp(m.created_at)}] ${m.sender === "system" ? "System" : m.sender_name || m.sender}: ${m.body}`);
  const text = `Live chat transcript\nVisitor: ${s.name}${s.email ? ` <${s.email}>` : ""}\nAgent: ${s.agent_name || "(not answered)"}\nStarted: ${stamp(s.created_at)}\n\n${lines.join("\n")}\n`;
  const rows = msgs.map((m) => {
    const who = m.sender === "system" ? "System" : m.sender_name || m.sender;
    const bg = m.sender === "agent" ? "#eef2ff" : m.sender === "visitor" ? "#f1f5f9" : "#fff";
    return `<tr><td style="padding:8px 10px;background:${bg};border-bottom:1px solid #e2e8f0;font:13px/1.5 Arial,sans-serif"><b>${esc(who)}</b> <span style="color:#94a3b8;font-size:11px">${esc(stamp(m.created_at))}</span><br>${esc(m.body).replace(/\n/g, "<br>")}</td></tr>`;
  }).join("");
  const html = `<div style="max-width:640px;font-family:Arial,sans-serif"><h2 style="margin:0 0 6px">Live chat transcript</h2><p style="margin:0 0 14px;color:#475569;font-size:13px">Visitor: ${esc(s.name)}${s.email ? ` &lt;${esc(s.email)}&gt;` : ""}<br>Agent: ${esc(s.agent_name || "(not answered)")}<br>Started: ${esc(stamp(s.created_at))}</p><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${rows}</table></div>`;
  return { text, html };
}

async function closeSession(id, { extraEmails = [], closedBy = "system" } = {}) {
  const claimed = await query(
    "UPDATE livechat_sessions SET status='closed', closed_at=NOW() WHERE id=$1 AND status<>'closed' RETURNING *", [id]);
  const s = claimed.rows[0];
  if (!s) return { alreadyClosed: true, emailed: [] };
  const msgs = await messages(id);
  if (closedBy !== "system") await addMessage({ id }, "system", null, closedBy === "agent" ? "The agent ended this chat." : "The visitor ended this chat.");
  else await addMessage({ id }, "system", null, "This chat ended due to inactivity.");
  toVisitor(id, "closed", {}); toAgents("session_closed", { id });

  const cfg = await getSettings();
  const recipients = [...new Set([cfg.send_visitor_copy ? s.email : "", ...cfg.forward_emails, ...extraEmails]
    .map((e) => String(e || "").trim().toLowerCase()).filter(validEmail))];
  const { text, html } = buildTranscript(s, await messages(id));
  const emailed = [];
  for (const to of recipients) {
    try {
      await mailer.send({ to, subject: `Live chat transcript - ${s.name} (${new Date(s.created_at).toISOString().slice(0, 10)})`, html, text });
      emailed.push(to);
    } catch (e) { console.error("[LIVECHAT] transcript email failed for", to, e.message); }
  }
  await query("UPDATE livechat_sessions SET transcript_sent=$2 WHERE id=$1", [id, emailed.length > 0]);
  return { emailed, failed: recipients.filter((r) => !emailed.includes(r)) };
}

async function closeIdle() {
  const r = await query("SELECT id FROM livechat_sessions WHERE status<>'closed' AND last_activity < NOW() - ($1 || ' milliseconds')::interval", [String(IDLE_MS)]);
  for (const row of r.rows) await closeSession(row.id, { closedBy: "system" });
}

module.exports = { getSettings, saveSettings, initTables, attachVisitor, attachAgent, getSession, authVisitor, start, messages, visitorSend, agentSend, listSessions, closeSession, validEmail, publicSession };
