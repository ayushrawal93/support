"use strict";

/*
 * Account rules: ID/password generation, hashing, creating accounts and
 * issuing credentials by email.
 */

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const store = require("./userStore");
const emailer = require("./accountEmailService");

const BCRYPT_ROUNDS = 12;
// No 0/O, 1/I/l - IDs and passwords are read from an email and typed by hand.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function pick(chars) {
  return chars[crypto.randomInt(chars.length)];
}

function generateUserCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += pick(CODE_CHARS);
  return "AH-" + s;
}

/** 12 characters, always containing an upper-case letter, a lower-case letter and a digit. */
function generatePassword(length = 12) {
  const all = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase().slice(0, 254);
}

function isValidEmail(v) {
  return EMAIL_RE.test(v);
}

const USER_ID_RE = /^[A-Za-z0-9._-]{4,16}$/;
const RESERVED_IDS = new Set(["admin", "administrator", "support", "root", "system", "help", "staff", "owner", "moderator", "assignmenthelp"]);

/** null if the chosen User ID is acceptable, otherwise the message to show. */
function validateUserId(raw) {
  const v = String(raw || "").trim();
  if (!USER_ID_RE.test(v)) return "Use 4-16 letters, numbers, dots, dashes or underscores.";
  if (/^ah-/i.test(v)) return "That User ID is reserved. Please pick another.";   // generated IDs use the AH- prefix
  if (RESERVED_IDS.has(v.toLowerCase())) return "That User ID isn't available.";
  return null;
}

/** An email, or a User ID (custom or the older AH-XXXXXXXX form) -> lookup key. */
function parseIdentifier(raw) {
  const v = String(raw || "").trim();
  if (v.includes("@")) return { type: "email", value: normalizeEmail(v) };
  if (/^AH-?[A-Za-z0-9]{8}$/i.test(v.replace(/\s+/g, ""))) {
    const m = v.replace(/\s+/g, "").toUpperCase().match(/^AH-?([A-Z0-9]{8})$/);
    return { type: "code", value: "AH-" + m[1] };
  }
  return USER_ID_RE.test(v) ? { type: "code", value: v } : null;
}

/* Google sign-in: the User ID is the part of the address before the @ (skrawal@gmail.com -> skrawal).
   Characters the User ID rules don't allow are dropped, it is cut to 16 characters, and if that is
   too short, reserved or already taken a short number is added so the ID stays unique. */
function usernameBase(email) {
  let base = String(email || "").split("@")[0].replace(/[^A-Za-z0-9._-]/g, "");
  if (/^ah-/i.test(base)) base = base.replace(/^ah-+/i, "");
  return base.slice(0, 16);
}

async function googleUserId(email, attempt = 0) {
  const base = usernameBase(email) || "user";
  for (let i = 0; i < 12; i++) {
    let candidate;
    if (attempt === 0 && i === 0) candidate = base;
    else candidate = base.slice(0, 12) + String(crypto.randomInt(100, 10000));
    while (candidate.length < 4) candidate += String(crypto.randomInt(10));
    candidate = candidate.slice(0, 16);
    if (validateUserId(candidate)) continue;                 // reserved or malformed
    if (!(await store.findByCode(candidate))) return candidate;
  }
  return generateUserCode();                                 // extremely unlikely fallback
}

/* An older account that only has a generated AH-XXXXXXXX ID switches to the Gmail username the first
   time Google sign-in is used with it. IDs the customer chose themselves are never changed. */
async function adoptGoogleUsername(user) {
  if (!user || !/^AH-/i.test(String(user.user_code || ""))) return user;
  const wanted = usernameBase(user.email);
  if (validateUserId(wanted) || (await store.findByCode(wanted))) return user;
  try {
    return (await store.setUserCode(user.id, wanted)) || user;
  } catch (error) {
    if (error && error.code === "23505") return user;        // someone took it a moment ago
    throw error;
  }
}

function validatePasswordStrength(pw) {
  const p = String(pw || "");
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 72) return "Password must be 72 characters or fewer.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Password must contain letters and numbers.";
  return null;
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

let dummyHash = null;
/** Constant-ish work when the account does not exist, so timing doesn't reveal which IDs are registered. */
async function verifyPassword(user, pw) {
  if (!user) {
    if (!dummyHash) dummyHash = await bcrypt.hash("not-a-real-password", BCRYPT_ROUNDS);
    await bcrypt.compare(String(pw || ""), dummyHash);
    return false;
  }
  return bcrypt.compare(String(pw || ""), user.password_hash);
}

async function findByIdentifier(raw) {
  const id = parseIdentifier(raw);
  if (!id) return null;
  return id.type === "email" ? store.findByEmail(id.value) : store.findByCode(id.value);
}

function publicUser(u) {
  return {
    userId: u.user_code,
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    provider: u.auth_provider,
    avatarUrl: u.avatar_url || null,
    mustChangePassword: !!u.must_change_password,
    emailVerified: !!u.email_verified,
    hasPassword: u.password_set !== false,
    memberSince: u.created_at,
    lastLogin: u.last_login_at || null
  };
}

const VERIFY_HOURS = 48;
const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

function siteUrl() {
  return String(process.env.WEBSITE_URL || "").trim().replace(/\/+$/, "");
}

function newVerifyToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: sha256(token), expires: new Date(Date.now() + VERIFY_HOURS * 3600 * 1000) };
}

function verifyLink(req, token) {
  const base = siteUrl() || (req ? `${req.protocol}://${req.get("host")}` : "");
  return `${base}/api/auth/verify?token=${token}`;
}

/*
 * Create an account.
 *  - manual: the customer chose `password`; email is unverified until they click the link.
 *  - google: Google already verified the address; no password exists until the customer sets one.
 * Sending email is best-effort and NEVER blocks or rolls back sign-up (a mail outage must not
 * stop customers from getting an account).
 */
async function createAccount({ name, email, phone, provider, googleSub, avatarUrl, password, userId, req }) {
  const isGoogle = provider === "google";
  const passwordHash = await hashPassword(isGoogle ? generatePassword(24) : password);
  const verify = isGoogle ? null : newVerifyToken();

  let user = null;
  let code = userId || (isGoogle ? await googleUserId(email, 0) : null);
  for (let attempt = 0; attempt < 6 && !user; attempt++) {
    try {
      user = await store.insertUser({
        userCode: code || generateUserCode(),
        name, email, phone, provider, googleSub, avatarUrl,
        passwordHash,
        mustChangePassword: false,
        emailVerified: isGoogle,
        passwordSet: !isGoogle,
        verifyTokenHash: verify ? verify.hash : null,
        verifyExpires: verify ? verify.expires : null
      });
    } catch (error) {
      if (error && error.code === "23505") {
        if (/user_?code/i.test(String(error.constraint || ""))) {
          if (userId) {                       // the customer picked this ID and someone beat them to it
            const taken = new Error("That User ID is already taken. Please choose another.");
            taken.status = 409; taken.field = "userId";
            throw taken;
          }
          code = isGoogle ? await googleUserId(email, attempt + 1) : null;
          continue;                           // generated ID collided: try another
        }
        const dup = new Error("An account with this email already exists.");
        dup.status = 409;
        throw dup;
      }
      throw error;
    }
  }
  if (!user) throw new Error("Could not allocate a user ID.");

  let emailSent = false;
  try {
    await emailer.sendWelcome({
      name: user.name, email: user.email, userCode: user.user_code, provider,
      verifyUrl: verify ? verifyLink(req, verify.token) : null
    });
    emailSent = true;
  } catch (error) {
    console.error("[AUTH] Welcome email failed (account was still created):", error.message);
  }
  return { user, emailSent };
}

/* Fresh confirm link for an existing, unverified account. */
async function resendVerification(user, req) {
  const v = newVerifyToken();
  await store.setVerifyToken(user.id, v.hash, v.expires);
  await emailer.sendVerification({ name: user.name, email: user.email, verifyUrl: verifyLink(req, v.token) });
}

async function verifyEmailToken(token) {
  const t = String(token || "");
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  return store.verifyByToken(sha256(t));
}

/* Issue a fresh password (forgot-password). Returns false if nothing was sent. */
async function resetPassword(user) {
  const password = generatePassword();
  await emailer.sendCredentials({
    name: user.name, email: user.email, userCode: user.user_code, password, reason: "reset"
  });
  // Only replace the stored password once the email has actually gone out.
  await store.setPassword(user.id, await hashPassword(password), true);
  return true;
}

module.exports = {
  generateUserCode, generatePassword, normalizeEmail, isValidEmail, parseIdentifier,
  validatePasswordStrength, hashPassword, verifyPassword, findByIdentifier,
  publicUser, validateUserId, googleUserId, adoptGoogleUsername, createAccount, resetPassword, resendVerification, verifyEmailToken
};
