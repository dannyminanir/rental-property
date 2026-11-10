require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const rentRoutes = require('./routes/rentRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/rent', rentRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);

// Health check & Sample test requests list
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'RentPulse API',
    time: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({
    message: err.message || 'An unexpected internal server error occurred.',
  });
});

// Database connection with automatic fallback to in-memory MongoDB
async function startServer() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rental_property';
  let connected = false;

  console.log(`[RentPulse] Attempting connection to MongoDB at: ${mongoUri}...`);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2500 });
    console.log('[RentPulse] Connected to MongoDB database successfully.');
    connected = true;
  } catch (err) {
    console.warn(`[RentPulse] Local MongoDB not reachable (${err.message}).`);
    console.log('[RentPulse] Initializing embedded MongoDB server fallback for zero-configuration startup...');
    try {
      const fs = require('fs');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const systemBinaryPath = 'C:\\Program Files\\MongoDB\\Server\\9.0\\bin\\mongod.exe';
      const opts = fs.existsSync(systemBinaryPath) ? { binary: { systemBinary: systemBinaryPath } } : {};
      
      const mongod = await MongoMemoryServer.create(opts);
      const memoryUri = mongod.getUri();
      await mongoose.connect(memoryUri);
      console.log(`[RentPulse] Connected to Embedded In-Memory MongoDB at: ${memoryUri}`);
      connected = true;
    } catch (memErr) {
      console.error('[RentPulse] Fatal: Could not establish database connection:', memErr);
      process.exit(1);
    }
  }

  if (connected) {
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(` RentPulse Backend running at http://localhost:${PORT}`);
      console.log(` Health check: http://localhost:${PORT}/api/health`);
      console.log(`=======================================================`);
    });
  }
}

startServer();
