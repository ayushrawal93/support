-- Customer accounts. Optional: the server runs these automatically on startup
-- (config/userSchema.js). Safe to run repeatedly.

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

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
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_email_lower ON submissions (LOWER(email));


-- Email verification + Google-only accounts (added with self-chosen passwords).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE users SET email_verified = TRUE;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_usercode_lower ON users (LOWER(user_code));

-- Payment history (one row per paid Stripe invoice).
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
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
