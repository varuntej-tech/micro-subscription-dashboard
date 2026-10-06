const cron = require('node-cron');
const { allAsync, runAsync } = require('../db/database');
const { sendRenewalReminderEmail } = require('./emailService');

/**
 * Format a Date object to YYYY-MM-DD
 */
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Advance a date string by 1 month or 1 year
 */
const advanceDate = (dateStr, billingCycle) => {
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  if (billingCycle === 'annual') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    // monthly: handle month advancement safely
    const originalDay = date.getDate();
    date.setMonth(date.getMonth() + 1);
    // If month jumped by 2 due to varying month lengths (e.g. Jan 31 -> Mar 2), clamp to last day
    if (date.getDate() !== originalDay) {
      date.setDate(0);
    }
  }

  return formatDate(date);
};

/**
 * Executes the daily renewal check
 * @param {string} [simulatedDate] Optional YYYY-MM-DD for testing
 */
const runDailyRenewalCheck = async (simulatedDate = null) => {
  const now = simulatedDate ? new Date(simulatedDate + 'T00:00:00') : new Date();
  const todayStr = formatDate(now);

  // Target date exactly 48 hours (2 days) away
  const targetDateObj = new Date(now);
  targetDateObj.setDate(targetDateObj.getDate() + 2);
  const targetDateStr = formatDate(targetDateObj);

  console.log(`[CronJob] 🕒 Running daily check. Today: ${todayStr}, 48-Hour Target: ${targetDateStr}`);

  const results = {
    checkedAt: new Date().toISOString(),
    today: todayStr,
    targetDate: targetDateStr,
    remindersSent: 0,
    renewalsRolledOver: 0,
    details: {
      reminders: [],
      rollovers: []
    }
  };

  try {
    // 1. Find all subscriptions where next_renewal_date is exactly 48 hours away
    // Only send to verified users
    const query48h = `
      SELECT s.*, u.email, u.is_verified 
      FROM subscriptions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.next_renewal_date = ? AND u.is_verified = 1
    `;
    const upcomingRenewals = await allAsync(query48h, [targetDateStr]);

    for (const sub of upcomingRenewals) {
      console.log(`[CronJob] 🔔 48-Hour Renewal Warning for ${sub.service_name} to ${sub.email}`);
      await sendRenewalReminderEmail({
        to: sub.email,
        serviceName: sub.service_name,
        cost: sub.cost,
        currency: sub.currency,
        nextRenewalDate: sub.next_renewal_date,
        billingCycle: sub.billing_cycle
      });

      results.remindersSent++;
      results.details.reminders.push({
        subId: sub.sub_id,
        serviceName: sub.service_name,
        email: sub.email,
        renewalDate: sub.next_renewal_date
      });
    }

    // 2. Automatically advance next_renewal_date for subscriptions that have passed (date < today)
    const overdueQuery = `
      SELECT sub_id, service_name, billing_cycle, next_renewal_date 
      FROM subscriptions 
      WHERE next_renewal_date < ?
    `;
    const overdueSubs = await allAsync(overdueQuery, [todayStr]);

    for (const sub of overdueSubs) {
      let nextDate = sub.next_renewal_date;
      // Advance until nextDate is in the future or today
      while (nextDate < todayStr) {
        nextDate = advanceDate(nextDate, sub.billing_cycle);
      }

      await runAsync(
        `UPDATE subscriptions SET next_renewal_date = ? WHERE sub_id = ?`,
        [nextDate, sub.sub_id]
      );

      console.log(`[CronJob] 🔄 Advanced renewal for ${sub.service_name} from ${sub.next_renewal_date} to ${nextDate}`);

      results.renewalsRolledOver++;
      results.details.rollovers.push({
        subId: sub.sub_id,
        serviceName: sub.service_name,
        oldDate: sub.next_renewal_date,
        newDate: nextDate,
        billingCycle: sub.billing_cycle
      });
    }

    console.log(`[CronJob] ✅ Completed: ${results.remindersSent} reminders sent, ${results.renewalsRolledOver} renewals rolled over.`);
    return results;
  } catch (error) {
    console.error('[CronJob] ❌ Error running daily renewal check:', error);
    throw error;
  }
};

/**
 * Initialize the scheduled cron job running at 12:00 AM (0 0 * * *)
 */
const initCronJobs = () => {
  // Cron schedule: At 00:00 (12:00 AM) every day
  cron.schedule('0 0 * * *', async () => {
    console.log('[CronScheduler] Running scheduled 12:00 AM renewal automation...');
    try {
      await runDailyRenewalCheck();
    } catch (err) {
      console.error('[CronScheduler] Scheduled execution error:', err.message);
    }
  });

  console.log('[CronScheduler] Daily cron job scheduled for 12:00 AM (0 0 * * *)');
};

module.exports = {
  initCronJobs,
  runDailyRenewalCheck,
  formatDate,
  advanceDate
};
