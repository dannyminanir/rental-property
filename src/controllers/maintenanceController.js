const MaintenanceRequest = require('../models/MaintenanceRequest');
const Lease = require('../models/Lease');
const Property = require('../models/Property');
const Unit = require('../models/Unit');
const { triageMaintenanceRequest, ALLOWED_CATEGORIES, ALLOWED_URGENCIES } = require('../services/aiService');
const { sendEmergencyMaintenanceAlert } = require('../services/emailService');

// Tenant submits new maintenance request
async function createMaintenanceRequest(req, res) {
  try {
    const { description, photoUrl } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Problem description is required.' });
    }

    // Find active lease for tenant
    const lease = await Lease.findOne({ tenant: req.user._id, status: 'active' })
      .populate('property')
      .populate('unit')
      .populate('landlord');

    if (!lease) {
      return res.status(400).json({
        message: 'You do not have an active lease linked to a unit. Please contact your landlord.',
      });
    }

    // Run AI Maintenance Triage
    const triage = await triageMaintenanceRequest(description.trim());

    // Create Maintenance Request
    const request = await MaintenanceRequest.create({
      tenant: req.user._id,
      landlord: lease.landlord._id,
      property: lease.property._id,
      unit: lease.unit._id,
      originalDescription: description.trim(),
      photoUrl: photoUrl || '',
      category: triage.category,
      urgency: triage.urgency,
      is_emergency: triage.is_emergency,
      aiSummary: triage.summary,
      aiFollowUpQuestion: triage.follow_up_question,
      status: 'open',
    });

    // If emergency, trigger landlord alert email
    if (triage.is_emergency) {
      if (lease.landlord?.email) {
        sendEmergencyMaintenanceAlert({
          to: lease.landlord.email,
          landlordName: lease.landlord.name,
          propertyName: lease.property.name,
          unitNumber: lease.unit.unitNumber,
          summary: triage.summary,
          originalDescription: description.trim(),
        }).catch((err) => console.warn('Emergency alert email dispatch notice:', err.message));
      }
    }

    // Return response with emergency warning if flagged
    return res.status(201).json({
      message: triage.is_emergency
        ? 'EMERGENCY ALERT: Please prioritize your safety, get to a safe place immediately, and call emergency services (112).'
        : 'Maintenance request submitted successfully and triaged by AI.',
      request,
      emergencyAlert: triage.is_emergency
        ? {
            is_emergency: true,
            warning: 'Immediate safety hazard detected. Please leave the area if dangerous and call 112.',
            emergencyNumber: '112',
          }
        : null,
    });
  } catch (error) {
    console.error('Create maintenance request error:', error);
    return res.status(500).json({ message: 'Error submitting maintenance request.' });
  }
}

// Tenant answers AI follow-up question
async function answerFollowUpQuestion(req, res) {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer || !answer.trim()) {
      return res.status(400).json({ message: 'Answer text is required.' });
    }

    const request = await MaintenanceRequest.findOne({ _id: id, tenant: req.user._id });
    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found or unauthorized.' });
    }

    request.tenantFollowUpAnswer = answer.trim();
    await request.save();

    return res.json({
      message: 'Follow-up answer saved successfully. Your landlord has been updated.',
      request,
    });
  } catch (error) {
    console.error('Answer follow up error:', error);
    return res.status(500).json({ message: 'Error submitting follow-up answer.' });
  }
}

// Landlord gets maintenance requests (sorted by emergency and urgency first)
async function getLandlordRequests(req, res) {
  try {
    const { status, category, urgency } = req.query;

    let query = { landlord: req.user._id };
    if (status && status !== 'all') query.status = status;
    if (category && category !== 'all') query.category = category;
    if (urgency && urgency !== 'all') query.urgency = urgency;

    const requests = await MaintenanceRequest.find(query)
      .populate('tenant', 'name email phone')
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber')
      .sort({
        is_emergency: -1, // emergencies top
        urgency: 1, // urgent, normal, low
        createdAt: -1,
      });

    // Custom sorting to ensure:
    // 1. Open Emergencies first
    // 2. Urgent open
    // 3. Normal open
    // 4. Low open
    // 5. In-progress
    // 6. Fixed
    const sorted = requests.sort((a, b) => {
      if (a.is_emergency && !b.is_emergency) return -1;
      if (!a.is_emergency && b.is_emergency) return 1;

      const urgencyOrder = { urgent: 0, normal: 1, low: 2 };
      const statusOrder = { open: 0, in_progress: 1, fixed: 2 };

      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return (urgencyOrder[a.urgency] ?? 1) - (urgencyOrder[b.urgency] ?? 1);
    });

    return res.json({ requests: sorted });
  } catch (error) {
    console.error('Get landlord requests error:', error);
    return res.status(500).json({ message: 'Error retrieving maintenance requests.' });
  }
}

// Tenant views their own maintenance requests
async function getTenantRequests(req, res) {
  try {
    const requests = await MaintenanceRequest.find({ tenant: req.user._id })
      .populate('property', 'name address city')
      .populate('unit', 'unitNumber')
      .sort({ createdAt: -1 });

    return res.json({ requests });
  } catch (error) {
    console.error('Get tenant requests error:', error);
    return res.status(500).json({ message: 'Error retrieving your requests.' });
  }
}

// Landlord updates request status (open -> in_progress -> fixed)
async function updateRequestStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, statusNotes } = req.body;

    if (!['open', 'in_progress', 'fixed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be open, in_progress, or fixed.' });
    }

    const request = await MaintenanceRequest.findById(id).populate('property');
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    if (String(request.landlord) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to update this request.' });
    }

    request.status = status;
    if (statusNotes !== undefined) request.statusNotes = statusNotes;

    if ((status === 'in_progress' || status === 'fixed') && !request.emergencyHandledAt) {
      request.emergencyHandledAt = new Date();
    }

    await request.save();

    return res.json({ message: 'Request status updated successfully', request });
  } catch (error) {
    console.error('Update request status error:', error);
    return res.status(500).json({ message: 'Error updating maintenance status.' });
  }
}

// Landlord overrides category or urgency chosen by AI
async function overrideTriageClassification(req, res) {
  try {
    const { id } = req.params;
    const { category, urgency } = req.body;

    const request = await MaintenanceRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    if (String(request.landlord) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to modify this request.' });
    }

    if (category && ALLOWED_CATEGORIES.includes(category)) {
      request.category = category;
      request.categoryOverriddenByLandlord = true;
    }

    if (urgency && ALLOWED_URGENCIES.includes(urgency)) {
      request.urgency = urgency;
      request.urgencyOverriddenByLandlord = true;
    }

    await request.save();

    return res.json({
      message: 'AI triage classification modified by landlord.',
      request,
    });
  } catch (error) {
    console.error('Override triage error:', error);
    return res.status(500).json({ message: 'Error modifying request triage classification.' });
  }
}

// Standalone AI Triage simulation / testing endpoint (used by AI Triage Testing Lab)
async function testTriageEndpoint(req, res) {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required for testing triage.' });
    }

    const result = await triageMaintenanceRequest(text);
    return res.json({ input: text, triage: result });
  } catch (error) {
    console.error('Test triage error:', error);
    return res.status(500).json({ message: 'Error testing triage.' });
  }
}

module.exports = {
  createMaintenanceRequest,
  answerFollowUpQuestion,
  getLandlordRequests,
  getTenantRequests,
  updateRequestStatus,
  overrideTriageClassification,
  testTriageEndpoint,
};
