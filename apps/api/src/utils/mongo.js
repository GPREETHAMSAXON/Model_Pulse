'use strict';

const mongoose = require('mongoose');

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/modelpulse';

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠ MongoDB disconnected — retrying...');
    isConnected = false;
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
}

module.exports = connectMongo;
