const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.NODE_ENV === 'test' 
  ? ':memory:' 
  : path.join(dbDir, 'subscription_manager.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log(`Connected to SQLite database at ${dbPath}`);
  }
});

// Enable Foreign Keys and WAL Mode
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.run('PRAGMA journal_mode = WAL;');
  }

  // Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      token_expires_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Subscriptions Table (One-to-Many Relationship with Users)
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
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
  `);

  // Email OTPs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS email_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_subs_renewal ON subscriptions(next_renewal_date);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_otps_expiry ON email_otps(expires_at);`);
});

// Async helper functions
const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

module.exports = {
  db,
  getAsync,
  allAsync,
  runAsync
};
