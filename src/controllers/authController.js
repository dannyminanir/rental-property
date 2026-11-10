const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Invite = require('../models/Invite');
const Unit = require('../models/Unit');
const Lease = require('../models/Lease');
const { JWT_SECRET } = require('../middleware/authMiddleware');

function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// 1. Landlord Registration (defaults to pending approval)
async function registerLandlord(req, res) {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      role: 'landlord',
      status: 'pending', // Requires admin approval
    });

    const token = generateToken(user);

    return res.status(201).json({
      message: 'Landlord registration successful. Your account is pending administrator approval.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Register landlord error:', error);
    return res.status(500).json({ message: 'Server error registering landlord.' });
  }
}

// 2. Validate Invite Token (Public)
async function getInviteDetails(req, res) {
  try {
    const { token } = req.params;
    const invite = await Invite.findOne({ token })
      .populate('landlord', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber bedrooms bathrooms monthlyRent');

    if (!invite) {
      return res.status(404).json({ message: 'Invitation link is invalid or has been revoked.' });
    }

    if (invite.status === 'accepted') {
      return res.status(400).json({ message: 'This invitation has already been accepted.' });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'This invitation has expired. Please ask your landlord to resend it.' });
    }

    return res.json({
      invite: {
        token: invite.token,
        landlord: invite.landlord,
        property: invite.property,
        unit: invite.unit,
        suggestedEmail: invite.tenantEmail,
        monthlyRent: invite.monthlyRent,
        leaseStartDate: invite.leaseStartDate,
      },
    });
  } catch (error) {
    console.error('Get invite details error:', error);
    return res.status(500).json({ message: 'Error retrieving invite details.' });
  }
}

// 3. Register Tenant via Invite Link
async function registerTenantWithInvite(req, res) {
  try {
    const { token, name, email, password, phone } = req.body;

    if (!token || !name || !email || !password) {
      return res.status(400).json({ message: 'Token, name, email, and password are required.' });
    }

    const invite = await Invite.findOne({ token });
    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid or already used invitation token.' });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'This invitation has expired.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create tenant (approved by default as they join via landlord invite)
    const tenant = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      role: 'tenant',
      status: 'approved',
    });

    // Update Unit status to occupied
    await Unit.findByIdAndUpdate(invite.unit, {
      status: 'occupied',
      currentTenant: tenant._id,
    });

    // Create active Lease
    await Lease.create({
      landlord: invite.landlord,
      tenant: tenant._id,
      property: invite.property,
      unit: invite.unit,
      startDate: invite.leaseStartDate || new Date(),
      monthlyRent: invite.monthlyRent,
      deposit: invite.monthlyRent,
      status: 'active',
    });

    // Mark invite accepted
    invite.status = 'accepted';
    await invite.save();

    const jwtToken = generateToken(tenant);

    return res.status(201).json({
      message: 'Tenant account created successfully and linked to unit.',
      token: jwtToken,
      user: {
        id: tenant._id,
        name: tenant.name,
        email: tenant.email,
        role: tenant.role,
        status: tenant.status,
      },
    });
  } catch (error) {
    console.error('Tenant invite register error:', error);
    return res.status(500).json({ message: 'Error completing tenant registration.' });
  }
}

// 4. Universal Login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        message: 'Account suspended by administrator.',
        blockedReason: user.blockedReason || 'Terms violation',
        isBlocked: true,
      });
    }

    const token = generateToken(user);

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login.' });
  }
}

// 5. Get current authenticated user details
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user._id).select('-password');
    let extra = {};

    if (user.role === 'tenant') {
      const lease = await Lease.findOne({ tenant: user._id, status: 'active' })
        .populate('property')
        .populate('unit')
        .populate('landlord', 'name email phone');
      extra.lease = lease;
    }

    return res.json({ user, ...extra });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ message: 'Error retrieving user profile.' });
  }
}

module.exports = {
  registerLandlord,
  getInviteDetails,
  registerTenantWithInvite,
  login,
  getMe,
};
