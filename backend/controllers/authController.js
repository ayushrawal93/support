"use strict";

const accounts = require("../services/accountService");
const store = require("../services/userStore");
const google = require("../services/googleAuthService");
const { issueSession, clearSession } = require("../middleware/userAuth");
const limits = require("../middleware/authRateLimit");

const PHONE_RE = /^[0-9+()\-\s.]{5,25}$/;

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function maskEmail(email) {
  const [u, d] = String(email).split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

/* POST /api/auth/signup  { name, email, phone?, password, confirmPassword? }
   The customer chooses their own password. The account is created and the customer is signed in
   straight away. A welcome email (User ID + "confirm your email" link) is sent best-effort:
   if the mail provider is down the account still exists and the customer can resend later. */
async function signup(req, res) {
  try {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const email = accounts.normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || "").trim();
    const userId = String(req.body?.userId || "").trim();
    const password = String(req.body?.password || "");
    const confirm = req.body?.confirmPassword;

    if (name.length < 2 || name.length > 150) return fail(res, 400, "Please enter your full name.");
    if (!accounts.isValidEmail(email)) return fail(res, 400, "Please enter a valid email address.");
    if (phone && !PHONE_RE.test(phone)) return fail(res, 400, "Please enter a valid phone number.");
    const idProblem = accounts.validateUserId(userId);
    if (idProblem) return fail(res, 400, idProblem);
    const problem = accounts.validatePasswordStrength(password);
    if (problem) return fail(res, 400, problem);
    if (confirm !== undefined && String(confirm) !== password) return fail(res, 400, "The two passwords don't match.");

    if (await store.findByEmail(email)) {
      return fail(res, 409, "An account with this email already exists. Log in, or use \"Forgot password\".");
    }

    if (await store.findByCode(userId)) {
      return res.status(409).json({ success: false, field: "userId", message: "That User ID is already taken. Please choose another." });
    }

    const { user, emailSent } = await accounts.createAccount({
      name, email, phone: phone || null, provider: "manual", password, userId, req
    });
    await store.touchLogin(user.id);
    issueSession(req, res, user);
    return res.status(201).json({
      success: true,
      emailSent,
      user: accounts.publicUser(user),
      message: emailSent
        ? `Account created. We sent a confirmation link to ${maskEmail(email)}.`
        : "Account created. We couldn't send the confirmation email right now - you can resend it from your account page."
    });
  } catch (error) {
    if (error.field) return res.status(error.status || 409).json({ success: false, field: error.field, message: error.message });
    if (error.status) return fail(res, error.status, error.message);
    console.error("SIGNUP ERROR:", error);
    return fail(res, 500, "Unable to create your account right now.");
  }
}

/* POST /api/auth/google  { credential }   (ID token from Google Sign-In) */
async function googleLogin(req, res) {
  try {
    const g = await google.verifyIdToken(req.body?.credential);

    let user = await store.findByGoogleSub(g.sub);
    let isNew = false;

    if (!user) {
      user = await store.findByEmail(g.email);
      if (user) {
        // Same verified email as an existing account: link Google to it (also marks the email verified).
        const resetHash = user.email_verified ? null : await accounts.hashPassword(accounts.generatePassword(24));
        user = await store.linkGoogle(user.id, g.sub, g.picture, resetHash);
        user = await accounts.adoptGoogleUsername(user);   // generated AH- ID -> Gmail username, if free
      } else {
        ({ user } = await accounts.createAccount({
          name: g.name, email: g.email, phone: null,
          provider: "google", googleSub: g.sub, avatarUrl: g.picture, req
        }));
        isNew = true;
      }
    }
    if (!user.is_active) return fail(res, 403, "This account has been disabled.");

    await store.touchLogin(user.id);
    issueSession(req, res, user);
    return res.status(isNew ? 201 : 200).json({
      success: true,
      isNewUser: isNew,
      message: isNew ? "Welcome! Your account is ready." : "Signed in with Google.",
      user: accounts.publicUser(user)
    });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("GOOGLE LOGIN ERROR:", error);
    return fail(res, 500, "Unable to sign in with Google right now.");
  }
}

/* GET /api/auth/check-userid?id=...   live "is this User ID free?" check for the sign-up form */
async function checkUserId(req, res) {
  try {
    const id = String(req.query?.id || "").trim();
    const problem = accounts.validateUserId(id);
    if (problem) return res.json({ success: true, available: false, message: problem });
    const taken = await store.findByCode(id);
    return res.json({
      success: true,
      available: !taken,
      message: taken ? "That User ID is already taken. Try another." : "Available"
    });
  } catch (error) {
    console.error("CHECK USERID ERROR:", error);
    return fail(res, 500, "Couldn't check availability right now.");
  }
}

/* GET /api/auth/verify?token=...   (link from the welcome email) */
async function verifyEmail(req, res) {
  try {
    const user = await accounts.verifyEmailToken(req.query?.token);
    return res.redirect(user ? "/account?verified=1" : "/account?verified=0");
  } catch (error) {
    console.error("VERIFY EMAIL ERROR:", error);
    return res.redirect("/account?verified=0");
  }
}

/* POST /api/auth/resend-verification   (logged in) */
async function resendVerification(req, res) {
  try {
    if (req.user.email_verified) return res.json({ success: true, message: "Your email is already confirmed." });
    if (!limits.perEmailLimiter.take("verify:" + req.user.email.toLowerCase())) {
      return fail(res, 429, "Please wait a while before requesting another email.");
    }
    await accounts.resendVerification(req.user, req);
    return res.json({ success: true, message: `Confirmation link sent to ${maskEmail(req.user.email)}.` });
  } catch (error) {
    console.error("RESEND VERIFICATION ERROR:", error.message);
    return fail(res, 502, "We couldn't send the email right now. Please try again in a few minutes.");
  }
}

/* POST /api/auth/login  { identifier: User ID or email, password } */
async function login(req, res) {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? req.body?.userId ?? "").trim();
    const password = String(req.body?.password || "");
    if (!identifier || !password) return fail(res, 400, "Enter your User ID or email, and your password.");

    const parsed = accounts.parseIdentifier(identifier);
    const key = parsed ? parsed.value : identifier.toLowerCase().slice(0, 100);
    if (limits.failedLoginLimiter.count(key) >= limits.failedLoginLimiter.max) {
      return fail(res, 429, "Too many failed attempts for this account. Please wait 15 minutes or use \"Forgot password\".");
    }

    const user = parsed ? await accounts.findByIdentifier(identifier) : null;
    const ok = await accounts.verifyPassword(user, password);
    if (!user || !ok || !user.is_active) {
      limits.failedLoginLimiter.hit(key);
      return fail(res, 401, "Incorrect User ID/email or password.");
    }

    await store.touchLogin(user.id);
    issueSession(req, res, user);
    return res.json({ success: true, user: accounts.publicUser(user) });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return fail(res, 500, "Unable to sign in right now.");
  }
}

function logout(req, res) {
  clearSession(req, res);
  res.json({ success: true });
}

/* POST /api/auth/forgot  { identifier }
   Always answers the same way so it can't be used to discover who has an account. */
async function forgot(req, res) {
  const generic = {
    success: true,
    message: "If an account exists, a new password has been emailed to it."
  };
  try {
    const user = await accounts.findByIdentifier(req.body?.identifier);
    // Google accounts sign in with Google, so they have no password to reset.
    const resettable = user && user.auth_provider !== "google" && user.password_set !== false;
    if (resettable && user.is_active && limits.perEmailLimiter.take(user.email.toLowerCase())) {
      try { await accounts.resetPassword(user); }
      catch (error) { console.error("[AUTH] Password email failed:", error.message); }
    }
    return res.json(generic);
  } catch (error) {
    console.error("FORGOT ERROR:", error);
    return res.json(generic);
  }
}

/* POST /api/auth/change-password  { currentPassword, newPassword }   (logged in) */
async function changePassword(req, res) {
  try {
    const current = String(req.body?.currentPassword || "");
    const next = String(req.body?.newPassword || "");
    // Google sign-up accounts have no password yet, so they can set one without a "current" one.
    const hasPassword = req.user.password_set !== false;
    if (hasPassword && !(await accounts.verifyPassword(req.user, current))) {
      return fail(res, 401, "Your current password is incorrect.");
    }
    const problem = accounts.validatePasswordStrength(next);
    if (problem) return fail(res, 400, problem);
    if (hasPassword && next === current) return fail(res, 400, "Choose a password different from the current one.");

    await store.setPassword(req.user.id, await accounts.hashPassword(next), false);
    const fresh = await store.findById(req.user.id);
    issueSession(req, res, fresh); // older sessions stop working; this one continues
    return res.json({ success: true, message: "Password updated." });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return fail(res, 500, "Unable to change your password right now.");
  }
}

/* GET /api/auth/config  - lets the frontend know which sign-in buttons to show. */
function config(req, res) {
  res.json({
    success: true,
    google: google.isConfigured() ? { clientId: google.clientId() } : null,
    emailConfigured: require("../services/mailer").isConfigured()
  });
}

module.exports = { checkUserId, signup, googleLogin, verifyEmail, resendVerification, login, logout, forgot, changePassword, config };
