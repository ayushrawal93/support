"use strict";

/*
============================================================
ASSIGNMENT HELP - EMAIL SERVICE
============================================================

Uses Gmail SMTP through Nodemailer.

Required Railway variables:

SMTP_USER
SMTP_FROM
EMAIL_TO
TRACK_URL

Example:

SMTP_FROM=Assignment Help <noreply@yourdomain.com>

Do NOT put the API key in GitHub.
============================================================
*/

const EMAIL_TO = String(
  process.env.EMAIL_TO || ""
).trim();

const TRACK_URL = String(
  process.env.TRACK_URL ||
  "https://serene-encouragement-production-cdc8.up.railway.app/"
).trim();

const mailer = require("./mailer");


/* =========================================================
   CONFIGURATION
========================================================= */

function isConfigured() {
  return Boolean(mailer.isConfigured() && EMAIL_TO);
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch])
  );
}


/* =========================================================
   URL SAFETY
========================================================= */

function safeUrl(value) {
  const url = String(value || "").trim();

  if (
    url.startsWith("https://") ||
    url.startsWith("http://")
  ) {
    return url;
  }

  return "https://serene-encouragement-production-cdc8.up.railway.app/";
}


/* =========================================================
   RESEND API REQUEST
========================================================= */

async function resendRequest(payload) {
  if (!isConfigured()) throw new Error("Email configuration is missing.");
  return mailer.send({ to: payload.to, replyTo: payload.reply_to, subject: payload.subject, html: payload.html, attachments: payload.attachments });
}


/* =========================================================
   BUILD ATTACHMENTS
========================================================= */

function buildAttachments(files) {
  return (files || [])
    .filter(
      (file) =>
        file &&
        file.buffer &&
        Buffer.isBuffer(file.buffer)
    )
    .map((file) => ({
      filename:
        String(
          file.originalname ||
          "attachment"
        ),

      content:
        file.buffer.toString("base64")
    }));
}


/* =========================================================
   ADMIN EMAIL HTML
========================================================= */

function buildAdminHtml({
  orderId,
  fields,
  attachments
}) {
  const safeOrderId =
    escapeHtml(orderId);

  const safeName =
    escapeHtml(fields.name);

  const safeEmail =
    escapeHtml(fields.email);

  const safePhone =
    escapeHtml(fields.phone);

  const safeSubject =
    escapeHtml(fields.subject);

  const safeDeadlineDate =
    escapeHtml(fields.deadline_date);

  const safeDeadlineTime =
    escapeHtml(fields.deadline_time);

  const safeMessage =
    escapeHtml(fields.message)
      .replace(/\n/g, "<br>");

  const attachmentRows =
    (attachments || []).length
      ? attachments
          .map(
            (file) => `
              <tr>
                <td style="
                  padding:10px 12px;
                  border-bottom:1px solid #e5e7eb;
                  font-size:14px;
                ">
                  ${escapeHtml(
                    file.filename
                  )}
                </td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td style="
              padding:10px 12px;
              color:#6b7280;
              font-size:14px;
            ">
              No attachments
            </td>
          </tr>
        `;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">
<title>New Assignment</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f3f4f6;
  font-family:Arial,Helvetica,sans-serif;
  color:#111827;
">

<div style="
  max-width:680px;
  margin:30px auto;
  background:#ffffff;
  border-radius:14px;
  overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,.08);
">

  <div style="
    padding:24px;
    background:#111827;
    color:#ffffff;
  ">
    <div style="
      font-size:13px;
      opacity:.8;
      margin-bottom:8px;
    ">
      ASSIGNMENT HELP
    </div>

    <h1 style="
      margin:0;
      font-size:24px;
    ">
      New Assignment Requirements
    </h1>

    <div style="
      margin-top:10px;
      font-size:16px;
      font-weight:bold;
    ">
      Order # ${safeOrderId}
    </div>
  </div>


  <div style="padding:24px;">

    <h2 style="
      margin:0 0 18px;
      font-size:19px;
    ">
      Customer Information
    </h2>

    <table width="100%"
           cellspacing="0"
           cellpadding="0"
           style="
             border-collapse:collapse;
             margin-bottom:24px;
           ">

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
          width:160px;
        ">
          Name
        </td>

        <td style="padding:10px;">
          ${safeName}
        </td>
      </tr>

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
        ">
          Email
        </td>

        <td style="padding:10px;">
          ${safeEmail}
        </td>
      </tr>

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
        ">
          Phone
        </td>

        <td style="padding:10px;">
          ${safePhone || "Not provided"}
        </td>
      </tr>

    </table>


    <h2 style="
      margin:0 0 18px;
      font-size:19px;
    ">
      Assignment
    </h2>

    <table width="100%"
           cellspacing="0"
           cellpadding="0"
           style="
             border-collapse:collapse;
             margin-bottom:24px;
           ">

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
          width:160px;
        ">
          Subject
        </td>

        <td style="padding:10px;">
          ${safeSubject}
        </td>
      </tr>

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
        ">
          Deadline Date
        </td>

        <td style="padding:10px;">
          ${safeDeadlineDate}
        </td>
      </tr>

      <tr>
        <td style="
          padding:10px;
          background:#f9fafb;
          font-weight:bold;
        ">
          Deadline Time
        </td>

        <td style="padding:10px;">
          ${safeDeadlineTime}
        </td>
      </tr>

    </table>


    <h2 style="
      margin:0 0 12px;
      font-size:19px;
    ">
      Assignment Details
    </h2>

    <div style="
      padding:16px;
      background:#f9fafb;
      border-radius:10px;
      line-height:1.6;
      margin-bottom:24px;
      white-space:normal;
    ">
      ${safeMessage}
    </div>


    <h2 style="
      margin:0 0 12px;
      font-size:19px;
    ">
      Attachments
    </h2>

    <table width="100%"
           cellspacing="0"
           cellpadding="0"
           style="
             border-collapse:collapse;
             border:1px solid #e5e7eb;
             margin-bottom:24px;
           ">
      ${attachmentRows}
    </table>


    <div style="
      padding:14px;
      background:#ecfdf5;
      border-radius:10px;
      color:#065f46;
      font-size:14px;
    ">
      This submission has been saved successfully
      in the Assignment Help database.
    </div>

  </div>

</div>

</body>
</html>
`;
}


/* =========================================================
   CUSTOMER EMAIL HTML
========================================================= */

function buildCustomerHtml({
  orderId,
  fields
}) {
  const safeName =
    escapeHtml(fields.name);

  const safeOrderId =
    escapeHtml(orderId);

  const trackUrl =
    escapeHtml(
      safeUrl(TRACK_URL)
    );

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">
<title>Your Assignment Requirements</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f3f4f6;
  font-family:Arial,Helvetica,sans-serif;
  color:#111827;
">

<div style="
  max-width:620px;
  margin:30px auto;
  background:#ffffff;
  border-radius:16px;
  overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,.08);
">

  <div style="
    padding:30px 24px;
    text-align:center;
    background:#111827;
    color:#ffffff;
  ">

    <div style="
      font-size:13px;
      letter-spacing:1px;
      opacity:.8;
      margin-bottom:8px;
    ">
      ASSIGNMENT HELP
    </div>

    <h1 style="
      margin:0;
      font-size:25px;
    ">
      Requirements Submitted
    </h1>

  </div>


  <div style="
    padding:30px 24px;
  ">

    <p style="
      margin:0 0 15px;
      font-size:17px;
    ">
      Hello ${safeName},
    </p>


    <div style="
      padding:20px;
      background:#f9fafb;
      border-radius:12px;
      margin-bottom:22px;
      text-align:center;
    ">

      <div style="
        font-size:20px;
        font-weight:bold;
        margin-bottom:10px;
      ">
        Thanks! Your Requirements Was Submitted.
      </div>

      <div style="
        font-size:17px;
        color:#374151;
      ">
        Your Order #
        <strong>${safeOrderId}</strong>
      </div>

    </div>


    <p style="
      font-size:15px;
      line-height:1.7;
      color:#4b5563;
    ">
      We have successfully received your
      assignment requirements. Our team can now
      review your request and proceed with the
      next steps.
    </p>


    <div style="
      text-align:center;
      margin:30px 0;
    ">

      <a href="${trackUrl}"
         style="
           display:inline-block;
           padding:15px 34px;
           background:#111827;
           color:#ffffff;
           text-decoration:none;
           border-radius:9px;
           font-size:16px;
           font-weight:bold;
         ">
        Track Here
      </a>

    </div>


    <div style="
      padding:15px;
      background:#f9fafb;
      border-radius:10px;
      font-size:13px;
      color:#6b7280;
      text-align:center;
    ">
      Please keep your Order ID
      <strong>${safeOrderId}</strong>
      for future reference.
    </div>

  </div>


  <div style="
    padding:18px 24px;
    background:#f9fafb;
    text-align:center;
    color:#9ca3af;
    font-size:12px;
  ">
    Assignment Help
  </div>

</div>

</body>
</html>
`;
}


/* =========================================================
   SEND SUBMISSION EMAILS
========================================================= */

async function sendSubmissionEmail({
  submissionId,
  orderId,
  fields,
  files
}) {
  if (!isConfigured()) {
    throw new Error(
      "Email is not configured. Set BREVO_API_KEY (or SMTP_USER/SMTP_PASS), MAIL_FROM and EMAIL_TO in Railway Variables."
    );
  }

  const displayOrderId =
    orderId ||
    `#${submissionId}`;

  const customerEmail =
    String(
      fields?.email || ""
    ).trim();

  const attachments =
    buildAttachments(files);

  const adminHtml =
    buildAdminHtml({
      orderId: displayOrderId,
      fields,
      attachments
    });

  const customerHtml =
    buildCustomerHtml({
      orderId: displayOrderId,
      fields
    });


  /* =======================================================
     ADMIN EMAIL
  ======================================================= */

  console.log(
    `[EMAIL] Sending admin email for ${displayOrderId} to ${EMAIL_TO}`
  );

  const adminPromise = resendRequest({
        to: [EMAIL_TO],
    reply_to: customerEmail || undefined,
    subject: `New Assignment Requirements — ${displayOrderId} — ${String(fields?.name || "").trim()}`,
    html: adminHtml,
    attachments: attachments.length ? attachments : undefined
  });

  const customerPromise = customerEmail
    ? resendRequest({
                to: [customerEmail],
        subject: `${String(fields?.name || "").trim()}, Thanks! Your Requirements Was Submitted. Your Order # ${displayOrderId}`,
        html: customerHtml
      })
    : Promise.resolve(null);

  const [adminResult, customerResult] = await Promise.all([adminPromise, customerPromise]);
  console.log(`[EMAIL] Admin email sent successfully. Message ID: ${adminResult?.messageId || "unknown"}`);
  if (customerResult) console.log(`[EMAIL] Customer email sent successfully. Message ID: ${customerResult?.messageId || "unknown"}`);

  return {
    success: true,

    orderId:
      displayOrderId,

    admin:
      {
        sent: true,
        messageId:
          adminResult?.id || null
      },

    customer:
      {
        sent:
          Boolean(customerResult),
        messageId:
          customerResult?.id || null
      }
  };
}


/* =========================================================
   VERIFY RESEND CONFIGURATION
========================================================= */

async function verifyEmailConfiguration() {
  return mailer.verify();
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  sendSubmissionEmail,
  verifyEmailConfiguration,
  isConfigured,
  EMAIL_TO,
  TRACK_URL,
  mailer
};