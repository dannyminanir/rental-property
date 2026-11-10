const Complaint = require('../models/Complaint');
const Lease = require('../models/Lease');

// Tenant files a complaint to Admin
async function submitComplaint(req, res) {
  try {
    const { subject, description, urgency, relatedMaintenanceRequestId } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required.' });
    }

    const lease = await Lease.findOne({ tenant: req.user._id, status: 'active' })
      .populate('property')
      .populate('unit');

    if (!lease) {
      return res.status(400).json({
        message: 'You need an active lease with a registered landlord to submit a complaint.',
      });
    }

    const complaint = await Complaint.create({
      tenant: req.user._id,
      landlord: lease.landlord,
      property: lease.property?._id,
      unit: lease.unit?._id,
      relatedMaintenanceRequest: relatedMaintenanceRequestId || null,
      subject: subject.trim(),
      description: description.trim(),
      urgency: urgency === 'urgent' ? 'urgent' : 'normal',
      status: 'open',
    });

    return res.status(201).json({
      message: 'Complaint submitted to platform administrators for investigation.',
      complaint,
    });
  } catch (error) {
    console.error('Submit complaint error:', error);
    return res.status(500).json({ message: 'Error submitting complaint.' });
  }
}

// Tenant views their complaints
async function getTenantComplaints(req, res) {
  try {
    const complaints = await Complaint.find({ tenant: req.user._id })
      .populate('landlord', 'name email phone')
      .populate('property', 'name')
      .populate('unit', 'unitNumber')
      .sort({ createdAt: -1 });

    return res.json({ complaints });
  } catch (error) {
    console.error('Get tenant complaints error:', error);
    return res.status(500).json({ message: 'Error retrieving complaints.' });
  }
}

// Admin views all complaints
async function getAllComplaints(req, res) {
  try {
    const complaints = await Complaint.find()
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber')
      .populate('relatedMaintenanceRequest')
      .sort({ createdAt: -1 });

    return res.json({ complaints });
  } catch (error) {
    console.error('Get all complaints error:', error);
    return res.status(500).json({ message: 'Error retrieving complaints for admin.' });
  }
}

// Admin updates complaint status
async function updateComplaintStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' });
    }

    if (status) complaint.status = status;
    if (adminNotes !== undefined) complaint.adminNotes = adminNotes;

    await complaint.save();

    return res.json({ message: 'Complaint updated successfully', complaint });
  } catch (error) {
    console.error('Update complaint error:', error);
    return res.status(500).json({ message: 'Error updating complaint.' });
  }
}

module.exports = {
  submitComplaint,
  getTenantComplaints,
  getAllComplaints,
  updateComplaintStatus,
};
