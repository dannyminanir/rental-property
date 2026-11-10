const Property = require('../models/Property');
const Unit = require('../models/Unit');
const Lease = require('../models/Lease');

// Get all properties belonging to logged-in landlord (with unit stats)
async function getLandlordProperties(req, res) {
  try {
    const properties = await Property.find({ landlord: req.user._id }).sort({ createdAt: -1 });

    const propertySummaries = await Promise.all(
      properties.map(async (prop) => {
        const units = await Unit.find({ property: prop._id });
        const totalUnits = units.length;
        const occupiedUnits = units.filter((u) => u.status === 'occupied').length;
        const totalRent = units.reduce((acc, u) => acc + (u.monthlyRent || 0), 0);

        return {
          ...prop.toObject(),
          totalUnits,
          occupiedUnits,
          vacantUnits: totalUnits - occupiedUnits,
          totalRentPotential: totalRent,
        };
      })
    );

    return res.json({ properties: propertySummaries });
  } catch (error) {
    console.error('Get landlord properties error:', error);
    return res.status(500).json({ message: 'Error fetching properties.' });
  }
}

// Create new property
async function createProperty(req, res) {
  try {
    const { name, address, city, state, country, propertyType, imageUrl, description } = req.body;

    if (!name || !address) {
      return res.status(400).json({ message: 'Property name and address are required.' });
    }

    const property = await Property.create({
      landlord: req.user._id,
      name,
      address,
      city: city || 'Kigali',
      state: state || '',
      country: country || 'Rwanda',
      propertyType: propertyType || 'apartment',
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      description: description || '',
    });

    return res.status(201).json({ message: 'Property created successfully', property });
  } catch (error) {
    console.error('Create property error:', error);
    return res.status(500).json({ message: 'Error creating property.' });
  }
}

// Update property
async function updateProperty(req, res) {
  try {
    const { id } = req.params;
    const property = await Property.findOne({ _id: id, landlord: req.user._id });

    if (!property) {
      return res.status(404).json({ message: 'Property not found or unauthorized.' });
    }

    const { name, address, city, state, country, propertyType, imageUrl, description } = req.body;

    if (name) property.name = name;
    if (address) property.address = address;
    if (city) property.city = city;
    if (state !== undefined) property.state = state;
    if (country) property.country = country;
    if (propertyType) property.propertyType = propertyType;
    if (imageUrl) property.imageUrl = imageUrl;
    if (description !== undefined) property.description = description;

    await property.save();

    return res.json({ message: 'Property updated successfully', property });
  } catch (error) {
    console.error('Update property error:', error);
    return res.status(500).json({ message: 'Error updating property.' });
  }
}

// Delete property and associated units
async function deleteProperty(req, res) {
  try {
    const { id } = req.params;
    const property = await Property.findOne({ _id: id, landlord: req.user._id });

    if (!property) {
      return res.status(404).json({ message: 'Property not found or unauthorized.' });
    }

    await Unit.deleteMany({ property: id });
    await Lease.deleteMany({ property: id });
    await Property.findByIdAndDelete(id);

    return res.json({ message: 'Property and its units deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    return res.status(500).json({ message: 'Error deleting property.' });
  }
}

module.exports = {
  getLandlordProperties,
  createProperty,
  updateProperty,
  deleteProperty,
};
