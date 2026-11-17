const mongoose = require('mongoose');
const dns = require('node:dns');
const User = require('../models/User');

function configureMongoDns() {
  const servers = (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

async function connectDatabase() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('MONGODB_URI is required.');
    }

    const dbName = process.env.MONGODB_DB_NAME || 'medtrack';

    configureMongoDns();
    await mongoose.connect(uri, {
        dbName,
        serverSelectionTimeoutMS: 15000
    });

    await migrateWorkspaceIndex();
    await User.createIndexes();
    console.log('Connected to MongoDB Atlas successfully!');
}

async function migrateWorkspaceIndex() {
  let indexes = [];
  try {
    indexes = await User.collection.indexes();
  } catch (error) {
    if (error.code !== 26) throw error;
  }
  const legacyUniqueIndex = indexes.find((index) =>
    index.unique && index.key && index.key.workspaceId === 1 && Object.keys(index.key).length === 1
  );
  if (legacyUniqueIndex) {
    await User.collection.dropIndex(legacyUniqueIndex.name);
    console.log('Updated legacy workspace index to allow invited staff accounts');
  }
  await User.collection.createIndex({ workspaceId: 1 });
}

module.exports = { configureMongoDns, connectDatabase, migrateWorkspaceIndex };