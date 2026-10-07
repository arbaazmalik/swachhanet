const mongoose = require('mongoose');
const logger = require('../utils/logger');

function describeMongoTarget(uri) {
  try {
    const normalized = uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://')
      ? uri
      : `mongodb://${uri}`;
    const parsed = new URL(normalized);
    const protocol = parsed.protocol.replace(':', '');
    const host = parsed.hostname || 'localhost';
    const port = parsed.port || (protocol === 'mongodb+srv' ? 'default' : '27017');
    const dbName = parsed.pathname.replace(/^\//, '') || 'admin';
    return `${protocol}://${host}:${port}/${dbName}`;
  } catch (_err) {
    return 'unparseable MongoDB URI';
  }
}

let memServer = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  logger.info(`Connecting to MongoDB at ${describeMongoTarget(uri)}`);

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    logger.warn(`Failed to connect to primary MongoDB (${err.message}). Starting in-memory fallback database...`);
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memServer = await MongoMemoryServer.create();
      const memUri = memServer.getUri();
      logger.info(`In-memory MongoDB started at ${memUri}`);
      await mongoose.connect(memUri);

      // Auto-seed in-memory database
      try {
        logger.info('Auto-seeding in-memory database...');
        const User = require('../models/User');
        const bcrypt = require('bcryptjs');
        const count = await User.countDocuments();
        if (count === 0) {
          const Ward = require('../models/Ward');
          const ward = await Ward.create({
            name: 'Ward 14 - Laxmi Road', ulbCode: 'PMC-14', city: 'Pune', state: 'Maharashtra',
          });
          const citizenHash = await bcrypt.hash('citizen123', 10);
          const authorityHash = await bcrypt.hash('authority123', 10);
          await User.create([
            { name: 'Rahul Kumar', phone: '+919876543210', email: 'rahul@example.com', passwordHash: citizenHash, role: 'citizen', wardId: ward._id, isVerified: true },
            { name: 'Sneha Gupta', phone: '+919876543211', email: 'sneha@pmc.gov.in', passwordHash: authorityHash, role: 'authority', wardId: ward._id, isVerified: true }
          ]);
          logger.info('In-memory database seeded with default users (citizen: +919876543210 / citizen123, authority: +919876543211 / authority123)');
        }
      } catch (seedErr) {
        logger.warn('Auto-seed skipped:', seedErr.message);
      }
    } catch (memErr) {
      logger.error('Failed to start in-memory MongoDB fallback:', memErr);
      throw err;
    }
  }
}

module.exports = { connectDB, mongoose };
