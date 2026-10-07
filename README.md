# Micro-Subscription & Smart Renewal Dashboard ⚡

A modern, full-stack personal finance and subscription lifecycle management platform. Track recurring micro-subscriptions, calculate your **Daily Financial Runway**, visualize payment schedules on an **Interactive 30-Day Calendar**, analyze spending categories with dynamic charts, and automate **48-Hour advance renewal alerts** and auto-rollover via a scheduled cron worker.

🌐 **Live Deployed App**: [https://micro-subscription-dashboard.onrender.com](https://micro-subscription-dashboard.onrender.com)  
📁 **Repository**: [https://github.com/varuntej-tech/micro-subscription-dashboard](https://github.com/varuntej-tech/micro-subscription-dashboard)

---

## 📖 Table of Contents
1. [What is the Project?](#-what-is-the-project)
2. [What is the Usage of the Project?](#-what-is-the-usage-of-the-project)
3. [How It Works & Key Features](#-how-it-works--key-features)
4. [System Architecture](#-system-architecture)
5. [Database Schema](#-database-schema)
6. [API Reference](#-api-reference)
7. [Local Setup & Testing](#-local-setup--testing)
8. [Security & Deployment](#-security--deployment)

---

## 🎯 What is the Project?

Consumers and developers subscribe to dozens of recurring digital services—Netflix, Spotify, AWS, GitHub Copilot, ChatGPT Plus, gym memberships, and cloud servers. Because these charges are billed at different intervals (monthly vs. annual) and deducted automatically, users experience **"Subscription Fatigue"** and **unintentional auto-renewals**, resulting in hundreds of dollars in wasted charges each year.

The **Micro-Subscription & Smart Renewal Dashboard** solves this problem by providing a centralized command center to:
* **Track & Normalize Commitments**: View true daily, weekly, monthly, and annual burn rates.
* **Visualize Renewals**: See payments on an interactive calendar with urgency indicators.
* **Automate Alerts**: Receive proactive email alerts 48 hours before any card deduction occurs.
* **Authenticate Flexibly**: Seamlessly log in using Google 1-Click, Mobile SMS OTP, Email OTP, or standard passwords.

---

## 💡 What is the Usage of the Project?

### Who is this for?
* **Everyday Individuals**: Track entertainment streaming (Netflix, Prime, Disney+), gym plans, and utilities so you never miss a cancellation window.
* **Developers & Freelancers**: Monitor dev tools (GitHub, Figma, JetBrains, Vercel) and cloud compute instances (AWS, DigitalOcean, Supabase).
* **Indie Hackers & Startups**: Keep software infrastructure overhead lean and forecast monthly operating burn rates.

### Real-World Benefits
* 🚫 **Stop Surprise Charges**: Get warned 2 days ahead so you have ample time to pause or cancel unused plans.
* 📊 **Burn-Rate Clarity**: Knowing you spend **₹145/day** on subscriptions offers immediate clarity compared to seeing disconnected ₹499 monthly bills.
* 🕒 **Zero-Effort Maintenance**: Overdue renewal dates automatically roll forward by 1 month or 1 year after the renewal day passes.
* ⚡ **3-Second Onboarding**: Instant sign-in via Google or Phone SMS without password fatigue.

---

## ⚙️ How It Works & Key Features

### 1. Multi-Channel Authentication
* **Google 1-Click (Firebase)**: One-click sign-in via Google OAuth popup.
* **Phone SMS OTP (Firebase)**: Mobile number verification with invisible reCAPTCHA and 6-digit SMS verification code.
* **Email OTP**: Passwordless 6-digit one-time password verification with instant on-screen fallback.
* **Password Authentication**: Standard email and salted Bcrypt password authentication.
* **JWT Session Guarding**: Issues secure 7-day JSON Web Tokens to protect user endpoints.

### 2. The Daily Financial Runway Engine
Normalizes subscriptions across varying cycles to calculate actionable run-rates:
* **Daily Run-Rate**: `(Monthly Cost / 30.42) + (Annual Cost / 365)`
* **Weekly Run-Rate**: `Daily Run-Rate × 7`
* **Monthly Run-Rate**: `Monthly Cost + (Annual Cost / 12)`
* **Annual Projection**: `Monthly Run-Rate × 12`

### 3. Interactive Monthly Renewal Calendar Grid
* Dynamic 7-column calendar grid showing the active month with prev/next navigation.
* Displays subscription badges on their exact renewal days.
* **48-Hour Urgency Alert**: Subscriptions renewing within 48 hours display a pulsing warning chip (`⚠️ 48h Alert`).
* Clicking any badge reveals detailed metadata and an exact countdown (e.g. *"Renews in 1 day"*).

### 4. 24/7 Background Cron Automation
* Runs automatically every day at midnight (`0 0 * * *`) via `node-cron`.
* **48-Hour Alerts**: Scans SQLite for subscriptions renewing in 2 days and sends reminder emails.
* **Auto-Rollover**: Automatically increments overdue renewal dates (+1 month for monthly, +1 year for annual).
* **Instant Simulation**: Includes a *"Simulate 48h Cron"* button in the dashboard to test workflows anytime.

### 5. Spending Breakdown & Analytics
* Interactive Chart.js donut chart categorizing expenses across **Entertainment**, **Cloud & Infra**, **Dev Tools**, **Productivity**, **Health & Fitness**, and **Utilities**.
* Visual breakdown showing percentage share and total monetary impact per category.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│   Tailwind CSS  •  Chart.js  •  Calendar  •  Auth Modal     │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
    (OAuth / SMS OTP)                  (REST API / JWT)
                │                             │
                ▼                             ▼
┌──────────────────────────────┐    ┌─────────────────────────┐
│           Firebase           │    │    Node.js Express API  │
│  • Google Identity Provider  │    │  • Auth & Session Guard │
│  • Phone SMS Verification    │    │  • Financial Runway     │
│  • Client Security Rules     │    │  • 24/7 Cron Daemon     │
└──────────────────────────────┘    └────────────┬────────────┘
                                                 │
                                           (SQL Queries)
                                                 │
                                                 ▼
                                    ┌─────────────────────────┐
                                    │    SQLite Database      │
                                    │  • users                │
                                    │  • subscriptions        │
                                    │  • email_otps           │
                                    └─────────────────────────┘
```

---

## 🗄️ Database Schema

```sql
-- Users Table
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    verification_token TEXT,
    token_expires_at TEXT,
    created_at TEXT NOT NULL
);

-- Subscriptions Table
CREATE TABLE subscriptions (
    sub_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other',
    cost REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'annual')),
    next_renewal_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Email OTPs Table
CREATE TABLE email_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/google` | Public | Firebase Google 1-Click login & JWT issuance |
| `POST` | `/api/auth/phone` | Public | Firebase Phone SMS OTP login & JWT issuance |
| `POST` | `/api/auth/signup` | Public | Standard email registration |
| `POST` | `/api/auth/login` | Public | Standard password login |
| `POST` | `/api/send-otp` | Public | Sends 6-digit email OTP |
| `POST` | `/api/verify-otp` | Public | Verifies email OTP & logs in |
| `GET` | `/api/auth/me` | JWT | Returns authenticated user profile |
| `GET` | `/api/subscriptions` | JWT | Lists user's subscriptions |
| `POST` | `/api/subscriptions` | JWT | Creates a new subscription |
| `PUT` | `/api/subscriptions/:id` | JWT | Updates an existing subscription |
| `DELETE` | `/api/subscriptions/:id` | JWT | Deletes an existing subscription |
| `GET` | `/api/subscriptions/runway`| JWT | Computes Daily/Weekly/Monthly/Annual Runway |
| `POST` | `/api/cron/trigger-now` | Public | Simulates 48-hour alert check & auto-rollover |
| `GET` | `/api/config/firebase` | Public | Dynamic Firebase configuration from server env |

---

## 🚀 Local Setup & Testing

### 1. Clone & Install
```bash
git clone https://github.com/varuntej-tech/micro-subscription-dashboard.git
cd micro-subscription-dashboard
npm install
```

### 2. Configure Environment (`.env`)
Create a `.env` file in the root directory:
```env
PORT=3000
JWT_SECRET=super_secret_subscription_key_123456789
APP_URL=http://localhost:3000

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_APP_ID=your_app_id
```

### 3. Run the App
```bash
npm start
```
Visit `http://localhost:3000` in your browser.

### 4. Run Automated Tests
```bash
npm test
```
Executes all 16 integration tests verifying auth flows, subscription CRUD, runway calculations, and cron rollover.

---

## 🔒 Security & Deployment

* **Zero Keys in Public Git**: All API keys and secrets are loaded dynamically from server environment variables; no credentials are hardcoded in the frontend or committed to source control.
* **Authorized Domain Restrictions**: Google and Firebase authentication enforce authorized domain whitelisting.
* **Bcrypt Password & OTP Hashing**: Sensitive credentials are never stored in plain text.
* **Stateless JWT Authorization**: Protected routes require valid JSON Web Tokens in the `Authorization` header.
