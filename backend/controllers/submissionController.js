
const crypto = require("crypto");
const path = require("path");
const { pool, query } = require("../config/database");
const {
  sendSubmissionEmail,
  isConfigured,
  EMAIL_TO
} = require("../services/emailService");

const IST = "Asia/Kolkata";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function safeName(name) {
  return (
    path
      .basename(String(name || "file"))
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 500) || "file"
  );
}

function istParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key, Number(value)])
  );
}

function createOrderId() {
  const date = istParts();

  return `AH${String(date.hour).padStart(2, "0")}${String(
    date.minute
  ).padStart(2, "0")}${String(date.day).padStart(2, "0")}${String(
    date.month
  ).padStart(2, "0")}${String(date.year).slice(-2)}`;
}

async function newOrderId(client) {
  const orderId = createOrderId();

  const result = await client.query(
    "SELECT 1 FROM submissions WHERE order_id=$1 LIMIT 1",
    [orderId]
  );

  if (!result.rows.length) {
    return orderId;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 60));

    const nextOrderId = createOrderId();

    const check = await client.query(
      "SELECT 1 FROM submissions WHERE order_id=$1 LIMIT 1",
      [nextOrderId]
    );

    if (!check.rows.length) {
      return nextOrderId;
    }
  }

  throw new Error("Could not create a unique order ID.");
}

function validDate(value) {
  const stringValue = String(value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return false;
  }

  const [year, month, day] = stringValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validHour(value) {
  if (!/^\d{2}:00$/.test(String(value || ""))) {
    return false;
  }

  const hour = Number(String(value).slice(0, 2));

  return hour >= 0 && hour <= 23;
}

function validateDeadline(date, time) {
  date = String(date || "").trim();
  time = String(time || "").trim();

  if (!validDate(date)) {
    return {
      valid: false,
      message: "Invalid deadline date."
    };
  }

  if (!validHour(time)) {
    return {
      valid: false,
      message: "Invalid deadline hour. Use HH:00."
    };
  }

  const now = istParts();

  const today = `${now.year}-${String(now.month).padStart(
    2,
    "0"
  )}-${String(now.day).padStart(2, "0")}`;

  if (date < today) {
    return {
      valid: false,
      message: "Deadline cannot be in the past."
    };
  }

  if (date === today && Number(time.slice(0, 2)) <= now.hour) {
    return {
      valid: false,
      message: "Please select a future hour in IST."
    };
  }

  return {
    valid: true
  };
}

function formatDeadline(date, time) {
  try {
    if (!date) return "";

    const dateString =
      date instanceof Date
        ? `${date.getUTCFullYear()}-${String(
            date.getUTCMonth() + 1
          ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
        : String(date).slice(0, 10);

    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return String(date);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return String(date);
    }

    const hourMatch = /^\d{1,2}/.exec(String(time || ""));
    const hour = hourMatch
      ? String(Number(hourMatch[0])).padStart(2, "0")
      : "00";

    return `${String(day).padStart(2, "0")} ${
      MONTHS[month - 1]
    } ${year} ${hour}:00 IST`;
  } catch {
    return String(date || "");
  }
}

/*
 * Gets the visitor IP from the request.
 *
 * Render and other reverse proxies may provide x-forwarded-for.
 * The first IP in that header is normally the original client IP.
 */
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  const ip = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || "";

  return String(ip)
    .replace(/^::ffff:/, "")
    .replace(/^::1$/, "127.0.0.1")
    .trim();
}

function publicIp(ip) {
  if (!ip) return false;

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip === "localhost"
  ) {
    return false;
  }

  if (
    /^(10\.|192\.168\.|169\.254\.)/.test(ip) ||
    /^(fc|fd|fe80:)/i.test(ip)
  ) {
    return false;
  }

  const parts = ip.split(".").map(Number);

  if (
    parts.length === 4 &&
    parts[0] === 172 &&
    parts[1] >= 16 &&
    parts[1] <= 31
  ) {
    return false;
  }

  return true;
}

async function lookupCountry(ip) {
  if (!publicIp(ip)) {
    return { name: "Local / Unknown", code: "" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      console.warn(
        `[COUNTRY LOOKUP] API returned HTTP ${response.status} for IP ${ip}`
      );

      return { name: "Unknown", code: "" };
    }

    const data = await response.json();

    if (data.error) {
      console.warn("[COUNTRY LOOKUP] API error:", data.reason || data.error);
      return { name: "Unknown", code: "" };
    }

    return {
      name:
        String(data.country_name || data.country || "Unknown").trim() ||
        "Unknown",
      code: String(data.country_code || data.country_code_iso2 || "").trim().toUpperCase().slice(0, 2)
    };
  } catch (error) {
    console.warn("[COUNTRY LOOKUP] Failed:", error.message);
    return { name: "Unknown", code: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function map(row) {
  return {
    SubmissionId: Number(row.id),
    Id: row.order_id || row.id,
    Name: row.name || "",
    Email: row.email || "",
    Phone: row.phone || "",
    Subject: row.subject || "",
    DeadlineDate: row.deadline_date
      ? String(row.deadline_date).slice(0, 10)
      : "",
    DeadlineTime: row.deadline_time
      ? String(row.deadline_time).slice(0, 5)
      : "",
    Deadline: formatDeadline(row.deadline_date, row.deadline_time),
    Country: row.country || "Unknown",
    CountryCode: String(row.country_code || "").toUpperCase(),
    ClientIP: row.client_ip || "",
    AssignmentDetails: row.assignment_details || "",
    Status: row.status || "New",
    CreatedAt: row.created_at || null,
    UpdatedAt: row.updated_at || null,
    AttachmentCount: Number(row.attachment_count || 0)
  };
}

async function createSubmission(req, res) {
  const {
    name,
    email,
    phone,
    subject,
    deadline_date,
    deadline_time,
    message
  } = req.body || {};

  // receiveFiles() uses upload.array("assignmentFiles"), so req.files
  // is already the complete attachment array.
  const files = Array.isArray(req.files) ? req.files : [];

  if (
    !String(name || "").trim() ||
    !String(email || "").trim() ||
    !String(subject || "").trim() ||
    !deadline_date ||
    !deadline_time ||
    !String(message || "").trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Please complete all required fields."
    });
  }

  const deadlineCheck = validateDeadline(deadline_date, deadline_time);

  if (!deadlineCheck.valid) {
    return res.status(400).json({
      success: false,
      message: deadlineCheck.message
    });
  }

  const ip = clientIp(req);

  // Do not block form submission while contacting the geolocation API.
  const initialCountry = publicIp(ip) ? "Pending" : "Local / Unknown";
  const initialCountryCode = null;

  console.log("[IP DEBUG]", {
    ip,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    remoteAddress: req.socket?.remoteAddress || null
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderId = await newOrderId(client);

    const result = await client.query(
      `
        INSERT INTO submissions
        (
          order_id,
          name,
          email,
          phone,
          subject,
          deadline_date,
          deadline_time,
          assignment_details,
          client_ip,
          country,
          country_code,
          status,
          user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'New',$12)
        RETURNING id, order_id
      `,
      [
        orderId,
        String(name).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        String(subject).trim(),
        deadline_date,
        deadline_time,
        String(message).trim(),
        ip || null,
        initialCountry,
        initialCountryCode,
        req.user ? Number(req.user.id) : null
      ]
    );

    const submissionId = Number(result.rows[0].id);

    // Insert all attachments in one database query.
    if (files.length) {
      const values = [];
      const parameters = [];

      files.forEach((file, index) => {
        const originalName = safeName(file.originalname);
        const storedName = `${crypto.randomUUID()}-${originalName}`;
        const base = index * 7;

        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
        );

        parameters.push(
          submissionId,
          originalName,
          storedName,
          `${submissionId}/${storedName}`,
          file.mimetype || "application/octet-stream",
          Number(file.size || file.buffer.length),
          file.buffer
        );
      });

      await client.query(
        `
          INSERT INTO submission_files
          (
            submission_id,
            original_file_name,
            stored_file_name,
            file_path,
            mime_type,
            file_size,
            data
          )
          VALUES ${values.join(",")}
        `,
        parameters
      );
    }

    await client.query("COMMIT");

    /*
     * Country lookup runs after the response-critical database work.
     * The result is written back to the same submission.
     */
    if (publicIp(ip)) {
      setImmediate(async () => {
        const geo = await lookupCountry(ip);

        try {
          await query(
            `
              UPDATE submissions
              SET country=$1, country_code=$2, updated_at=NOW()
              WHERE id=$3
            `,
            [geo.name, geo.code || null, submissionId]
          );

          console.log(
            `[COUNTRY UPDATE] Submission ${submissionId}: ${geo.name}${geo.code ? ` (${geo.code})` : ""}`
          );
        } catch (error) {
          console.error("[COUNTRY UPDATE ERROR]", error.message);
        }
      });
    }

    // Email remains outside the response path for faster submission.
    if (isConfigured()) {
      setImmediate(() => {
        sendSubmissionEmail({
          submissionId,
          orderId,
          fields: {
            name,
            email,
            phone,
            subject,
            deadline_date,
            deadline_time,
            message,
            country: initialCountry,
            clientIp: ip
          },
          files
        }).catch((error) => {
          console.error("Submission email error:", error.message);
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thanks! Your Requirements Was Submitted.",
      submissionId,
      orderId,
      deadline: formatDeadline(deadline_date, deadline_time),
      country: initialCountry,
      attachmentCount: files.length
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("CREATE SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save the submission."
    });
  } finally {
    client.release();
  }
}

async function listSubmissions(req, res) {
  try {
    const result = await query(`
      SELECT
        s.*,
        COUNT(f.id)::int AS attachment_count
      FROM submissions s
      LEFT JOIN submission_files f
        ON f.submission_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    return res.json({
      success: true,
      submissions: result.rows.map(map)
    });
  } catch (error) {
    console.error("LIST SUBMISSIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submissions."
    });
  }
}

async function getSubmission(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    const submission = await query(
      "SELECT * FROM submissions WHERE id=$1 LIMIT 1",
      [id]
    );

    if (!submission.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    const files = await query(
      `
        SELECT
          id,
          original_file_name,
          mime_type,
          file_size,
          created_at
        FROM submission_files
        WHERE submission_id=$1
        ORDER BY id
      `,
      [id]
    );

    return res.json({
      success: true,
      submission: map(submission.rows[0]),
      attachments: files.rows.map((file) => ({
        Id: Number(file.id),
        OriginalFileName: file.original_file_name,
        MimeType: file.mime_type || "application/octet-stream",
        FileSize: Number(file.file_size || 0),
        CreatedAt: file.created_at,
        ViewUrl: `/api/submissions/attachments/${file.id}/view`,
        DownloadUrl: `/api/submissions/attachments/${file.id}/download`
      }))
    });
  } catch (error) {
    console.error("GET SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submission."
    });
  }
}

async function sendAttachment(req, res, forceDownload = false) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid attachment ID.");
    }

    const result = await query(
      `
        SELECT original_file_name, mime_type, data
        FROM submission_files
        WHERE id=$1
        LIMIT 1
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).send("Attachment not found.");
    }

    const file = result.rows[0];

    if (!file.data || !file.data.length) {
      return res.status(404).send("Attachment data is empty.");
    }

    const fileName = safeName(file.original_file_name || "attachment");
    const mimeType = file.mime_type || "application/octet-stream";

    const download =
      forceDownload ||
      req.path.endsWith("/download") ||
      ["1", "true"].includes(
        String(req.query.download || "").toLowerCase()
      );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private,no-store,max-age=0");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", file.data.length);
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${fileName}"`
    );

    return res.end(file.data);
  } catch (error) {
    console.error("ATTACHMENT RETRIEVAL ERROR:", error);

    return res.status(500).send("Unable to retrieve attachment.");
  }
}

const viewAttachment = (req, res) =>
  sendAttachment(req, res, false);

const downloadAttachment = (req, res) =>
  sendAttachment(req, res, true);

async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "");

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    if (!["New", "In Progress", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status."
      });
    }

    const result = await query(
      `
        UPDATE submissions
        SET status=$1, updated_at=NOW()
        WHERE id=$2
        RETURNING order_id, status
      `,
      [status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    return res.json({
      success: true,
      message: "Status updated.",
      orderId: result.rows[0].order_id,
      status: result.rows[0].status
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update status."
    });
  }
}

module.exports = {
  createSubmission,
  listSubmissions,
  getSubmission,
  viewAttachment,
  downloadAttachment,
  getFile: downloadAttachment,
  updateStatus,
  EMAIL_TO
};