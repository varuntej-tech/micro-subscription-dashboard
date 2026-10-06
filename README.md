# Micro-Subscription & Smart Renewal Dashboard ⚡

A full-stack web application designed to help users track recurring micro-subscriptions, monitor daily/weekly/monthly financial liabilities (Runways), visualize renewal schedules on an interactive calendar, analyze spending by categories, and automate 48-hour renewal advance warnings and auto-rollover via a scheduled cron service with real-time email verification.

---

## 🌟 Key Features

### 1. Real-Time Email Verification & Multi-Step Auth Flow
- **Registration**: Creates account with `is_verified: false` and generates a secure verification token and 6-digit numeric OTP (expires in 15 minutes).
- **Email Dispatch**: Dispatches automated HTML emails containing both a direct one-click activation link (`/#verify-email?token=...`) and a prominent 6-digit OTP code using Nodemailer.
- **Interstitial Screen**: Clean, real-time "Verify Your Email" screen with auto-focusing 6-digit inputs, link validation, and a **rate-limited "Resend Verification Email"** button with a live 60-second cooldown timer.
- **Instant Activation**: Upon entering the code or clicking the link, verifies validity and expiration, flips `is_verified` to `true`, clears token columns, and issues a JWT session token to transition immediately into the dashboard.
- **Route Guarding**: Strictly blocks unverified users from accessing or fetching dashboard data at both the backend middleware and frontend routing layers.

### 2. The Daily Financial Runway
- **Daily Run-Rate**: Real-time per-day burn rate normalized across all monthly (`cost / 30.42`) and annual (`cost / 365`) plans.
- **Weekly Run-Rate**: 7-day normalized financial liability.
- **Monthly Run-Rate**: Baseline monthly recurring spend (`monthly + annual / 12`).
- **Annual Projected Run-Rate**: 12-month projected liability.
- Real-time aggregation in INR (`₹`) or selected currency.

### 3. Interactive Monthly Renewal Calendar Grid
- Dynamic 7-column grid displaying the active month with previous/next navigation and a quick "Today" jump button.
- Exact renewal date badges for each service with amount and cycle.
- **48-Hour Alert Badge**: Subscriptions renewing within 48 hours are automatically marked with a pulsing red warning chip (`⚠️ 48h Alert`).
- Clicking any renewal badge opens a detail modal with full metadata and a days-remaining countdown.

### 4. Expense Breakdown Analytics
- Interactive Chart.js Donut Chart breaking down recurring expenses across categories (Entertainment, Cloud & Infra, Dev Tools, Productivity, Health & Fitness, Utilities, Other).
- Category summary list showing monthly cost and percentage share.

### 5. Subscriptions Management
- Add/Edit/Delete subscriptions mapped to the authenticated user.
- **Quick-Fill Presets**: 1-click presets for popular services (Netflix, Spotify, AWS, GitHub Pro, Prime Video, ChatGPT Plus, Google One) that auto-fill service name, category, cycle, and cost.
- Live search by service name and category filter dropdown.
- Sort by next renewal date (soonest), cost, or service name.

### 6. Background Automation (Daily Cron Job)
- Scheduled background task running daily at 12:00 AM (`0 0 * * *`) via `node-cron`.
- **48-Hour Alert**: Queries verified users' subscriptions where `next_renewal_date` is exactly 2 days away $\rightarrow$ dispatches reminder email: *"Hey, [service_name] renews in 2 days."*
- **Auto-Advancement**: Detects subscriptions whose renewal date has passed and automatically advances `next_renewal_date` by +1 month (for monthly plans) or +1 year (for annual plans).
- **On-Demand Simulation**: Includes a *"Simulate 48h Cron"* button in the navbar and `POST /api/cron/trigger-now` endpoint to simulate the midnight automation instantly at any time.

### 7. Built-in Dev Mailbox Inspector
- A slide-out drawer accessible from the navbar (`Dev Mailbox` button).
- Captures and displays all outbound emails in real time with unread count badge, timestamp, recipient, subject, and a **"Use This Code"** button to auto-populate the OTP during testing!

---

## 🏗️ Architecture & Database Schema

### Relational SQL Schema (SQLite)

```sql
-- Users Table
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,               -- UUID v4
    email TEXT UNIQUE NOT NULL,             -- Unique email address
    password_hash TEXT NOT NULL,            -- Bcrypt hashed password
    is_verified INTEGER NOT NULL DEFAULT 0, -- Boolean verification state
    verification_token TEXT,                -- Combined hex token and OTP (nullable)
    token_expires_at TEXT,                  -- ISO timestamp (15-min expiration)
    created_at TEXT NOT NULL                -- ISO timestamp
);

-- Subscriptions Table (One-to-Many Relationship)
CREATE TABLE subscriptions (
    sub_id TEXT PRIMARY KEY,                -- UUID v4
    user_id TEXT NOT NULL,                  -- Foreign Key -> users(user_id) ON DELETE CASCADE
    service_name TEXT NOT NULL,             -- Service name
    category TEXT NOT NULL DEFAULT 'Other', -- Expense category
    cost REAL NOT NULL,                     -- Recurring cost
    currency TEXT NOT NULL DEFAULT 'INR',   -- Default currency 'INR'
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'annual')),
    next_renewal_date TEXT NOT NULL,        -- YYYY-MM-DD
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_subs_user ON subscriptions(user_id);
CREATE INDEX idx_subs_renewal ON subscriptions(next_renewal_date);
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation
```bash
# 1. Install dependencies
npm install

# 2. Seed database with sample data & demo user
npm run seed

# 3. Start application
npm start
```

Open your browser at **`http://localhost:3000`**.

### Pre-Seeded Demo Account
- **Email**: `demo@microsub.com`
- **Password**: `Password123!`

---

## 📡 REST API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Public | Register new user with `is_verified: false` & sends verification email |
| `POST` | `/api/auth/login` | Public | Validates credentials; strictly checks `is_verified === true` |
| `POST` | `/api/auth/verify` | Public | Validates OTP or token; flips `is_verified` to `true` & returns JWT |
| `GET` | `/api/auth/verify` | Public | Validates token from link; flips `is_verified` to `true` & returns JWT |
| `POST` | `/api/auth/resend-verification` | Public | Resends fresh token/OTP (rate-limited: 60s cooldown) |
| `GET` | `/api/auth/me` | JWT | Returns current authenticated user |
| `GET` | `/api/subscriptions` | JWT | Lists user's subscriptions with filter/sort |
| `POST` | `/api/subscriptions` | JWT | Creates a new subscription mapped to `user_id` |
| `PUT` | `/api/subscriptions/:id` | JWT | Updates an existing subscription |
| `DELETE` | `/api/subscriptions/:id` | JWT | Deletes an existing subscription |
| `GET` | `/api/subscriptions/runway` | JWT | Computes Daily, Weekly, Monthly, and Annual run-rates |
| `POST` | `/api/cron/trigger-now` | Public | Manually simulates the 12:00 AM daily check (48h alert & rollover) |
| `GET` | `/api/dev/emails` | Public | Returns outbound emails captured in dev mailbox |
| `POST` | `/api/dev/emails/clear` | Public | Clears dev mailbox log |

---

## 🧪 Running Automated Tests

Run the automated integration test suite:

```bash
npm test
```

This verifies:
1. User registration & verification token generation in database
2. Outbound email dispatch with OTP
3. Strict route guarding blocking unverified logins with 403
4. Resend rate-limiting (429 Too Many Requests within 60 seconds)
5. OTP / token validation, database verification state flip, and active JWT generation
6. Verified login and authenticated JWT access
7. Subscriptions CRUD operations mapped to user
8. The Daily Financial Runway mathematical calculations
9. 48-Hour cron alert email dispatch and automatic date rollover
