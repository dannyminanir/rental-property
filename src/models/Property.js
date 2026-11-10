const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
      default: 'Kigali',
    },
    state: {
      type: String,
      default: '',
    },
    country: {
      type: String,
      default: 'Rwanda',
    },
    propertyType: {
      type: String,
      enum: ['apartment', 'single_family', 'commercial', 'townhouse', 'condo'],
      default: 'apartment',
    },
    imageUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Property', propertySchema);
