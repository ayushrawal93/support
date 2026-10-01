const express = require("express");
const multer = require("multer");
const controller = require("../controllers/submissionController");
const { requireAdmin } = require("../middleware/auth");
const { optionalUser } = require("../middleware/userAuth");

const router = express.Router();

const maxSize =
  Number(process.env.MAX_FILE_SIZE_MB || 20) * 1024 * 1024;

const maxFiles =
  Number(process.env.MAX_FILES || 20);

/*
 * The frontend sends every selected attachment with the single,
 * canonical field name: assignmentFiles.
 *
 * Using upload.array() here is intentional. The previous version
 * used upload.fields() for three possible field names, which made
 * multipart handling unnecessarily complex.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSize,
    files: maxFiles,
    parts: maxFiles + 30
  }
});

function receiveFiles(req, res, next) {
  upload.array("assignmentFiles", maxFiles)(req, res, (error) => {
    if (!error) return next();

    console.error("[UPLOAD ERROR]", {
      name: error.name,
      code: error.code || null,
      field: error.field || null,
      message: error.message
    });

    if (error instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE:
          `One or more files exceed the ${process.env.MAX_FILE_SIZE_MB || 20} MB limit.`,
        LIMIT_FILE_COUNT:
          `You can upload a maximum of ${maxFiles} files.`,
        LIMIT_UNEXPECTED_FILE:
          "Unexpected attachment field. Please refresh the page and try again.",
        LIMIT_PART_COUNT:
          "The upload contains too many form parts."
      };

      return res.status(400).json({
        success: false,
        message:
          messages[error.code] ||
          `Upload failed: ${error.message}`
      });
    }

    return res.status(400).json({
      success: false,
      message: "The attachment upload was interrupted. Please try again."
    });
  });
}

router.post("/", receiveFiles, optionalUser, controller.createSubmission);

router.get("/", requireAdmin, controller.listSubmissions);

router.get(
  "/attachments/:id/view",
  requireAdmin,
  controller.viewAttachment
);

router.get(
  "/attachments/:id/download",
  requireAdmin,
  controller.downloadAttachment
);

router.get(
  "/files/:id",
  requireAdmin,
  controller.downloadAttachment
);

router.get("/:id", requireAdmin, controller.getSubmission);

router.patch(
  "/:id/status",
  requireAdmin,
  controller.updateStatus
);

module.exports = router;
