const User = require('../models/User');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Lease = require('../models/Lease');
const Payment = require('../models/Payment');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const Complaint = require('../models/Complaint');
const { sendLandlordApprovalEmail, getEmailAuditLog } = require('../services/emailService');

// Admin Platform Overview & Statistics
async function getAdminStats(req, res) {
  try {
    const totalLandlords = await User.countDocuments({ role: 'landlord' });
    const pendingLandlords = await User.countDocuments({ role: 'landlord', status: 'pending' });
    const approvedLandlords = await User.countDocuments({ role: 'landlord', status: 'approved' });
    const totalTenants = await User.countDocuments({ role: 'tenant' });
    const blockedUsers = await User.countDocuments({ status: 'blocked' });

    const totalProperties = await Property.countDocuments();
    const totalUnits = await Unit.countDocuments();
    const occupiedUnits = await Unit.countDocuments({ status: 'occupied' });
    const vacantUnits = totalUnits - occupiedUnits;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const openRequests = await MaintenanceRequest.countDocuments({ status: 'open' });
    const inProgressRequests = await MaintenanceRequest.countDocuments({ status: 'in_progress' });
    const fixedRequests = await MaintenanceRequest.countDocuments({ status: 'fixed' });
    const openEmergencies = await MaintenanceRequest.countDocuments({ is_emergency: true, status: 'open' });

    // Emergency requests not marked in_progress within 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unhandledEmergencies24h = await MaintenanceRequest.countDocuments({
      is_emergency: true,
      status: 'open',
      createdAt: { $lte: twentyFourHoursAgo },
    });

    const openComplaints = await Complaint.countDocuments({ status: 'open' });

    const payments = await Payment.find();
    const totalRentCollected = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

    return res.json({
      stats: {
        totalLandlords,
        pendingLandlords,
        approvedLandlords,
        totalTenants,
        blockedUsers,
        totalProperties,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        occupancyRate,
        openRequests,
        inProgressRequests,
        fixedRequests,
        openEmergencies,
        unhandledEmergencies24h,
        openComplaints,
        totalRentCollected,
      },
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    return res.status(500).json({ message: 'Error compiling admin stats.' });
  }
}

// Get landlords waiting for approval
async function getPendingLandlords(req, res) {
  try {
    const pendingLandlords = await User.find({ role: 'landlord', status: 'pending' }).sort({ createdAt: -1 });
    return res.json({ pendingLandlords });
  } catch (error) {
    console.error('Get pending landlords error:', error);
    return res.status(500).json({ message: 'Error retrieving pending landlords.' });
  }
}

// Approve a landlord account
async function approveLandlord(req, res) {
  try {
    const { id } = req.params;
    const landlord = await User.findById(id);

    if (!landlord || landlord.role !== 'landlord') {
      return res.status(404).json({ message: 'Landlord account not found.' });
    }

    landlord.status = 'approved';
    await landlord.save();

    // Dispatch approval notification email via Resend
    if (landlord.email) {
      sendLandlordApprovalEmail({ to: landlord.email, name: landlord.name })
        .catch((e) => console.warn('Approval email notification:', e.message));
    }

    return res.json({
      message: `Landlord ${landlord.name} has been approved successfully. Notification email dispatched.`,
      landlord,
    });
  } catch (error) {
    console.error('Approve landlord error:', error);
    return res.status(500).json({ message: 'Error approving landlord.' });
  }
}

// Reject a landlord account
async function rejectLandlord(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const landlord = await User.findById(id);

    if (!landlord || landlord.role !== 'landlord') {
      return res.status(404).json({ message: 'Landlord account not found.' });
    }

    landlord.status = 'blocked';
    landlord.blockedReason = reason || 'Registration application rejected by admin.';
    await landlord.save();

    return res.json({ message: `Landlord application rejected.`, landlord });
  } catch (error) {
    console.error('Reject landlord error:', error);
    return res.status(500).json({ message: 'Error rejecting landlord.' });
  }
}

// Get all users
async function getAllUsers(req, res) {
  try {
    const { role, status, search } = req.query;
    let query = {};

    if (role && role !== 'all') query.role = role;
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ message: 'Error fetching users.' });
  }
}

// Block / suspend an account with a mandatory reason
async function blockUser(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required to block an account.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot block platform administrators.' });
    }

    user.status = 'blocked';
    user.blockedReason = reason.trim();
    await user.save();

    return res.json({ message: `Account for ${user.name} has been blocked.`, user });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ message: 'Error blocking user.' });
  }
}

// Unblock an account
async function unblockUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.status = 'approved';
    user.blockedReason = '';
    await user.save();

    return res.json({ message: `Account for ${user.name} has been restored and unblocked.`, user });
  } catch (error) {
    console.error('Unblock user error:', error);
    return res.status(500).json({ message: 'Error unblocking user.' });
  }
}

// Get all properties across platform
async function getAllProperties(req, res) {
  try {
    const properties = await Property.find()
      .populate('landlord', 'name email phone status')
      .sort({ createdAt: -1 });

    const detailedProperties = await Promise.all(
      properties.map(async (prop) => {
        const units = await Unit.find({ property: prop._id }).populate('currentTenant', 'name email');
        return {
          ...prop.toObject(),
          totalUnits: units.length,
          occupiedUnits: units.filter((u) => u.status === 'occupied').length,
          units,
        };
      })
    );

    return res.json({ properties: detailedProperties });
  } catch (error) {
    console.error('Get all properties error:', error);
    return res.status(500).json({ message: 'Error retrieving all properties.' });
  }
}

// Emergency requests left unhandled (> 24 hours without being marked in-progress or fixed)
async function getUnhandledEmergencyRequests(req, res) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unhandled = await MaintenanceRequest.find({
      is_emergency: true,
      status: 'open',
      createdAt: { $lte: twentyFourHoursAgo },
    })
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber')
      .sort({ createdAt: 1 });

    // Also get active emergencies created recently (<24h) for complete situational awareness
    const activeRecent = await MaintenanceRequest.find({
      is_emergency: true,
      status: 'open',
      createdAt: { $gt: twentyFourHoursAgo },
    })
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber')
      .sort({ createdAt: -1 });

    return res.json({
      criticalOverdue24h: unhandled,
      activeRecentEmergencies: activeRecent,
      totalUnhandledOverdue: unhandled.length,
    });
  } catch (error) {
    console.error('Get unhandled emergencies error:', error);
    return res.status(500).json({ message: 'Error retrieving unhandled emergency requests.' });
  }
}

// Email activity log (for live inspection of Resend dispatches)
async function getEmailLogs(req, res) {
  try {
    const logs = getEmailAuditLog();
    return res.json({ emails: logs });
  } catch (error) {
    return res.status(500).json({ message: 'Error retrieving email logs.' });
  }
}

module.exports = {
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
};
