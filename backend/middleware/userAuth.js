"use strict";

/*
 * Customer session handling (separate from the admin login).
 *
 * The session is a signed JWT in an httpOnly, SameSite=Lax cookie (ah_user);
 * "Authorization: Bearer <token>" is also accepted for API clients.
 * It is signed with a key derived from JWT_SECRET (or USER_JWT_SECRET), never
 * with JWT_SECRET itself, so a customer token can never pass as an admin token.
 * Changing the password invalidates every older session.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const store = require("../services/userStore");

const COOKIE = "ah_user";
const SESSION_DAYS = Math.max(1, Number(process.env.USER_SESSION_DAYS || 14));

function secret() {
  const explicit = String(process.env.USER_JWT_SECRET || "").trim();
  if (explicit) return explicit;
  const base = String(process.env.JWT_SECRET || "").trim();
  if (!base) return null;
  return crypto.createHmac("sha256", base).update("customer-session-v1").digest("hex");
}

function pwVersion(user) {
  return crypto.createHash("sha256").update(String(user.password_hash)).digest("hex").slice(0, 16);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
    }
  });
  return out;
}

function cookieString(req, value, maxAge) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (req.secure || process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function hintCookie(req, value, maxAge) {
  // Not HttpOnly on purpose: it carries no secret, it only tells the page whether to ask /api/account/me.
  const parts = [`ah_in=${value}`, "Path=/", `Max-Age=${maxAge}`, "SameSite=Lax"];
  if (req.secure || process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function issueSession(req, res, user) {
  const key = secret();
  if (!key) throw new Error("JWT_SECRET is not configured.");
  const token = jwt.sign(
    { typ: "customer", sub: String(user.id), uc: user.user_code, pv: pwVersion(user) },
    key,
    { expiresIn: `${SESSION_DAYS}d` }
  );
  res.append("Set-Cookie", cookieString(req, token, SESSION_DAYS * 24 * 60 * 60));
  res.append("Set-Cookie", hintCookie(req, "1", SESSION_DAYS * 24 * 60 * 60));
}

function clearSession(req, res) {
  res.append("Set-Cookie", cookieString(req, "", 0));
  res.append("Set-Cookie", hintCookie(req, "", 0));
}

function readToken(req) {
  const h = String(req.headers.authorization || "");
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return parseCookies(req)[COOKIE] || null;
}

async function resolveUser(req) {
  const token = readToken(req);
  const key = secret();
  if (!token || !key) return null;
  let claims;
  try {
    claims = jwt.verify(token, key, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  if (!claims || claims.typ !== "customer") return null;
  const user = await store.findById(claims.sub);
  if (!user || !user.is_active || claims.pv !== pwVersion(user)) return null;
  return user;
}

async function requireUser(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ success: false, message: "Please log in to continue." });
    req.user = user;
    next();
  } catch (error) {
    console.error("[AUTH] session check failed:", error);
    res.status(500).json({ success: false, message: "Unable to verify your session." });
  }
}

/* Attaches req.user when a valid session exists; never blocks the request. */
async function optionalUser(req, res, next) {
  try { req.user = (await resolveUser(req)) || null; } catch { req.user = null; }
  next();
}

module.exports = { requireUser, optionalUser, issueSession, clearSession };
