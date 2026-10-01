"use strict";

/*
 * Small in-memory sliding-window limiters for the auth endpoints (fine for one
 * instance; move to Redis if you ever scale out). Sign-in details are emailed,
 * so signup / forgot-password limits also stop the site being used to spam an inbox.
 */

function makeLimiter({ windowMs, max, message, keyFn }) {
  const hits = new Map();
  let lastSweep = 0;

  function sweep(now) {
    for (const [k, list] of hits) {
      const fresh = list.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
    lastSweep = now;
  }

  function fresh(key, now) {
    return (hits.get(key) || []).filter((t) => now - t < windowMs);
  }

  /* count(key): events currently in the window. hit(key): record one. */
  function count(key) {
    return fresh(key, Date.now()).length;
  }

  function hit(key) {
    const now = Date.now();
    if (now - lastSweep > windowMs) sweep(now);
    const list = fresh(key, now);
    list.push(now);
    hits.set(key, list);
  }

  /* take(key) -> true if allowed (and records the event) */
  function take(key) {
    if (count(key) >= max) return false;
    hit(key);
    return true;
  }

  function middleware(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.ip || "unknown");
    if (!take(key)) return res.status(429).json({ success: false, message });
    next();
  }
  middleware.take = take;
  middleware.count = count;
  middleware.hit = hit;
  middleware.max = max;
  return middleware;
}

const ip = (req) => req.ip || (req.socket && req.socket.remoteAddress) || "unknown";

const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000, max: 20,
  message: "Too many sign-in attempts. Please wait a few minutes and try again."
});

const signupLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, max: 8,
  message: "Too many sign-up requests from this network. Please try again later."
});

const forgotLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, max: 6,
  message: "Too many requests. Please try again later."
});

/* Per-account: at most 3 password emails per address per hour. */
const perEmailLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 3, message: "" });

/* Per-account failed logins: 8 wrong passwords per identifier per 15 minutes. */
const failedLoginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 8, message: "" });

module.exports = { makeLimiter, loginLimiter, signupLimiter, forgotLimiter, perEmailLimiter, failedLoginLimiter, ip };
