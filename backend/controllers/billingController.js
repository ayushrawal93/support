"use strict";

const billing = require("../services/billingService");
const usage = require("../services/usageService");
const subscriptions = require("../services/subscriptionService");

function baseUrl(req) {
  const configured = String(process.env.WEBSITE_URL || "").trim().replace(/\/+$/, "");
  return configured || `${req.protocol}://${req.get("host")}`;
}

async function checkout(req, res) {
  try {
    // Email is optional: a logged-in customer's address is used, otherwise Stripe asks for it on its own page.
    const email = String((req.body && req.body.email) || (req.user && req.user.email) || "").trim().slice(0, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    const url = await billing.createCheckout(email, baseUrl(req), { userId: req.user && req.user.id });
    res.json({ success: true, url });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || "Unable to start checkout." });
  }
}

async function confirm(req, res) {
  try {
    const claims = await billing.confirmSession(String(req.query.session_id || ""));
    usage.issueProCookie(req, res, claims);
    // Attach the subscription to the customer's account (logged in, or matched by email).
    try { await subscriptions.linkFromCheckout(req.user, claims); }
    catch (error) { console.error("[BILLING] Could not link subscription to account:", error.message); }
    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || "Unable to confirm payment." });
  }
}

module.exports = { checkout, confirm };
