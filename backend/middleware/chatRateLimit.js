"use strict";

/*
Small dependency-free sliding-window rate limiter, scoped to the chat
endpoint. Keeps a request timestamp list per IP in memory - fine for a
single Railway instance; if this ever runs on multiple instances, swap
for a shared store (Redis) instead.
*/

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS = 15;

const hits = new Map();

function cleanup(now) {
  for (const [ip, timestamps] of hits) {
    const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
    if (fresh.length) hits.set(ip, fresh);
    else hits.delete(ip);
  }
}

let lastCleanup = 0;

function chatRateLimit(req, res, next) {
  const now = Date.now();
  if (now - lastCleanup > WINDOW_MS) {
    cleanup(now);
    lastCleanup = now;
  }

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "Too many messages - please wait a few minutes and try again."
    });
  }

  timestamps.push(now);
  hits.set(ip, timestamps);
  next();
}

module.exports = { chatRateLimit };
