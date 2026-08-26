import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Throwaway MongoDB instance for tests.
 *
 * Keeps the suite off MongoDB Atlas: no credentials are needed and no test
 * ever touches real member data.
 */
let mongoServer;

export async function connectMemoryDatabase() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Build the declared indexes (notably the unique index on `email`) so
  // constraint behaviour matches production.
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.syncIndexes())
  );
}

export async function clearMemoryDatabase() {
  const { collections } = mongoose.connection;

  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

export async function disconnectMemoryDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer?.stop();
}
