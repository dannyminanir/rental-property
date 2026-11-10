const express = require('express');
const router = express.Router();
const {
  createMaintenanceRequest,
  answerFollowUpQuestion,
  getLandlordRequests,
  getTenantRequests,
  updateRequestStatus,
  overrideTriageClassification,
  testTriageEndpoint,
} = require('../controllers/maintenanceController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/test-triage', testTriageEndpoint);

// Tenant routes
router.post('/', restrictTo('tenant'), createMaintenanceRequest);
router.get('/my-requests', restrictTo('tenant'), getTenantRequests);
router.post('/:id/answer-follow-up', restrictTo('tenant'), answerFollowUpQuestion);

// Landlord / Admin routes
router.get('/landlord-requests', restrictTo('landlord', 'admin'), getLandlordRequests);
router.put('/:id/status', restrictTo('landlord', 'admin'), updateRequestStatus);
router.put('/:id/override-triage', restrictTo('landlord', 'admin'), overrideTriageClassification);

module.exports = router;
