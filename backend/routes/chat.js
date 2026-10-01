"use strict";

const express = require("express");
const multer = require("multer");
const controller = require("../controllers/chatController");
const { chatRateLimit } = require("../middleware/chatRateLimit");
const { optionalUser } = require("../middleware/userAuth");

const router = express.Router();

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(png|jpe?g|webp|gif|pdf|docx|txt|md|csv|json)$/i;

const upload = multer({
  storage: multer.memoryStorage(), // files are read for this one answer and never written to disk
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 10, fieldSize: 200 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED.test(file.originalname || "")) return cb(null, true);
    const err = new Error(`"${file.originalname}" isn't a supported file type.`);
    err.status = 400;
    cb(err);
  }
});

function receive(req, res, next) {
  upload.array("files", MAX_FILES)(req, res, (error) => {
    if (!error) return next();
    let message = error.message || "Couldn't read the attached files.";
    if (error.code === "LIMIT_FILE_SIZE") message = "One of the files is over 10 MB.";
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") message = `You can attach up to ${MAX_FILES} files.`;
    res.status(400).json({ success: false, message });
  });
}

router.get("/status", optionalUser, controller.status);
router.post("/", chatRateLimit, optionalUser, receive, controller.ask);

module.exports = router;
