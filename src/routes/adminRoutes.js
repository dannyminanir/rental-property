const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getPendingLandlords,
  approveLandlord,
  rejectLandlord,
  getAllUsers,
  blockUser,
  unblockUser,
  getAllProperties,
  getUnhandledEmergencyRequests,
  getEmailLogs,
} = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);
router.use(restrictTo('admin'));

router.get('/stats', getAdminStats);
router.get('/pending-landlords', getPendingLandlords);
router.put('/approve-landlord/:id', approveLandlord);
router.put('/reject-landlord/:id', rejectLandlord);
router.get('/users', getAllUsers);
router.put('/block-user/:id', blockUser);
router.put('/unblock-user/:id', unblockUser);
router.get('/properties', getAllProperties);
router.get('/unhandled-emergencies', getUnhandledEmergencyRequests);
router.get('/emails', getEmailLogs);

module.exports = router;
