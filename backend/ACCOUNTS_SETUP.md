# Customer accounts: sign up, log in, profile, subscription, orders

> **Update - self-chosen passwords, email confirmation, reliable email**
> - Sign-up now has **password + confirm password** boxes. The customer is logged in immediately; no password is ever emailed.
> - A welcome email (User ID + "Confirm my email" link) is sent **best-effort** - a mail outage no longer blocks sign-up.
>   Orders/subscriptions are only matched by email once the email is confirmed (stops someone registering another person's address).
> - **Continue with Google** is always shown. It works once `GOOGLE_CLIENT_ID` is set (see Setup step 2). Google users are verified
>   instantly and can add a password later from *Profile & security*.
> - Email goes through `services/mailer.js`: `BREVO_API_KEY` (HTTPS, works on Railway) > `RESEND_API_KEY` > SMTP. See `.env.example`.
> - The sections below describe the original emailed-password design where they differ.

## What was added

| Area | Files |
|---|---|
| Database | `config/userSchema.js` (runs automatically at start), `sql/migration-users.sql` (same statements, optional) |
| API | `routes/auth.js`, `routes/account.js`, `controllers/authController.js`, `controllers/accountController.js` |
| Logic | `services/accountService.js`, `userStore.js` (all SQL), `googleAuthService.js`, `accountEmailService.js`, `subscriptionService.js` |
| Security | `middleware/userAuth.js` (sessions), `middleware/authRateLimit.js` |
| Pages | `/login`, `/signup`, `/account` (`login.html`, `signup.html`, `account.html`, `css/account.css`, `js/account.js`) |
| Small edits | `server.js` (mounts routes/pages), `emailService.js` (exports the mailer), `billingService/Controller` + `routes/billing.js` (saves the subscription on the account), `routes/submissions.js` + `submissionController.js` (orders remember the account), `middleware/auth.js` (see "Security fix") |

No new npm packages are needed.

## How it works

**Manual sign-up** - the visitor enters name, email and (optionally) phone. The server creates the account,
generates a **User ID** (`AH-XXXXXXXX`) and a random **password**, and **emails both** to that address.
Nothing secret is shown on screen and no session starts: the person proves they own the inbox by using the
emailed details. If the email cannot be sent, the account is removed again, so nobody is left with an account
they can never open.

**Google sign-up / sign-in** - the Google button returns an ID token; the server verifies its signature
against Google's public keys, plus audience, issuer, expiry and `email_verified`. A new Google user gets an
account and the same User ID + password email. If the verified email already belongs to a manual account,
Google is linked to it.

**Log in** - with **User ID or email** + password. Sessions are an httpOnly, SameSite=Lax cookie (`ah_user`),
14 days by default. Changing the password signs out every older session.

**Forgot password** - emails a fresh password (the old one stops working only after the email is sent).

**Dashboard** (`/account`) - profile with User ID, current subscription, all submitted orders (detail view and
file downloads), profile editing and password change. It refreshes itself every minute while the tab is open.
Orders show up when they were submitted while logged in **or** with the account's email address.

The public site's "Login" button becomes the customer's first name (linking to `/account`) and "Signup" hides.

## Setup (3 steps)

1. **Environment variables** (see `.env.example`): `WEBSITE_URL`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   (already used for order emails), `JWT_SECRET` (already set), and optionally `GOOGLE_CLIENT_ID`.
2. **Google button (optional)** - Google Cloud Console > APIs & Services > Credentials > *Create credentials >
   OAuth client ID > Web application*. Add your site (e.g. `https://www.your-domain.com`) under **Authorised
   JavaScript origins**. Paste the client ID into `GOOGLE_CLIENT_ID`. Set `GOOGLE_ALLOWED_DOMAINS=gmail.com`
   if only Gmail addresses should be accepted.
3. **Deploy.** Tables are created on start. For local testing without SMTP set `AUTH_DEV_LOG_CREDENTIALS=true`
   to print the credentials to the console (ignored in production).

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/auth/config` | - | Tells the page whether to show the Google button |
| `POST /api/auth/signup` `{name,email,phone?}` | - | Create account, email User ID + password |
| `POST /api/auth/google` `{credential}` | - | Google sign-up / sign-in |
| `POST /api/auth/login` `{identifier,password}` | - | Log in with User ID or email |
| `POST /api/auth/logout` | - | End session |
| `POST /api/auth/forgot` `{identifier}` | - | Email a new password (same reply whether or not the account exists) |
| `POST /api/auth/change-password` `{currentPassword,newPassword}` | user | Choose your own password |
| `GET /api/account/overview` | user | Profile + subscription + latest orders |
| `GET/PATCH /api/account/me` | user | Profile (name, phone) |
| `GET /api/account/subscription` | user | Current plan, status, price, renewal date |
| `GET /api/account/orders?page=&limit=` | user | Submitted orders |
| `GET /api/account/orders/:orderId` | user | One order with attachment list |
| `GET /api/account/orders/:orderId/files/:fileId` | user | Download your own attachment |

## Security notes

- **Passwords in email.** You asked for User ID and password to be emailed, so that is what happens. To keep it
  as safe as that allows: the password is system-generated (12 characters), stored only as a bcrypt hash, sent
  once, and the customer is prompted to replace it with their own on first login. Emails are not encrypted in
  transit end-to-end, so the "change your password" prompt matters.
- Rate limits: 20 sign-in attempts / 15 min per IP, 8 wrong passwords per account / 15 min, 8 sign-ups / hour
  per IP, 3 password emails / hour per address.
- Customer sessions are signed with a key derived from `JWT_SECRET`, so they can never be used as admin tokens.
- **Security fix in `middleware/auth.js`:** the admin check previously accepted *any* token signed with
  `JWT_SECRET`, including the paid-subscriber cookie token, so a paying customer could have sent it as a Bearer
  token to `/api/admin`. It now requires `role: "admin"`.
- The in-memory rate limiter suits one server instance; use Redis if you ever run several.
- Subscriptions are attached when a Stripe Checkout is confirmed (to the logged-in account, or the account with
  the paying email). Subscriptions bought *before* this update are not back-filled.
