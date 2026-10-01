"use strict";

const accounts = require("../services/accountService");
const store = require("../services/userStore");
const subscriptions = require("../services/subscriptionService");

const PHONE_RE = /^[0-9+()\-\s.]{5,25}$/;

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/* pg returns DATE columns as Date objects (local midnight) and TIME as "HH:MM:SS". */
function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

function timeOnly(v) {
  return v ? String(v).slice(0, 5) : null;
}

function orderSummary(r) {
  return {
    orderId: r.order_id || String(r.id),
    subject: r.subject,
    status: r.status,
    deadlineDate: dateOnly(r.deadline_date),
    deadlineTime: timeOnly(r.deadline_time),
    submittedAt: r.created_at,
    updatedAt: r.updated_at,
    attachmentCount: Number(r.attachment_count || 0)
  };
}

function safeFileName(name) {
  return String(name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "attachment";
}

async function loadOrders(user, page, limit) {
  const total = await store.countOrders(user);
  const rows = await store.listOrders(user, limit, (page - 1) * limit);
  return {
    orders: rows.map(orderSummary),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

function paging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  return { page, limit };
}

/* GET /api/account/me */
function me(req, res) {
  res.json({ success: true, user: accounts.publicUser(req.user) });
}

/* PATCH /api/account/me  { name?, phone? } */
async function updateMe(req, res) {
  try {
    const name = req.body?.name === undefined ? req.user.name : String(req.body.name).trim().replace(/\s+/g, " ");
    const phone = req.body?.phone === undefined ? (req.user.phone || "") : String(req.body.phone).trim();
    if (name.length < 2 || name.length > 150) return fail(res, 400, "Please enter your full name.");
    if (phone && !PHONE_RE.test(phone)) return fail(res, 400, "Please enter a valid phone number.");
    const updated = await store.updateProfile(req.user.id, { name, phone });
    res.json({ success: true, user: accounts.publicUser(updated) });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    fail(res, 500, "Unable to update your profile.");
  }
}

/* GET /api/account/subscription */
async function subscription(req, res) {
  try {
    res.json({ success: true, subscription: await subscriptions.currentFor(req.user) });
  } catch (error) {
    console.error("SUBSCRIPTION ERROR:", error);
    fail(res, 500, "Unable to load your subscription.");
  }
}

/* POST /api/account/subscription/cancel  |  /resume - stop or restart the automatic monthly renewal */
function changeRenewal(cancel) {
  return async function (req, res) {
    try {
      const sub = await subscriptions.setCancel(req.user, cancel);
      res.json({
        success: true,
        subscription: sub,
        message: cancel
          ? "Your subscription will not renew. You keep unlimited access until the end of the period you already paid for."
          : "Automatic monthly renewal is back on."
      });
    } catch (error) {
      if (!error.status || error.status >= 500) console.error("SUBSCRIPTION CHANGE ERROR:", error);
      fail(res, error.status || 500, error.message || "Unable to update your subscription.");
    }
  };
}
const cancelSubscription = changeRenewal(true);
const resumeSubscription = changeRenewal(false);

/* GET /api/account/orders?page=1&limit=10 */
async function orders(req, res) {
  try {
    const { page, limit } = paging(req);
    res.json({ success: true, ...(await loadOrders(req.user, page, limit)) });
  } catch (error) {
    console.error("ORDERS ERROR:", error);
    fail(res, 500, "Unable to load your orders.");
  }
}

/* GET /api/account/orders/:orderId */
async function orderDetail(req, res) {
  try {
    const orderId = String(req.params.orderId || "").trim().slice(0, 12);
    const row = await store.getOrder(req.user, orderId);
    if (!row) return fail(res, 404, "Order not found.");
    const files = await store.getOrderFiles(row.id);
    res.json({
      success: true,
      order: {
        ...orderSummary(row),
        name: row.name,
        email: row.email,
        phone: row.phone || "",
        details: row.assignment_details,
        files: files.map((f) => ({
          fileId: Number(f.id),
          name: f.original_file_name,
          type: f.mime_type,
          size: Number(f.file_size || 0),
          downloadUrl: `/api/account/orders/${encodeURIComponent(row.order_id)}/files/${f.id}`
        }))
      }
    });
  } catch (error) {
    console.error("ORDER DETAIL ERROR:", error);
    fail(res, 500, "Unable to load this order.");
  }
}

/* GET /api/account/orders/:orderId/files/:fileId  (only the owner's own files) */
async function orderFile(req, res) {
  try {
    const orderId = String(req.params.orderId || "").trim().slice(0, 12);
    const fileId = Number(req.params.fileId);
    if (!Number.isInteger(fileId) || fileId < 1) return res.status(400).send("Invalid file.");
    const file = await store.getOrderFile(req.user, orderId, fileId);
    if (!file || !file.data || !file.data.length) return res.status(404).send("File not found.");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private,no-store,max-age=0");
    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Length", file.data.length);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(file.original_file_name)}"`);
    res.end(file.data);
  } catch (error) {
    console.error("ORDER FILE ERROR:", error);
    res.status(500).send("Unable to retrieve the file.");
  }
}

/* GET /api/account/transactions?page=1&limit=10 - payment history with order id / subscription reference */
async function transactions(req, res) {
  try {
    const { page, limit } = paging(req);
    res.json({ success: true, ...(await subscriptions.transactionsFor(req.user, page, limit)) });
  } catch (error) {
    console.error("TRANSACTIONS ERROR:", error);
    fail(res, 500, "Unable to load your payment history.");
  }
}

/* GET /api/account/overview - profile + subscription + latest orders in one call (dashboard). */
async function overview(req, res) {
  try {
    const [sub, ord, txn] = await Promise.all([
      subscriptions.currentFor(req.user),
      loadOrders(req.user, 1, 10),
      subscriptions.transactionsFor(req.user, 1, 10)
    ]);
    res.json({
      success: true,
      user: accounts.publicUser(req.user),
      subscription: sub,
      orders: ord,
      transactions: txn
    });
  } catch (error) {
    console.error("OVERVIEW ERROR:", error);
    fail(res, 500, "Unable to load your account.");
  }
}

module.exports = { me, updateMe, subscription, cancelSubscription, resumeSubscription, transactions, orders, orderDetail, orderFile, overview };
