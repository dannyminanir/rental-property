const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    unitNumber: {
      type: String,
      required: true,
      trim: true,
    },
    bedrooms: {
      type: Number,
      required: true,
      default: 1,
    },
    bathrooms: {
      type: Number,
      required: true,
      default: 1,
    },
    squareFeet: {
      type: Number,
      default: 650,
    },
    monthlyRent: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['vacant', 'occupied'],
      default: 'vacant',
    },
    currentTenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    amenities: {
      type: [String],
      default: [],
    },
    aiGeneratedDescription: {
      type: String,
      default: '',
    },
    photoUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Unit', unitSchema);
