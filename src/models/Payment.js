const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
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
    lease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lease',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    forMonth: {
      type: String, // e.g. 'November 2026' or '2026-11'
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'mobile_money', 'cash', 'card', 'other'],
      default: 'mobile_money',
    },
    reference: {
      type: String,
      default: '',
    },
    receiptNumber: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
