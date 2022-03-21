import mongoose from 'mongoose';
export interface DatabaseRepository {
  db: mongoose.Connection;
}