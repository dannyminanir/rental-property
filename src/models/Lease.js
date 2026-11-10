const mongoose = require('mongoose');

const leaseSchema = new mongoose.Schema(
  {
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tenant: {
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
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    monthlyRent: {
      type: Number,
      required: true,
    },
    deposit: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'terminated'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lease', leaseSchema);
