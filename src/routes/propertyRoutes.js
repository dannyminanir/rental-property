const express = require('express');
const router = express.Router();
const {
  getLandlordProperties,
  createProperty,
  updateProperty,
  deleteProperty,
} = require('../controllers/propertyController');
const { protect, restrictTo, requireApprovedLandlord } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', restrictTo('landlord', 'admin'), getLandlordProperties);
router.post('/', restrictTo('landlord', 'admin'), requireApprovedLandlord, createProperty);
router.put('/:id', restrictTo('landlord', 'admin'), requireApprovedLandlord, updateProperty);
router.delete('/:id', restrictTo('landlord', 'admin'), requireApprovedLandlord, deleteProperty);

module.exports = router;
