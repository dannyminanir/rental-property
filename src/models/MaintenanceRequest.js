const mongoose = require('mongoose');

const maintenanceRequestSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    originalDescription: {
      type: String,
      required: true,
      trim: true,
    },
    photoUrl: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: [
        'plumbing',
        'electrical',
        'doors and locks',
        'appliances',
        'structure (roof, walls, windows)',
        'pests',
        'other',
      ],
      default: 'other',
    },
    urgency: {
      type: String,
      enum: ['low', 'normal', 'urgent'],
      default: 'normal',
    },
    is_emergency: {
      type: Boolean,
      default: false,
    },
    aiSummary: {
      type: String,
      default: '',
    },
    aiFollowUpQuestion: {
      type: String,
      default: '',
    },
    tenantFollowUpAnswer: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'fixed'],
      default: 'open',
    },
    statusNotes: {
      type: String,
      default: '',
    },
    categoryOverriddenByLandlord: {
      type: Boolean,
      default: false,
    },
    urgencyOverriddenByLandlord: {
      type: Boolean,
      default: false,
    },
    emergencyHandledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for emergency overdue 24 hours check
maintenanceRequestSchema.virtual('isEmergencyOverdue24h').get(function () {
  if (!this.is_emergency) return false;
  if (this.status !== 'open') return false;
  const hoursSinceCreation = (Date.now() - new Date(this.createdAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceCreation >= 24;
});

module.exports = mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
