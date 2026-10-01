"use strict";

/* Ties Stripe subscriptions to customer accounts and shapes them for the API. */

const store = require("./userStore");
const billing = require("./billingService");
const usage = require("./usageService");

const STALE_MS = 10 * 60 * 1000;

/* After a confirmed Checkout: save the subscription on the logged-in account,
   or on the account that owns the paying email. */
async function linkFromCheckout(user, claims) {
  const details = claims && claims.details;
  if (!details || !details.subscriptionId) return null;
  let owner = user || null;
  if (!owner && claims.email) {
    const byEmail = await store.findByEmail(String(claims.email).toLowerCase());
    // Only attach to an account whose email is verified, so a sign-up with someone else's address can't claim their plan.
    if (byEmail && byEmail.email_verified) owner = byEmail;
  }
  if (!owner) return null;
  const saved = await store.upsertSubscription(owner.id, details);
  await syncTransactions(owner.id, details.subscriptionId, true);   // first payment shows up straight away
  return saved;
}

/* Copies the subscription's paid Stripe invoices into the account's transaction history.
   Throttled, because the account page asks for it often; renewals appear the next time it is opened. */
const lastSync = new Map();
const SYNC_MS = 5 * 60 * 1000;

async function syncTransactions(userId, subscriptionId, force) {
  if (!subscriptionId) return;
  const key = userId + ":" + subscriptionId;
  if (!force && Date.now() - (lastSync.get(key) || 0) < SYNC_MS) return;
  lastSync.set(key, Date.now());
  try {
    const invoices = await billing.fetchInvoices(subscriptionId);
    for (const inv of invoices) await store.upsertTransaction(userId, inv);
  } catch (error) {
    console.error("[BILLING] Could not save transactions:", error.message);
  }
}

function shapeTransaction(t) {
  return {
    orderId: t.order_id,
    reference: t.reference || null,
    invoiceNumber: t.invoice_number || null,
    description: t.description || "Subscription payment",
    amount: money(t.amount_cents, t.currency),
    status: t.status,
    paidAt: t.paid_at || t.created_at,
    receiptUrl: t.receipt_url || null
  };
}

async function transactionsFor(user, page, limit) {
  const sub = await store.getSubscription(user.id);
  if (sub && sub.stripe_subscription_id) await syncTransactions(user.id, sub.stripe_subscription_id, false);
  const total = await store.countTransactions(user.id);
  const rows = await store.listTransactions(user.id, limit, (page - 1) * limit);
  return { items: rows.map(shapeTransaction), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function money(cents, currency) {
  if (cents == null) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || ""}`.trim();
  }
}

function shape(row) {
  if (!row) {
    return {
      active: false, plan: "Free", status: "none",
      freeChats: usage.FREE_LIMIT, freeMinutes: usage.FREE_WINDOW_MINUTES,
      message: `Your free plan includes ${usage.FREE_LIMIT} chats or ${usage.FREE_WINDOW_MINUTES} minutes, whichever ends first. After that the chat continues with the $20/month plan.`
    };
  }
  const active = row.status === "active" || row.status === "trialing";
  return {
    active,
    plan: row.plan,
    status: row.status,
    price: money(row.amount_cents, row.currency),
    interval: row.billing_interval || null,
    startedAt: row.created_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    message: !active
      ? "Your subscription is not active."
      : row.cancel_at_period_end
        ? "Cancellation is scheduled. You keep unlimited access until the date below and will not be charged again."
        : "Your plan is active. It renews automatically every month until you cancel, and you can cancel anytime."
  };
}

/* The account's current subscription, re-checked with Stripe when the saved copy is stale. */
async function currentFor(user) {
  let row = await store.getSubscription(user.id);
  if (row && row.stripe_subscription_id && Date.now() - new Date(row.updated_at).getTime() > STALE_MS) {
    const fresh = await billing.fetchSubscription(row.stripe_subscription_id);
    if (fresh) row = await store.upsertSubscription(user.id, fresh);
  }
  return shape(row);
}

/* Cancel (or resume) the automatic monthly renewal of the account's subscription. */
async function setCancel(user, cancel) {
  const row = await store.getSubscription(user.id);
  if (!row || !row.stripe_subscription_id || !(row.status === "active" || row.status === "trialing")) {
    const err = new Error("You don't have an active subscription.");
    err.status = 404;
    throw err;
  }
  const details = await billing.setCancelAtPeriodEnd(row.stripe_subscription_id, cancel);
  const saved = await store.upsertSubscription(user.id, details);
  return shape(saved);
}

module.exports = { linkFromCheckout, currentFor, shape, transactionsFor, setCancel };
