"use strict";

/*
 * Customer-account tables. Called from initDatabase() on every start and safe
 * to run repeatedly. The same statements live in sql/migration-users.sql for
 * anyone who prefers to run them by hand.
 */
async function initUserTables(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      user_code VARCHAR(16) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      password_hash VARCHAR(255) NOT NULL,
      auth_provider VARCHAR(20) NOT NULL DEFAULT 'manual',
      google_sub VARCHAR(64) UNIQUE,
      avatar_url TEXT,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_provider_check CHECK (auth_provider IN ('manual','google'))
    );
  `);

  // Email verification + "signed up with Google, no password chosen yet".
  // Accounts that already exist were created by emailing credentials, which already proved
  // the inbox, so they are backfilled as verified (only when the column is first added).
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
        UPDATE users SET email_verified = TRUE;
      END IF;
    END $$;
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN NOT NULL DEFAULT TRUE;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_hash VARCHAR(64);`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;`);

  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_usercode_lower ON users (LOWER(user_code));`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));`);

  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(80),
      stripe_subscription_id VARCHAR(80) UNIQUE,
      plan VARCHAR(60) NOT NULL DEFAULT 'Unlimited AI assistant',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      amount_cents INTEGER,
      currency VARCHAR(10),
      billing_interval VARCHAR(10),
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);`);

  // Payment history: one row per paid Stripe invoice, with our order id and the subscription reference.
  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id VARCHAR(24) NOT NULL,
      reference VARCHAR(80),
      invoice_number VARCHAR(60),
      stripe_invoice_id VARCHAR(80) UNIQUE,
      description VARCHAR(200),
      amount_cents INTEGER,
      currency VARCHAR(10),
      status VARCHAR(30) NOT NULL DEFAULT 'paid',
      paid_at TIMESTAMPTZ,
      receipt_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`);

  // Orders (submissions) can belong to an account.
  await query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;`);
  await query(`CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_submissions_email_lower ON submissions (LOWER(email));`);
}

module.exports = { initUserTables };
