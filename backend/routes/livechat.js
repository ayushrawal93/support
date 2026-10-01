"use strict";
const express = require("express");
const jwt = require("jsonwebtoken");
const svc = require("../services/liveChatService");

const router = express.Router();
router.use(express.json({ limit: "20kb" }));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status) console.error("[LIVECHAT]", e);
  res.status(e.status || 500).json({ success: false, message: e.status ? e.message : "Something went wrong." });
});

/* tiny per-IP limiter for starting chats + sending messages */
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + req.baseUrl + req.path.split("/").pop(), now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ success: false, message: "Too many requests. Please slow down." });
    arr.push(now); hits.set(k, arr); next();
  };
}
setInterval(() => hits.clear(), 3600 * 1000).unref();

/* ------------------------------ agent (admin login) ------------------------------ */
function agentAuth(req, res, next) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : String(req.query.token || "");
  try {
    const c = jwt.verify(token, process.env.JWT_SECRET);
    if (c.role !== "admin") throw new Error("role");
    req.agent = c; next();
  } catch { res.status(401).json({ success: false, message: "Please log in again." }); }
}

router.get("/agent/stream", agentAuth, (req, res) => svc.attachAgent(req, res));
router.get("/agent/sessions", agentAuth, wrap(async (req, res) => {
  res.json({ success: true, sessions: await svc.listSessions() });
}));
router.get("/agent/sessions/:id/messages", agentAuth, wrap(async (req, res) => {
  const s = await svc.getSession(req.params.id);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  res.json({ success: true, session: svc.publicSession(s), messages: await svc.messages(s.id) });
}));
router.post("/agent/sessions/:id/messages", agentAuth, wrap(async (req, res) => {
  const s = await svc.getSession(req.params.id);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  res.json({ success: true, message: await svc.agentSend(s, req.agent.username, req.body.body) });
}));
router.get("/agent/settings", agentAuth, wrap(async (req, res) => {
  res.json({ success: true, settings: await svc.getSettings() });
}));
router.put("/agent/settings", agentAuth, wrap(async (req, res) => {
  res.json({ success: true, settings: await svc.saveSettings(req.body || {}) });
}));
router.post("/agent/sessions/:id/close", agentAuth, wrap(async (req, res) => {
  const extra = [].concat(req.body.emails || []).map((e) => String(e).trim()).filter(svc.validEmail);
  res.json({ success: true, ...(await svc.closeSession(req.params.id, { extraEmails: extra, closedBy: "agent" })) });
}));

/* ------------------------------ visitor ------------------------------ */
router.post("/start", limit(5, 10 * 60 * 1000), wrap(async (req, res) => {
  res.json({ success: true, ...(await svc.start(req.body || {})) });
}));
router.get("/:id/stream", wrap(async (req, res) => {
  const s = await svc.authVisitor(req.params.id, req.query.token);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  svc.attachVisitor(req, res, s.id);
}));
router.get("/:id/messages", wrap(async (req, res) => {
  const s = await svc.authVisitor(req.params.id, req.query.token);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  res.json({ success: true, status: s.status, agent_name: s.agent_name, messages: await svc.messages(s.id) });
}));
router.post("/:id/messages", limit(30, 5 * 60 * 1000), wrap(async (req, res) => {
  const s = await svc.authVisitor(req.params.id, req.body.token);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  res.json({ success: true, message: await svc.visitorSend(s, req.body.body) });
}));
router.post("/:id/end", wrap(async (req, res) => {
  const s = await svc.authVisitor(req.params.id, req.body.token);
  if (!s) return res.status(404).json({ success: false, message: "Chat not found." });
  const extra = svc.validEmail(String(req.body.email || "").trim()) ? [req.body.email] : [];
  res.json({ success: true, ...(await svc.closeSession(s.id, { extraEmails: extra, closedBy: "visitor" })) });
}));

module.exports = router;
