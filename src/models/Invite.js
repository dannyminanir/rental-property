const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
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
    tenantEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    monthlyRent: {
      type: Number,
      required: true,
    },
    leaseStartDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invite', inviteSchema);
