"use strict";

const { askSiteAssistant } = require("../services/chatService");
const usage = require("../services/usageService");
const billing = require("../services/billingService");
const store = require("../services/userStore");

/* Paid access: the signed cookie from Stripe Checkout, or - for a logged-in customer on any device -
   an active subscription saved on their account. Both are re-checked with Stripe, so the chat stops
   by itself once the paid month ends without renewal. */
async function isPro(req) {
  const claims = usage.readProClaims(req);
  if (claims && (await billing.subscriptionActive(claims.subscription))) return true;
  if (req.user) {
    try {
      const row = await store.getSubscription(req.user.id);
      if (row && row.stripe_subscription_id && (row.status === "active" || row.status === "trialing")) {
        return billing.subscriptionActive(row.stripe_subscription_id);
      }
    } catch (error) {
      console.error("[CHAT] account subscription check failed:", error.message);
    }
  }
  return false;
}

/* Free chats are counted per account when logged in (so clearing cookies doesn't reset them),
   otherwise per browser. */
function usageKey(req, res) {
  return req.user ? "u:" + req.user.id : usage.getVisitorId(req, res);
}

function limitMessage(u) {
  return u && u.blocked === "time"
    ? `Your free ${u.windowMinutes} minutes are over. Subscribe for $20/month to keep chatting.`
    : `You've used your ${u ? u.limit : ""} free chats. Subscribe for $20/month to keep chatting.`;
}

function parseHistory(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function status(req, res) {
  const visitorId = usageKey(req, res);
  const pro = await isPro(req);
  const info = pro ? usage.usageInfo(0, true) : await usage.peek(visitorId);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, usage: info });
}

async function ask(req, res) {
  const visitorId = usageKey(req, res);
  const pro = await isPro(req);
  let reservation = null;

  try {
    const body = req.body || {};
    const files = req.files || [];

    if (!pro) {
      reservation = await usage.reserve(req, visitorId);
      if (!reservation.allowed) {
        return res.status(402).json({
          success: false,
          code: "LIMIT_REACHED",
          reason: reservation.usage.blocked || "chats",
          message: limitMessage(reservation.usage),
          usage: reservation.usage
        });
      }
    }

    const result = await askSiteAssistant({
      message: body.message,
      history: parseHistory(body.history),
      files,
      fileContext: body.fileContext
    });

    res.json({
      success: true,
      reply: result.reply,
      fileContext: result.fileContext,
      notice: result.notice || undefined,
      usage: pro ? usage.usageInfo(0, true) : reservation.usage
    });
  } catch (error) {
    if (reservation && reservation.allowed) {
      await usage.release(visitorId, reservation.ipKey).catch(() => {});
    }
    const status = error.status || 500;
    if (status >= 500) console.error("[CHAT ERROR]", error);
    res.status(status).json({
      success: false,
      message: error.message || "Unable to answer right now."
    });
  }
}

module.exports = { ask, status };
