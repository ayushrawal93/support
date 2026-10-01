const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
  console.error("POSTGRES POOL ERROR:", error);
});

const query = (text, params) => pool.query(text, params);

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing.");
  }

  await query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGSERIAL PRIMARY KEY,
      order_id VARCHAR(12) UNIQUE,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      subject VARCHAR(255) NOT NULL,
      deadline_date DATE NOT NULL,
      deadline_time TIME NOT NULL,
      assignment_details TEXT NOT NULL,

      client_ip VARCHAR(100),
      country VARCHAR(100),
      country_code VARCHAR(2),

      status VARCHAR(30) NOT NULL DEFAULT 'New',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT submissions_status_check
        CHECK (
          status IN (
            'New',
            'In Progress',
            'Completed',
            'Cancelled'
          )
        )
    );
  `);

  /*
   * Add these columns to an existing submissions table.
   * Safe if they already exist.
   */
  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS client_ip VARCHAR(100);
  `);

  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS country VARCHAR(100);
  `);

  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS submission_files (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL
        REFERENCES submissions(id)
        ON DELETE CASCADE,

      original_file_name VARCHAR(500) NOT NULL,
      stored_file_name VARCHAR(500) NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      mime_type VARCHAR(255),
      file_size BIGINT NOT NULL DEFAULT 0,
      data BYTEA NOT NULL,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at
    ON submissions(created_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_status
    ON submissions(status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id
    ON submission_files(submission_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_country
    ON submissions(country);
  `);

  // Customer accounts, subscriptions and order ownership.
  await require("./userSchema").initUserTables(query);
  await require("../services/liveChatService").initTables();
}

module.exports = {
  pool,
  query,
  initDatabase
};