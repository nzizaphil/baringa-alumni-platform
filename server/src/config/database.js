import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Connect Mongoose to MongoDB Atlas.
 *
 * Never log the connection string or any credential it carries: the URI holds
 * the database username and password.
 */
export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('Database connection failed: MONGODB_URI is not set.');
    process.exit(1);
  }

  try {
    const connection = await mongoose.connect(uri);
    console.log(`MongoDB connected: database "${connection.connection.name}"`);
    return connection;
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }
}

export default connectDatabase;
