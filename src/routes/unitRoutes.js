const express = require('express');
const router = express.Router();
const {
  getUnitsByProperty,
  getAllLandlordUnits,
  createUnit,
  updateUnit,
  generateAiUnitDescription,
  createTenantInvite,
  assignTenantDirect,
} = require('../controllers/unitController');
const { protect, restrictTo, requireApprovedLandlord } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/property/:propertyId', getUnitsByProperty);
router.get('/all', restrictTo('landlord', 'admin'), getAllLandlordUnits);
router.post('/', restrictTo('landlord', 'admin'), requireApprovedLandlord, createUnit);
router.put('/:id', restrictTo('landlord', 'admin'), requireApprovedLandlord, updateUnit);
router.post('/:id/generate-ai-description', restrictTo('landlord', 'admin'), generateAiUnitDescription);
router.post('/invite', restrictTo('landlord', 'admin'), requireApprovedLandlord, createTenantInvite);
router.post('/assign', restrictTo('landlord', 'admin'), requireApprovedLandlord, assignTenantDirect);

module.exports = router;
