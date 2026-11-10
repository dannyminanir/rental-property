const express = require('express');
const router = express.Router();
const {
  recordPayment,
  getLandlordLeases,
  getTenantPortalData,
  getPaymentHistory,
} = require('../controllers/rentController');
const { protect, restrictTo, requireApprovedLandlord } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/payments', restrictTo('landlord', 'admin'), requireApprovedLandlord, recordPayment);
router.get('/leases', restrictTo('landlord', 'admin'), getLandlordLeases);
router.get('/tenant-portal', restrictTo('tenant', 'admin'), getTenantPortalData);
router.get('/payments/history', getPaymentHistory);

module.exports = router;
