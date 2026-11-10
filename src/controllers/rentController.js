const crypto = require('crypto');
const Lease = require('../models/Lease');
const Payment = require('../models/Payment');
const Unit = require('../models/Unit');
const Property = require('../models/Property');
const User = require('../models/User');
const { sendPaymentReceiptEmail } = require('../services/emailService');

function calculateMonthsElapsed(startDate, targetDate = new Date()) {
  const start = new Date(startDate);
  const now = new Date(targetDate);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

// Compute balance summary for a lease
async function getLeaseBalanceSummary(lease) {
  const monthsElapsed = calculateMonthsElapsed(lease.startDate);
  const totalRentDue = monthsElapsed * lease.monthlyRent;

  const payments = await Payment.find({ lease: lease._id }).sort({ paymentDate: -1 });
  const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const balance = totalRentDue - totalPaid;

  const isOverdue = balance > 0;
  let paymentStatus = 'PAID';
  if (balance > 0) {
    paymentStatus = totalPaid > 0 ? 'PARTIAL' : 'OVERDUE';
  } else if (balance < 0) {
    paymentStatus = 'PREPAID';
  }

  return {
    leaseId: lease._id,
    monthlyRent: lease.monthlyRent,
    startDate: lease.startDate,
    monthsElapsed,
    totalRentDue,
    totalPaid,
    balance,
    isOverdue,
    paymentStatus,
    paymentsCount: payments.length,
    recentPayments: payments.slice(0, 5),
  };
}

// Record a rent payment (Landlord only)
async function recordPayment(req, res) {
  try {
    const { tenantId, leaseId, amount, paymentDate, forMonth, paymentMethod, reference, notes } = req.body;

    if (!amount || (!tenantId && !leaseId)) {
      return res.status(400).json({ message: 'Amount and tenant or lease are required.' });
    }

    let lease;
    if (leaseId) {
      lease = await Lease.findById(leaseId).populate('tenant property unit landlord');
    } else {
      lease = await Lease.findOne({ tenant: tenantId, landlord: req.user._id, status: 'active' })
        .populate('tenant property unit landlord');
    }

    if (!lease) {
      return res.status(404).json({ message: 'Active lease not found for this tenant.' });
    }

    // Ensure landlord owns this lease
    if (String(lease.landlord._id) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to record payments for this lease.' });
    }

    const receiptNumber = `REC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const payment = await Payment.create({
      tenant: lease.tenant._id,
      landlord: lease.landlord._id,
      property: lease.property._id,
      unit: lease.unit._id,
      lease: lease._id,
      amount: Number(amount),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      forMonth: forMonth || new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      paymentMethod: paymentMethod || 'mobile_money',
      reference: reference || '',
      receiptNumber,
      notes: notes || '',
    });

    // Send receipt email to tenant via Resend
    if (lease.tenant.email) {
      sendPaymentReceiptEmail({
        to: lease.tenant.email,
        tenantName: lease.tenant.name,
        amount: Number(amount),
        receiptNumber,
        forMonth: payment.forMonth,
        propertyName: lease.property.name,
        unitNumber: lease.unit.unitNumber,
      }).catch((e) => console.warn('Payment receipt email dispatch notice:', e.message));
    }

    const balanceSummary = await getLeaseBalanceSummary(lease);

    return res.status(201).json({
      message: 'Payment recorded successfully',
      payment,
      balanceSummary,
    });
  } catch (error) {
    console.error('Record payment error:', error);
    return res.status(500).json({ message: 'Error recording rent payment.' });
  }
}

// Get all active leases with balances for landlord
async function getLandlordLeases(req, res) {
  try {
    const leases = await Lease.find({ landlord: req.user._id, status: 'active' })
      .populate('tenant', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber bedrooms monthlyRent')
      .sort({ createdAt: -1 });

    const leasesWithBalances = await Promise.all(
      leases.map(async (lease) => {
        const balanceSummary = await getLeaseBalanceSummary(lease);
        return {
          ...lease.toObject(),
          balanceSummary,
        };
      })
    );

    return res.json({ leases: leasesWithBalances });
  } catch (error) {
    console.error('Get landlord leases error:', error);
    return res.status(500).json({ message: 'Error retrieving leases and balances.' });
  }
}

// Get tenant portal home data (Unit, Lease, Balance, Payment History)
async function getTenantPortalData(req, res) {
  try {
    const tenantId = req.user._id;

    const lease = await Lease.findOne({ tenant: tenantId, status: 'active' })
      .populate('landlord', 'name email phone')
      .populate('property')
      .populate('unit');

    if (!lease) {
      return res.status(200).json({
        hasActiveLease: false,
        message: 'No active lease found. Please contact your landlord for an invitation link.',
      });
    }

    const balanceSummary = await getLeaseBalanceSummary(lease);
    const payments = await Payment.find({ lease: lease._id }).sort({ paymentDate: -1 });

    return res.json({
      hasActiveLease: true,
      lease,
      unit: lease.unit,
      property: lease.property,
      landlord: lease.landlord,
      balanceSummary,
      paymentHistory: payments,
    });
  } catch (error) {
    console.error('Get tenant portal data error:', error);
    return res.status(500).json({ message: 'Error fetching tenant account data.' });
  }
}

// Get all payments for a specific lease or landlord
async function getPaymentHistory(req, res) {
  try {
    let query = {};
    if (req.user.role === 'tenant') {
      query.tenant = req.user._id;
    } else if (req.user.role === 'landlord') {
      query.landlord = req.user._id;
    }

    const { leaseId, unitId } = req.query;
    if (leaseId) query.lease = leaseId;
    if (unitId) query.unit = unitId;

    const payments = await Payment.find(query)
      .populate('tenant', 'name email phone')
      .populate('unit', 'unitNumber')
      .populate('property', 'name')
      .sort({ paymentDate: -1 });

    return res.json({ payments });
  } catch (error) {
    console.error('Get payment history error:', error);
    return res.status(500).json({ message: 'Error fetching payments.' });
  }
}

module.exports = {
  recordPayment,
  getLandlordLeases,
  getTenantPortalData,
  getPaymentHistory,
  getLeaseBalanceSummary,
};
