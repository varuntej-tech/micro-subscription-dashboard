const { v4: uuidv4 } = require('uuid');
const { allAsync, getAsync, runAsync } = require('../db/database');

/**
 * Validate date format YYYY-MM-DD
 */
const isValidDate = (dStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return false;
  const d = new Date(dStr);
  return d instanceof Date && !isNaN(d.getTime());
};

/**
 * GET /api/subscriptions
 * Fetches all subscriptions for the authenticated user
 */
const getSubscriptions = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { category, search, sort = 'next_renewal_date', order = 'ASC' } = req.query;

    let sql = `SELECT * FROM subscriptions WHERE user_id = ?`;
    const params = [userId];

    if (category && category !== 'All') {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      sql += ` AND service_name LIKE ?`;
      params.push(`%${search.trim()}%`);
    }

    // Safe sorting columns
    const allowedSort = ['next_renewal_date', 'cost', 'service_name', 'created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'next_renewal_date';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    sql += ` ORDER BY ${sortCol} ${sortOrder}`;

    const subscriptions = await allAsync(sql, params);

    return res.json({
      success: true,
      subscriptions
    });
  } catch (error) {
    console.error('[SubscriptionController.getSubscriptions] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch subscriptions' 
    });
  }
};

/**
 * POST /api/subscriptions
 * Adds a new subscription for the authenticated user
 */
const createSubscription = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      service_name,
      cost,
      currency = 'INR',
      billing_cycle,
      next_renewal_date,
      category = 'Other'
    } = req.body;

    // Validations
    if (!service_name || !service_name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Service name is required' 
      });
    }

    const numCost = parseFloat(cost);
    if (isNaN(numCost) || numCost <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cost must be a positive number' 
      });
    }

    const normalizedCycle = (billing_cycle || '').trim().toLowerCase();
    if (!['monthly', 'annual'].includes(normalizedCycle)) {
      return res.status(400).json({ 
        success: false, 
        error: "Billing cycle must be either 'monthly' or 'annual'" 
      });
    }

    if (!next_renewal_date || !isValidDate(next_renewal_date)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Next renewal date must be a valid date in YYYY-MM-DD format' 
      });
    }

    const subId = uuidv4();
    const createdAt = new Date().toISOString();

    await runAsync(
      `INSERT INTO subscriptions (
        sub_id, user_id, service_name, category, cost, currency, billing_cycle, next_renewal_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subId,
        userId,
        service_name.trim(),
        category.trim() || 'Other',
        numCost,
        currency.trim().toUpperCase() || 'INR',
        normalizedCycle,
        next_renewal_date,
        createdAt
      ]
    );

    const newSub = await getAsync(`SELECT * FROM subscriptions WHERE sub_id = ?`, [subId]);

    return res.status(201).json({
      success: true,
      message: 'Subscription added successfully',
      subscription: newSub
    });
  } catch (error) {
    console.error('[SubscriptionController.createSubscription] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create subscription' 
    });
  }
};

/**
 * PUT /api/subscriptions/:id
 * Updates an existing subscription
 */
const updateSubscription = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const subId = req.params.id;

    // Check ownership
    const existing = await getAsync(
      `SELECT * FROM subscriptions WHERE sub_id = ? AND user_id = ?`,
      [subId, userId]
    );

    if (!existing) {
      return res.status(404).json({ 
        success: false, 
        error: 'Subscription not found' 
      });
    }

    const {
      service_name,
      cost,
      currency,
      billing_cycle,
      next_renewal_date,
      category
    } = req.body;

    const updatedService = service_name ? service_name.trim() : existing.service_name;
    const updatedCost = cost !== undefined ? parseFloat(cost) : existing.cost;
    const updatedCurrency = currency ? currency.trim().toUpperCase() : existing.currency;
    const updatedCycle = billing_cycle ? billing_cycle.trim().toLowerCase() : existing.billing_cycle;
    const updatedDate = next_renewal_date ? next_renewal_date : existing.next_renewal_date;
    const updatedCategory = category ? category.trim() : existing.category;

    if (isNaN(updatedCost) || updatedCost <= 0) {
      return res.status(400).json({ success: false, error: 'Cost must be greater than zero' });
    }

    if (!['monthly', 'annual'].includes(updatedCycle)) {
      return res.status(400).json({ success: false, error: "Billing cycle must be 'monthly' or 'annual'" });
    }

    if (!isValidDate(updatedDate)) {
      return res.status(400).json({ success: false, error: 'Invalid renewal date format' });
    }

    await runAsync(
      `UPDATE subscriptions SET 
        service_name = ?, cost = ?, currency = ?, billing_cycle = ?, next_renewal_date = ?, category = ?
       WHERE sub_id = ? AND user_id = ?`,
      [updatedService, updatedCost, updatedCurrency, updatedCycle, updatedDate, updatedCategory, subId, userId]
    );

    const updated = await getAsync(`SELECT * FROM subscriptions WHERE sub_id = ?`, [subId]);

    return res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: updated
    });
  } catch (error) {
    console.error('[SubscriptionController.updateSubscription] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to update subscription' 
    });
  }
};

/**
 * DELETE /api/subscriptions/:id
 * Deletes a subscription
 */
const deleteSubscription = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const subId = req.params.id;

    const result = await runAsync(
      `DELETE FROM subscriptions WHERE sub_id = ? AND user_id = ?`,
      [subId, userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Subscription not found or not authorized' 
      });
    }

    return res.json({
      success: true,
      message: 'Subscription removed successfully'
    });
  } catch (error) {
    console.error('[SubscriptionController.deleteSubscription] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to delete subscription' 
    });
  }
};

/**
 * GET /api/subscriptions/runway
 * Aggregates Daily, Weekly, Monthly, and Annual run-rates + Category breakdown
 */
const getRunwayMetrics = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const subscriptions = await allAsync(
      `SELECT * FROM subscriptions WHERE user_id = ?`,
      [userId]
    );

    let dailyRunRate = 0;
    let monthlyRunRate = 0;
    const categoryTotals = {};
    const currency = subscriptions[0]?.currency || 'INR';

    for (const sub of subscriptions) {
      const cost = Number(sub.cost);
      let monthlyEquivalent = 0;
      let dailyEquivalent = 0;

      if (sub.billing_cycle === 'annual') {
        monthlyEquivalent = cost / 12;
        dailyEquivalent = cost / 365;
      } else {
        // monthly
        monthlyEquivalent = cost;
        dailyEquivalent = cost / 30.42;
      }

      dailyRunRate += dailyEquivalent;
      monthlyRunRate += monthlyEquivalent;

      // Category breakdown
      const cat = sub.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + monthlyEquivalent;
    }

    const weeklyRunRate = dailyRunRate * 7;
    const annualRunRate = monthlyRunRate * 12;

    // Upcoming renewals within 7 days
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const upcomingRenewals = subscriptions
      .filter(s => s.next_renewal_date >= today && s.next_renewal_date <= sevenDaysLater)
      .sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date));

    return res.json({
      success: true,
      metrics: {
        totalSubscriptions: subscriptions.length,
        currency,
        dailyRunRate: Math.round(dailyRunRate * 100) / 100,
        weeklyRunRate: Math.round(weeklyRunRate * 100) / 100,
        monthlyRunRate: Math.round(monthlyRunRate * 100) / 100,
        annualRunRate: Math.round(annualRunRate * 100) / 100,
        categoryBreakdown: categoryTotals,
        upcomingNext7Days: upcomingRenewals
      }
    });
  } catch (error) {
    console.error('[SubscriptionController.getRunwayMetrics] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate runway metrics' 
    });
  }
};

module.exports = {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getRunwayMetrics
};
