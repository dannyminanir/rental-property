const crypto = require('crypto');
const Unit = require('../models/Unit');
const Property = require('../models/Property');
const Invite = require('../models/Invite');
const Lease = require('../models/Lease');
const User = require('../models/User');
const { sendTenantInviteEmail } = require('../services/emailService');
const { generateListingDescription } = require('../services/aiService');

// Get units for a property
async function getUnitsByProperty(req, res) {
  try {
    const { propertyId } = req.params;

    // Verify ownership
    const property = await Property.findOne({ _id: propertyId, landlord: req.user._id });
    if (!property && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized or property not found.' });
    }

    const units = await Unit.find({ property: propertyId })
      .populate('currentTenant', 'name email phone')
      .sort({ unitNumber: 1 });

    return res.json({ units });
  } catch (error) {
    console.error('Get units error:', error);
    return res.status(500).json({ message: 'Error retrieving units.' });
  }
}

// Get all units owned by landlord
async function getAllLandlordUnits(req, res) {
  try {
    const properties = await Property.find({ landlord: req.user._id }).select('_id');
    const propertyIds = properties.map((p) => p._id);

    const units = await Unit.find({ property: { $in: propertyIds } })
      .populate('property', 'name address city')
      .populate('currentTenant', 'name email phone')
      .sort({ createdAt: -1 });

    return res.json({ units });
  } catch (error) {
    console.error('Get all landlord units error:', error);
    return res.status(500).json({ message: 'Error fetching units.' });
  }
}

// Create new unit
async function createUnit(req, res) {
  try {
    const { propertyId, unitNumber, bedrooms, bathrooms, squareFeet, monthlyRent, amenities, photoUrl } = req.body;

    if (!propertyId || !unitNumber || !monthlyRent) {
      return res.status(400).json({ message: 'Property, unit number, and monthly rent are required.' });
    }

    const property = await Property.findOne({ _id: propertyId, landlord: req.user._id });
    if (!property) {
      return res.status(404).json({ message: 'Property not found or unauthorized.' });
    }

    const existingUnit = await Unit.findOne({ property: propertyId, unitNumber: unitNumber.trim() });
    if (existingUnit) {
      return res.status(400).json({ message: `Unit ${unitNumber} already exists in this property.` });
    }

    const unit = await Unit.create({
      property: propertyId,
      unitNumber: unitNumber.trim(),
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      squareFeet: Number(squareFeet) || 600,
      monthlyRent: Number(monthlyRent),
      amenities: Array.isArray(amenities) ? amenities : (amenities ? amenities.split(',').map((s) => s.trim()) : []),
      photoUrl: photoUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
      status: 'vacant',
    });

    return res.status(201).json({ message: 'Unit created successfully', unit });
  } catch (error) {
    console.error('Create unit error:', error);
    return res.status(500).json({ message: 'Error creating unit.' });
  }
}

// Update unit
async function updateUnit(req, res) {
  try {
    const { id } = req.params;
    const unit = await Unit.findById(id).populate('property');

    if (!unit || String(unit.property.landlord) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Unit not found or unauthorized.' });
    }

    const { unitNumber, bedrooms, bathrooms, squareFeet, monthlyRent, amenities, photoUrl, status } = req.body;

    if (unitNumber) unit.unitNumber = unitNumber.trim();
    if (bedrooms !== undefined) unit.bedrooms = Number(bedrooms);
    if (bathrooms !== undefined) unit.bathrooms = Number(bathrooms);
    if (squareFeet !== undefined) unit.squareFeet = Number(squareFeet);
    if (monthlyRent !== undefined) unit.monthlyRent = Number(monthlyRent);
    if (amenities !== undefined) {
      unit.amenities = Array.isArray(amenities) ? amenities : amenities.split(',').map((s) => s.trim());
    }
    if (photoUrl) unit.photoUrl = photoUrl;
    if (status) unit.status = status;

    await unit.save();

    return res.json({ message: 'Unit updated successfully', unit });
  } catch (error) {
    console.error('Update unit error:', error);
    return res.status(500).json({ message: 'Error updating unit.' });
  }
}

// Generate AI listing description for unit (Stretch Goal)
async function generateAiUnitDescription(req, res) {
  try {
    const { id } = req.params;
    const unit = await Unit.findById(id).populate('property');

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found.' });
    }

    const description = await generateListingDescription({
      unitNumber: unit.unitNumber,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      squareFeet: unit.squareFeet,
      monthlyRent: unit.monthlyRent,
      amenities: unit.amenities,
      propertyName: unit.property.name,
      city: unit.property.city,
    });

    unit.aiGeneratedDescription = description;
    await unit.save();

    return res.json({ message: 'AI listing description generated successfully', description });
  } catch (error) {
    console.error('AI unit description error:', error);
    return res.status(500).json({ message: 'Error generating AI description.' });
  }
}

// Create tenant invite link & send email via Resend
async function createTenantInvite(req, res) {
  try {
    const { unitId, tenantEmail, leaseStartDate, customRent } = req.body;

    if (!unitId) {
      return res.status(400).json({ message: 'Unit ID is required.' });
    }

    const unit = await Unit.findById(unitId).populate('property');
    if (!unit || String(unit.property.landlord) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Unit not found or unauthorized.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const rentAmount = customRent ? Number(customRent) : unit.monthlyRent;

    const invite = await Invite.create({
      token,
      landlord: req.user._id,
      property: unit.property._id,
      unit: unit._id,
      tenantEmail: tenantEmail ? tenantEmail.toLowerCase().trim() : '',
      monthlyRent: rentAmount,
      leaseStartDate: leaseStartDate ? new Date(leaseStartDate) : new Date(),
      status: 'pending',
    });

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
    const inviteLink = `${frontendBase}/invite/${token}`;

    let emailResult = null;
    if (tenantEmail) {
      emailResult = await sendTenantInviteEmail({
        to: tenantEmail.trim(),
        landlordName: req.user.name,
        propertyName: unit.property.name,
        unitNumber: unit.unitNumber,
        inviteLink,
        monthlyRent: rentAmount,
      });
    }

    const emailSent = emailResult?.success === true;

    return res.status(201).json({
      message: emailSent || !tenantEmail
        ? 'Tenant invite created successfully'
        : 'Tenant invite created, but the email could not be sent.',
      inviteLink,
      token,
      emailSent,
      emailError: emailResult?.success === false ? emailResult.error : undefined,
      emailResult,
      invite,
    });
  } catch (error) {
    console.error('Create tenant invite error:', error);
    return res.status(500).json({ message: 'Error generating tenant invite.' });
  }
}

// Direct assign tenant to unit (optional alternative to invite link)
async function assignTenantDirect(req, res) {
  try {
    const { unitId, tenantEmail, startDate, monthlyRent } = req.body;

    const unit = await Unit.findById(unitId).populate('property');
    if (!unit || String(unit.property.landlord) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Unit not found or unauthorized.' });
    }

    const tenant = await User.findOne({ email: tenantEmail.toLowerCase().trim(), role: 'tenant' });
    if (!tenant) {
      return res.status(404).json({ message: 'No registered tenant found with that email. Use an invite link instead.' });
    }

    unit.status = 'occupied';
    unit.currentTenant = tenant._id;
    await unit.save();

    const lease = await Lease.create({
      landlord: req.user._id,
      tenant: tenant._id,
      property: unit.property._id,
      unit: unit._id,
      startDate: startDate ? new Date(startDate) : new Date(),
      monthlyRent: monthlyRent ? Number(monthlyRent) : unit.monthlyRent,
      deposit: monthlyRent ? Number(monthlyRent) : unit.monthlyRent,
      status: 'active',
    });

    return res.json({ message: 'Tenant assigned to unit successfully', unit, lease });
  } catch (error) {
    console.error('Assign tenant direct error:', error);
    return res.status(500).json({ message: 'Error assigning tenant.' });
  }
}

module.exports = {
  getUnitsByProperty,
  getAllLandlordUnits,
  createUnit,
  updateUnit,
  generateAiUnitDescription,
  createTenantInvite,
  assignTenantDirect,
};
