const express = require('express');
const router = express.Router();
const {
  registerLandlord,
  getInviteDetails,
  registerTenantWithInvite,
  login,
  getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register/landlord', registerLandlord);
router.get('/invite/:token', getInviteDetails);
router.post('/register/tenant', registerTenantWithInvite);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
