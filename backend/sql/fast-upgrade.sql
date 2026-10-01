-- Run once on your existing Neon PostgreSQL database.
-- Safe to run repeatedly.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS client_ip VARCHAR(100);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS country VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at
ON submissions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_status
ON submissions(status);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id
ON submission_files(submission_id);
