"use strict";

/*
 * One place that actually delivers email.
 *
 * WHY THIS EXISTS: Railway (and most PaaS hosts) block outbound SMTP ports
 * (25 / 465 / 587) on Free, Trial and Hobby plans, so Gmail SMTP silently times out.
 * HTTPS (port 443) is never blocked, so the preferred providers below use an HTTP API.
 *
 * Provider is chosen automatically, first match wins:
 *   1. BREVO_API_KEY   -> Brevo (free 300 emails/day, lets you verify a single sender
 *                         address such as your Gmail - no domain needed)
 *   2. RESEND_API_KEY  -> Resend (needs a verified domain to email arbitrary customers)
 *   3. SMTP_USER + SMTP_PASS -> SMTP (Gmail app password). Works on Railway Pro / other hosts.
 *
 * Sender address: MAIL_FROM, else SMTP_FROM, else SMTP_USER.
 *   "Assignment Help <you@gmail.com>"  or just  "you@gmail.com"
 */

const nodemailer = require("nodemailer");

const env = (k) => String(process.env[k] || "").trim();

function fromAddress() {
  return env("MAIL_FROM") || env("SMTP_FROM") || env("SMTP_USER");
}

function provider() {
  if (env("BREVO_API_KEY")) return "brevo";
  if (env("RESEND_API_KEY")) return "resend";
  if (env("SMTP_USER") && env("SMTP_PASS")) return "smtp";
  return null;
}

function isConfigured() {
  return Boolean(provider() && fromAddress());
}

/* "Name <a@b.com>" -> { name, email } */
function parseFrom(v) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: v.trim() };
}

function fail(message, status, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/* ---------------------------- SMTP ---------------------------- */
let smtp = null;
function smtpTransport() {
  if (smtp) return smtp;
  const port = Number(env("SMTP_PORT")) || 465;
  smtp = nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port,
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE").toLowerCase() === "true" : port === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
    // Fail in seconds instead of hanging, so the real reason reaches the logs.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return smtp;
}

async function sendSmtp(m) {
  return smtpTransport().sendMail({
    from: fromAddress(), to: m.to, replyTo: m.replyTo, subject: m.subject,
    html: m.html, text: m.text,
    attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") }))
  });
}

/* ---------------------------- Brevo ---------------------------- */
async function sendBrevo(m) {
  const from = parseFrom(fromAddress());
  const body = {
    sender: from,
    to: [].concat(m.to).map((email) => ({ email })),
    subject: m.subject,
    htmlContent: m.html,
    textContent: m.text || undefined,
    replyTo: m.replyTo ? { email: m.replyTo } : undefined,
    attachment: (m.attachments || []).length
      ? m.attachments.map((a) => ({ name: a.filename, content: a.content }))
      : undefined
  };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`Brevo ${res.status}: ${data.message || res.statusText}`, res.status, "BREVO_" + res.status);
  return { messageId: data.messageId };
}

/* ---------------------------- Resend ---------------------------- */
async function sendResend(m) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [].concat(m.to),
      reply_to: m.replyTo || undefined,
      subject: m.subject,
      html: m.html,
      text: m.text || undefined,
      attachments: (m.attachments || []).length ? m.attachments.map((a) => ({ filename: a.filename, content: a.content })) : undefined
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`Resend ${res.status}: ${data.message || res.statusText}`, res.status, "RESEND_" + res.status);
  return { messageId: data.id };
}

/*
 * send({ to, subject, html, text?, replyTo?, attachments?: [{filename, content(base64)}] })
 * Throws with the REAL reason (also logged) so problems are diagnosable from the Railway logs.
 */
async function send(m) {
  const p = provider();
  if (!p || !fromAddress()) throw fail("Email is not configured on the server.", 503, "NOT_CONFIGURED");
  try {
    if (p === "brevo") return await sendBrevo(m);
    if (p === "resend") return await sendResend(m);
    return await sendSmtp(m);
  } catch (error) {
    const hint =
      p === "smtp" && /ETIMEDOUT|ECONNREFUSED|ESOCKET|ENETUNREACH|Greeting never received|Connection timeout/i.test(`${error.code} ${error.message}`)
        ? " -> The host is blocking outbound SMTP (Railway does this on Free/Hobby plans). Set BREVO_API_KEY to send over HTTPS instead."
        : p === "smtp" && error.code === "EAUTH"
          ? " -> Gmail rejected the login. SMTP_PASS must be a 16-character Google App Password (2-Step Verification on), not your normal password."
          : "";
    console.error(`[MAIL] ${p} send failed (${error.code || "no-code"}): ${error.message}${hint}`);
    throw error;
  }
}

async function verify() {
  const p = provider();
  if (!p) return { configured: false, verified: false, provider: null, error: "No email provider configured." };
  try {
    if (p === "smtp") await smtpTransport().verify();
    else if (p === "brevo") {
      const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": env("BREVO_API_KEY") }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`Brevo rejected the API key (${r.status}).`);
    }
    return { configured: true, verified: true, provider: p };
  } catch (error) {
    return { configured: true, verified: false, provider: p, error: error.message };
  }
}

module.exports = { send, verify, isConfigured, provider, fromAddress };
