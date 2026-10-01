"use strict";

/*
 * All SQL for customer accounts lives here so the controllers stay readable
 * and the queries are easy to audit. Every query is parameterised.
 */

const { query } = require("../config/database");

/* ------------------------------ users ------------------------------ */

async function findById(id) {
  const r = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
  return r.rows[0] || null;
}

async function findByEmail(email) {
  const r = await query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
  return r.rows[0] || null;
}

async function findByCode(code) {
  const r = await query("SELECT * FROM users WHERE LOWER(user_code) = LOWER($1) LIMIT 1", [code]);
  return r.rows[0] || null;
}

async function findByGoogleSub(sub) {
  const r = await query("SELECT * FROM users WHERE google_sub = $1 LIMIT 1", [sub]);
  return r.rows[0] || null;
}

async function insertUser(u) {
  const r = await query(
    `INSERT INTO users
       (user_code, name, email, phone, password_hash, auth_provider, google_sub, avatar_url,
        must_change_password, email_verified, password_set, verify_token_hash, verify_expires)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [u.userCode, u.name, u.email, u.phone || null, u.passwordHash, u.provider, u.googleSub || null, u.avatarUrl || null,
     !!u.mustChangePassword, !!u.emailVerified, u.passwordSet !== false, u.verifyTokenHash || null, u.verifyExpires || null]
  );
  return r.rows[0];
}

async function deleteUser(id) {
  await query("DELETE FROM users WHERE id = $1", [id]);
}

async function setPassword(id, passwordHash, mustChangePassword) {
  await query(
    "UPDATE users SET password_hash = $2, must_change_password = $3, password_set = TRUE, updated_at = NOW() WHERE id = $1",
    [id, passwordHash, mustChangePassword]
  );
}

async function setUserCode(id, code) {
  const r = await query("UPDATE users SET user_code = $2, updated_at = NOW() WHERE id = $1 RETURNING *", [id, code]);
  return r.rows[0] || null;
}

async function touchLogin(id) {
  await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [id]);
}

async function setVerifyToken(id, tokenHash, expires) {
  await query("UPDATE users SET verify_token_hash = $2, verify_expires = $3 WHERE id = $1", [id, tokenHash, expires]);
}

/* Marks the email verified if the token matches and has not expired. Returns the user or null. */
async function verifyByToken(tokenHash) {
  const r = await query(
    `UPDATE users
        SET email_verified = TRUE, verify_token_hash = NULL, verify_expires = NULL, updated_at = NOW()
      WHERE verify_token_hash = $1 AND verify_expires > NOW()
      RETURNING *`,
    [tokenHash]
  );
  return r.rows[0] || null;
}

async function linkGoogle(id, sub, avatarUrl, resetHash) {
  // Google has verified this address, so the account's email becomes verified too.
  // If the account was NOT verified before, someone else may have registered this address and
  // chosen its password - so that password is replaced (resetHash) and the real owner sets a new one.
  const r = await query(
    `UPDATE users
        SET google_sub = $2,
            avatar_url = COALESCE(avatar_url, $3),
            password_hash = CASE WHEN email_verified THEN password_hash ELSE $4 END,
            password_set = CASE WHEN email_verified THEN password_set ELSE FALSE END,
            email_verified = TRUE,
            verify_token_hash = NULL,
            verify_expires = NULL,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, sub, avatarUrl || null, resetHash || null]
  );
  return r.rows[0];
}

async function updateProfile(id, { name, phone }) {
  const r = await query(
    "UPDATE users SET name = $2, phone = $3, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, name, phone || null]
  );
  return r.rows[0];
}

/* --------------------------- subscriptions -------------------------- */

async function getSubscription(userId) {
  const r = await query(
    `SELECT * FROM subscriptions
      WHERE user_id = $1
      ORDER BY (status IN ('active','trialing')) DESC, updated_at DESC
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function upsertSubscription(userId, s) {
  const r = await query(
    `INSERT INTO subscriptions
       (user_id, stripe_customer_id, stripe_subscription_id, plan, status,
        amount_cents, currency, billing_interval, current_period_end, cancel_at_period_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (stripe_subscription_id) DO UPDATE
        SET status = EXCLUDED.status,
            amount_cents = COALESCE(EXCLUDED.amount_cents, subscriptions.amount_cents),
            currency = COALESCE(EXCLUDED.currency, subscriptions.currency),
            billing_interval = COALESCE(EXCLUDED.billing_interval, subscriptions.billing_interval),
            current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            updated_at = NOW()
     RETURNING *`,
    [
      userId, s.customerId || null, s.subscriptionId || null, s.plan || "Unlimited AI assistant",
      s.status || "active", s.amountCents == null ? null : s.amountCents, s.currency || null,
      s.interval || null, s.currentPeriodEnd || null, !!s.cancelAtPeriodEnd
    ]
  );
  return r.rows[0];
}

/* --------------------------- transactions --------------------------- */
/* One row per paid Stripe invoice (the first payment and every monthly renewal). The order_id is
   ours (shown to the customer); reference is the Stripe subscription it belongs to. */

const TXN_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newTxnOrderId() {
  const crypto = require("crypto");
  let s = "";
  for (let i = 0; i < 8; i++) s += TXN_CHARS[crypto.randomInt(TXN_CHARS.length)];
  return "TXN-" + s;
}

async function upsertTransaction(userId, t) {
  const r = await query(
    `INSERT INTO transactions
       (user_id, order_id, reference, invoice_number, stripe_invoice_id, description,
        amount_cents, currency, status, paid_at, receipt_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (stripe_invoice_id) DO UPDATE
        SET status = EXCLUDED.status,
            amount_cents = EXCLUDED.amount_cents,
            paid_at = COALESCE(EXCLUDED.paid_at, transactions.paid_at),
            receipt_url = COALESCE(EXCLUDED.receipt_url, transactions.receipt_url)
     RETURNING *`,
    [userId, newTxnOrderId(), t.reference || null, t.invoiceNumber || null, t.invoiceId || null,
     t.description || null, t.amountCents == null ? null : t.amountCents, t.currency || null,
     t.status || "paid", t.paidAt || null, t.receiptUrl || null]
  );
  return r.rows[0];
}

async function countTransactions(userId) {
  const r = await query("SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1", [userId]);
  return r.rows[0].n;
}

async function listTransactions(userId, limit, offset) {
  const r = await query(
    `SELECT * FROM transactions WHERE user_id = $1
      ORDER BY COALESCE(paid_at, created_at) DESC, id DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return r.rows;
}

/* ------------------------------ orders ------------------------------ */
/* An order belongs to the account if it was submitted while logged in
   (user_id) or with the account's email address. */

/* Matching by email is only allowed once the account's email is verified; otherwise anyone could
   sign up with someone else's address and read that person's orders. $3 = verified flag. */
const OWNER = "(s.user_id = $1 OR (LOWER(s.email) = LOWER($2) AND $3::boolean))";

function ownerParams(user, extra = []) {
  return [user.id, user.email, !!user.email_verified, ...extra];
}

async function countOrders(user) {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM submissions s WHERE ${OWNER}`,
    ownerParams(user)
  );
  return r.rows[0].n;
}

async function listOrders(user, limit, offset) {
  const r = await query(
    `SELECT s.id, s.order_id, s.subject, s.deadline_date, s.deadline_time, s.status,
            s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM submission_files f WHERE f.submission_id = s.id) AS attachment_count
       FROM submissions s
      WHERE ${OWNER}
      ORDER BY s.created_at DESC
      LIMIT $4 OFFSET $5`,
    ownerParams(user, [limit, offset])
  );
  return r.rows;
}

async function getOrder(user, orderId) {
  const r = await query(
    `SELECT s.id, s.order_id, s.name, s.email, s.phone, s.subject, s.assignment_details,
            s.deadline_date, s.deadline_time, s.status, s.created_at, s.updated_at
       FROM submissions s
      WHERE s.order_id = $4 AND ${OWNER}
      LIMIT 1`,
    ownerParams(user, [orderId])
  );
  return r.rows[0] || null;
}

async function getOrderFiles(submissionId) {
  const r = await query(
    `SELECT id, original_file_name, mime_type, file_size
       FROM submission_files WHERE submission_id = $1 ORDER BY id`,
    [submissionId]
  );
  return r.rows;
}

async function getOrderFile(user, orderId, fileId) {
  const r = await query(
    `SELECT f.original_file_name, f.mime_type, f.data
       FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
      WHERE f.id = $5 AND s.order_id = $4 AND ${OWNER}
      LIMIT 1`,
    ownerParams(user, [orderId, fileId])
  );
  return r.rows[0] || null;
}

module.exports = {
  findById, findByEmail, findByCode, findByGoogleSub, insertUser, deleteUser,
  setPassword, setUserCode, touchLogin, linkGoogle, setVerifyToken, verifyByToken, updateProfile,
  getSubscription, upsertSubscription,
  upsertTransaction, countTransactions, listTransactions,
  countOrders, listOrders, getOrder, getOrderFiles, getOrderFile
};
