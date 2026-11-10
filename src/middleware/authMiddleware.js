const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'rentpulse_super_secret_jwt_key_2026';

async function protect(req, res, next) {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User belonging to this token no longer exists.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        message: 'Your account has been suspended by the platform administrator.',
        blockedReason: user.blockedReason || 'Terms of service violation',
        isBlocked: true,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}

/**
 * Restrict to specific roles (e.g. ['admin'], ['landlord'], ['tenant'])
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: Access restricted to [${roles.join(', ')}] role(s).`,
      });
    }
    next();
  };
}

/**
 * Ensure landlord is approved before managing properties/leases
 */
function requireApprovedLandlord(req, res, next) {
  if (req.user.role === 'landlord' && req.user.status !== 'approved') {
    return res.status(403).json({
      message: 'Your landlord account is currently pending administrator approval.',
      status: req.user.status,
      isPendingApproval: true,
    });
  }
  next();
}

module.exports = {
  protect,
  restrictTo,
  requireApprovedLandlord,
  JWT_SECRET,
};
