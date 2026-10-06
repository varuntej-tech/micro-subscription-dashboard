const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { requireAuth } = require('../middleware/authMiddleware');

// All subscription routes require JWT and strictly verified user status
router.use(requireAuth);

router.get('/', subscriptionController.getSubscriptions);
router.post('/', subscriptionController.createSubscription);
router.put('/:id', subscriptionController.updateSubscription);
router.delete('/:id', subscriptionController.deleteSubscription);
router.get('/runway', subscriptionController.getRunwayMetrics);

module.exports = router;
