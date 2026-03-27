import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';

let mongod: MongoMemoryServer | undefined;

export const setupTestDB = async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
};

export const teardownTestDB = async () => {
  if (mongod) {
    await mongod.stop();
  }
};

export const clearTestDB = async (connection: Connection) => {
  const collections = await connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};
