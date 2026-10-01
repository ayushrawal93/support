"use strict";

/*
 * Verifies a Google Sign-In ID token ("credential") without extra packages:
 * the signature is checked against Google's published public keys (JWKS), then
 * audience, issuer, expiry and email_verified are enforced.
 *
 * Env:
 *   GOOGLE_CLIENT_ID          OAuth 2.0 Web client ID (…apps.googleusercontent.com)
 *   GOOGLE_ALLOWED_DOMAINS    optional, comma separated (e.g. gmail.com). Blank = any Google account.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let cache = { keys: null, expires: 0 };

function clientId() {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function isConfigured() {
  return !!clientId();
}

async function loadKeys(force) {
  if (!force && cache.keys && Date.now() < cache.expires) return cache.keys;
  const res = await fetch(CERTS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Google keys request failed (${res.status})`);
  const data = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  cache = { keys: data.keys || [], expires: Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : 3600 * 1000) };
  return cache.keys;
}

function bad(message, status = 401) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function verifyIdToken(idToken) {
  if (!isConfigured()) throw bad("Google sign-in isn't switched on for this site yet.", 503);
  const token = String(idToken || "");
  if (token.length < 100 || token.length > 4096) throw bad("Invalid Google sign-in.");

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || decoded.header.alg !== "RS256" || !decoded.header.kid) {
    throw bad("Invalid Google sign-in.");
  }

  let jwk = (await loadKeys(false)).find((k) => k.kid === decoded.header.kid);
  if (!jwk) jwk = (await loadKeys(true)).find((k) => k.kid === decoded.header.kid); // keys rotated
  if (!jwk) throw bad("Invalid Google sign-in.");

  const pem = crypto.createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "pem" });

  let claims;
  try {
    claims = jwt.verify(token, pem, { algorithms: ["RS256"], audience: clientId(), issuer: ISSUERS });
  } catch (error) {
    throw bad("Google sign-in expired or invalid. Please try again.");
  }

  const email = String(claims.email || "").trim().toLowerCase();
  if (!claims.sub || !email) throw bad("Your Google account did not share an email address.");
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw bad("Your Google email address is not verified.");
  }

  const allowed = String(process.env.GOOGLE_ALLOWED_DOMAINS || "")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email.split("@")[1])) {
    throw bad(`Please sign in with a ${allowed.join(" / ")} account.`, 403);
  }

  return {
    sub: String(claims.sub),
    email,
    name: String(claims.name || email.split("@")[0]).trim().slice(0, 150),
    picture: claims.picture ? String(claims.picture).slice(0, 500) : null
  };
}

module.exports = { verifyIdToken, isConfigured, clientId };
