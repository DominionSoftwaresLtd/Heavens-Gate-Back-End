import mongoose from 'mongoose';
import { config } from '../config/index.js';

export let isConnectedToMongo = false;

export async function connectDatabase(): Promise<boolean> {
  try {
    console.log(`[Database] Attempting connection to MongoDB at: ${config.mongoUri}`);
    mongoose.set('strictQuery', false);
    
    // Attempt connection with a short 2.5s timeout so startup doesn't hang if Mongo isn't running
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500
    });
    
    isConnectedToMongo = true;
    console.log('✅ [Database] Successfully connected to persistent MongoDB database.');
    return true;
  } catch (err: any) {
    isConnectedToMongo = false;
    console.warn('⚠️ [Database] Local MongoDB server not reachable (' + err.message + ').');
    console.log('🚀 [Database] Operating in High-Performance In-Memory Persistent Store mode.');
    return false;
  }
}
