"use strict";

const express = require("express");
const c = require("../controllers/authController");
const { requireUser } = require("../middleware/userAuth");
const { loginLimiter, signupLimiter, forgotLimiter } = require("../middleware/authRateLimit");

const router = express.Router();

// Typing in the sign-up box triggers lookups, so cap them per IP (60 / minute).
const checkLimiter = require("../middleware/authRateLimit").makeLimiter({
  windowMs: 60 * 1000, max: 60, message: "Too many checks. Please slow down."
});

router.get("/config", c.config);
router.get("/check-userid", checkLimiter, c.checkUserId);
router.post("/signup", signupLimiter, c.signup);
router.post("/google", loginLimiter, c.googleLogin);
router.get("/verify", c.verifyEmail);
router.post("/resend-verification", requireUser, c.resendVerification);
router.post("/login", loginLimiter, c.login);
router.post("/logout", c.logout);
router.post("/forgot", forgotLimiter, c.forgot);
router.post("/change-password", requireUser, c.changePassword);

module.exports = router;
