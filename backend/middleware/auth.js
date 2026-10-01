const jwt = require("jsonwebtoken");

/*
 * Admin-only guard.
 * The role check matters: other tokens in this app (the paid-subscriber cookie,
 * customer sessions) are signed with related secrets, and none of them may ever
 * open the admin API.
 */
function requireAdmin(req, res, next) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (!token) return res.status(401).json({ success: false, message: "Login required." });
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: "JWT_SECRET is not configured." });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (!claims || claims.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    req.admin = claims;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }
}
module.exports = { requireAdmin };
