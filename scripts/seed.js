const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { runAsync, getAsync } = require('../src/db/database');
const { formatDate } = require('../src/services/cronService');

async function seed() {
  console.log('[Seed] Seeding sample data into database...');

  // Create demo verified user
  const email = 'demo@microsub.com';
  const password = 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
  let userId = user ? user.user_id : uuidv4();

  if (!user) {
    await runAsync(
      `INSERT INTO users (user_id, email, password_hash, is_verified, created_at)
       VALUES (?, ?, ?, 1, ?)`,
      [userId, email, passwordHash, new Date().toISOString()]
    );
    console.log(`[Seed] Created verified demo user: ${email} (Password: ${password})`);
  } else {
    console.log(`[Seed] Demo user already exists: ${email}`);
  }

  // Calculate dates relative to today
  const today = new Date();
  
  // 48 hours away (Target for cron alert)
  const alertDate = new Date(today);
  alertDate.setDate(alertDate.getDate() + 2);

  // 7 days away
  const nextWeekDate = new Date(today);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);

  // 18 days away
  const laterDate = new Date(today);
  laterDate.setDate(laterDate.getDate() + 18);

  // Past due date
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 3);

  // Sample subscriptions
  const sampleSubs = [
    {
      service_name: 'Netflix Premium',
      cost: 649.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: formatDate(alertDate), // Will trigger 48-hour alert!
      category: 'Entertainment'
    },
    {
      service_name: 'Spotify Family',
      cost: 179.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: formatDate(nextWeekDate),
      category: 'Entertainment'
    },
    {
      service_name: 'GitHub Copilot',
      cost: 850.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: formatDate(laterDate),
      category: 'Dev Tools'
    },
    {
      service_name: 'AWS Cloud EC2',
      cost: 2150.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: formatDate(alertDate), // Another 48-hour alert
      category: 'Cloud & Infra'
    },
    {
      service_name: 'Amazon Prime Video',
      cost: 1499.00,
      currency: 'INR',
      billing_cycle: 'annual',
      next_renewal_date: '2027-02-14',
      category: 'Entertainment'
    },
    {
      service_name: 'ChatGPT Plus',
      cost: 1999.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: formatDate(laterDate),
      category: 'Productivity'
    }
  ];

  for (const s of sampleSubs) {
    const existing = await getAsync(
      'SELECT sub_id FROM subscriptions WHERE user_id = ? AND service_name = ?',
      [userId, s.service_name]
    );

    if (!existing) {
      await runAsync(
        `INSERT INTO subscriptions (
          sub_id, user_id, service_name, category, cost, currency, billing_cycle, next_renewal_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          s.service_name,
          s.category,
          s.cost,
          s.currency,
          s.billing_cycle,
          s.next_renewal_date,
          new Date().toISOString()
        ]
      );
      console.log(`[Seed] Added subscription: ${s.service_name} (${s.next_renewal_date})`);
    }
  }

  console.log('[Seed] Seeding completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
