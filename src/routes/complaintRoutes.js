const express = require('express');
const router = express.Router();
const {
  submitComplaint,
  getTenantComplaints,
  getAllComplaints,
  updateComplaintStatus,
} = require('../controllers/complaintController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/', restrictTo('tenant'), submitComplaint);
router.get('/my-complaints', restrictTo('tenant'), getTenantComplaints);
router.get('/', restrictTo('admin'), getAllComplaints);
router.put('/:id', restrictTo('admin'), updateComplaintStatus);

module.exports = router;
