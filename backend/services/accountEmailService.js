"use strict";

/*
 * Sign-in details email. Uses the same SMTP account as the order emails
 * (SMTP_USER / SMTP_PASS / SMTP_FROM).
 *
 * The plain password only ever exists in memory long enough to be emailed;
 * the database stores a bcrypt hash.
 */

const mailer = require("./mailer");

const SITE_NAME = String(process.env.SITE_NAME || "Assignment Help").trim();

function siteUrl() {
  return String(process.env.WEBSITE_URL || "").trim().replace(/\/+$/, "");
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isConfigured() {
  return mailer.isConfigured();
}

function shell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7f5">
      <h2 style="margin:0 0 6px;color:#5b21b6">${esc(SITE_NAME)}</h2>
      ${inner}
    </div>
  </div></body></html>`;
}

function button(href, label) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
}

/*
 * Welcome + "confirm your email" message. It never contains a password - the customer chose
 * their own. Delivery is best-effort: the caller must not fail sign-up if this throws.
 */
async function sendWelcome({ name, email, userCode, verifyUrl, provider }) {
  if (!isConfigured()) {
    if (verifyUrl && process.env.NODE_ENV !== "production") console.log(`[AUTH DEV] Verify link for ${email}: ${verifyUrl}`);
    const err = new Error("Email is not configured on the server.");
    err.status = 503;
    throw err;
  }
  const html = shell(`
      <p style="margin:0 0 16px">Hi ${esc(name)}, welcome!</p>
      <p style="margin:0 0 6px">Your account is ready. Your <b>User ID</b> is:</p>
      <p style="margin:0 0 16px;background:#f5f3ff;border-radius:10px;padding:12px 16px;font-family:Consolas,monospace;font-size:18px;font-weight:bold">${esc(userCode)}</p>
      <p style="margin:0">${provider === "google" ? "You signed up with Google, so just use the <b>Continue with Google</b> button to log in. You can also add a password from your account page if you'd like to log in with your User ID or email." : "You can log in with this User ID <i>or</i> your email, plus the password you chose."}</p>
      ${verifyUrl ? `<p style="margin:16px 0 0">Please confirm your email so your orders and subscription show up in your account:</p>${button(verifyUrl, "Confirm my email")}<p style="margin:0;font-size:12px;color:#6b7280">This link works for 48 hours.</p>` : ""}
      <p style="margin:18px 0 0;font-size:12px;color:#6b7280">If you didn't create this account, you can ignore this email.</p>`);
  await mailer.send({
    to: email,
    subject: verifyUrl ? `Welcome to ${SITE_NAME} - confirm your email` : `Welcome to ${SITE_NAME}`,
    html,
    text: `Hi ${name},\n\nYour ${SITE_NAME} User ID: ${userCode}\n${provider === "google" ? "Log in with the Continue with Google button." : "Log in with your User ID or email plus the password you chose."}\n${verifyUrl ? `\nConfirm your email (valid 48 hours): ${verifyUrl}\n` : ""}`
  });
  return { sent: true };
}

/* Re-send the confirm link only. */
async function sendVerification({ name, email, verifyUrl }) {
  if (!isConfigured()) {
    const err = new Error("Email is not configured on the server.");
    err.status = 503;
    throw err;
  }
  await mailer.send({
    to: email,
    subject: `Confirm your email for ${SITE_NAME}`,
    html: shell(`<p style="margin:0 0 12px">Hi ${esc(name)},</p><p style="margin:0">Tap the button to confirm your email address.</p>${button(verifyUrl, "Confirm my email")}<p style="margin:0;font-size:12px;color:#6b7280">This link works for 48 hours. If you didn't ask for it, ignore this email.</p>`),
    text: `Hi ${name},\n\nConfirm your email (valid 48 hours): ${verifyUrl}\n`
  });
  return { sent: true };
}

function credentialsHtml({ name, userCode, email, password, reason }) {
  const login = siteUrl() ? `${siteUrl()}/login` : "";
  const intro = {
    signup: "Your account has been created. Here are your sign-in details:",
    google: "Your account was created with Google sign-in. You can also sign in with these details:",
    reset: "As requested, we have issued a new password. Your previous password no longer works:"
  }[reason] || "Here are your sign-in details:";

  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7f5">
      <h2 style="margin:0 0 6px;color:#5b21b6">${esc(SITE_NAME)}</h2>
      <p style="margin:0 0 18px">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px">${intro}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f3ff;border-radius:10px">
        <tr><td style="padding:12px 16px;color:#6b7280;font-size:13px">User ID</td>
            <td style="padding:12px 16px;font-family:Consolas,monospace;font-size:16px;font-weight:bold">${esc(userCode)}</td></tr>
        <tr><td style="padding:12px 16px;color:#6b7280;font-size:13px">Email</td>
            <td style="padding:12px 16px">${esc(email)}</td></tr>
        <tr><td style="padding:12px 16px;color:#6b7280;font-size:13px">Password</td>
            <td style="padding:12px 16px;font-family:Consolas,monospace;font-size:16px;font-weight:bold">${esc(password)}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:14px">Sign in with your <b>User ID or email</b> plus the password above, then change the password from your account page.</p>
      ${login ? `<p style="margin:20px 0"><a href="${esc(login)}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Sign in</a></p>` : ""}
      <p style="margin:18px 0 0;font-size:12px;color:#6b7280">Keep this email private and delete it once you have changed your password. If you did not request this, you can ignore it.</p>
    </div>
  </div></body></html>`;
}

function credentialsText({ name, userCode, email, password }) {
  return `Hi ${name},\n\nUser ID: ${userCode}\nEmail: ${email}\nPassword: ${password}\n\nSign in with your User ID or email plus this password, then change the password from your account page.\n`;
}

/** reason: "signup" | "google" | "reset" */
async function sendCredentials({ name, email, userCode, password, reason }) {
  if (!isConfigured()) {
    if (String(process.env.AUTH_DEV_LOG_CREDENTIALS || "").toLowerCase() === "true" && process.env.NODE_ENV !== "production") {
      console.log(`[AUTH DEV] SMTP not configured. Credentials for ${email}: ${userCode} / ${password}`);
      return { sent: false, devLogged: true };
    }
    const err = new Error("Email is not configured on the server.");
    err.status = 503;
    throw err;
  }
  const subjects = {
    signup: `Your ${SITE_NAME} account details`,
    google: `Your ${SITE_NAME} account details`,
    reset: `Your new ${SITE_NAME} password`
  };
  await mailer.send({
    to: email,
    subject: subjects[reason] || subjects.signup,
    html: credentialsHtml({ name, userCode, email, password, reason }),
    text: credentialsText({ name, userCode, email, password })
  });
  return { sent: true };
}

module.exports = { sendCredentials, sendWelcome, sendVerification, isConfigured };
