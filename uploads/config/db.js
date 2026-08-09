const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI supplied in the environment.
 * Fails fast (and loudly) if the connection cannot be established,
 * since the API is useless without a database.
 */
async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Modern mongoose (8.x) no longer needs useNewUrlParser/useUnifiedTopology,
      // they are kept here as comments for reference on older driver versions.
    });
    console.log(`[db] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
