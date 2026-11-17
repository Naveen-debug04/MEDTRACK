require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/db');
const Batch = require('../src/models/Batch');
const AuditLog = require('../src/models/AuditLog');
const Medicine = require('../src/models/Medicine');
const Notification = require('../src/models/Notification');
const StockMovement = require('../src/models/StockMovement');
const User = require('../src/models/User');

function daysFromToday(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed script cannot run in production');
  }
  const email = String(process.env.SEED_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Set SEED_EMAIL to the registered account that should receive sample data');
  await connectDatabase();
  const user = await User.findOne({ email }).select('workspaceId').lean();
  if (!user) throw new Error(`No MedTrack account found for SEED_EMAIL ${email}`);
  const scope = user.workspaceId;
  await Promise.all([
    Batch.deleteMany({ workspaceId: scope }),
    AuditLog.deleteMany({ workspaceId: scope }),
    StockMovement.deleteMany({ workspaceId: scope }),
    Notification.deleteMany({ workspaceId: scope }),
    Medicine.deleteMany({ workspaceId: scope })
  ]);
  const medicines = await Medicine.create([
    { workspaceId: scope, name: 'Sample product A', barcode: '8901000000012', category: 'General', manufacturer: 'Demo supplier', description: 'Development sample record' },
    { workspaceId: scope, name: 'Sample product B', barcode: '8901000000029', category: 'Wellness', manufacturer: 'Demo supplier', description: 'Development sample record' },
    { workspaceId: scope, name: 'Sample product C', barcode: '', category: 'General', manufacturer: 'Demo supplier', description: 'Development sample record' }
  ]);
  const batches = await Batch.create([
    { workspaceId: scope, medicineId: medicines[0]._id, batchNumber: 'DEMO-A-101', manufactureDate: daysFromToday(-90), expiryDate: daysFromToday(15), quantity: 6, lowStockThreshold: 10, supplier: 'Demo supplier' },
    { workspaceId: scope, medicineId: medicines[0]._id, batchNumber: 'DEMO-A-102', manufactureDate: daysFromToday(-20), expiryDate: daysFromToday(250), quantity: 48, lowStockThreshold: 10, supplier: 'Demo supplier' },
    { workspaceId: scope, medicineId: medicines[1]._id, batchNumber: 'DEMO-B-201', manufactureDate: daysFromToday(-180), expiryDate: daysFromToday(-5), quantity: 12, lowStockThreshold: 5, supplier: 'Demo supplier' },
    { workspaceId: scope, medicineId: medicines[2]._id, batchNumber: 'DEMO-C-301', manufactureDate: daysFromToday(-30), expiryDate: daysFromToday(430), quantity: 75, lowStockThreshold: 15, supplier: 'Demo supplier' }
  ]);
  await StockMovement.create(batches.map((batch) => ({
    workspaceId: scope,
    medicineId: batch.medicineId,
    batchId: batch._id,
    actor: 'Development seed',
    change: batch.quantity,
    resultingQuantity: batch.quantity,
    reason: 'Opening stock'
  })));
  await Notification.create({
    workspaceId: scope,
    kind: 'activity',
    title: 'Demo inventory loaded',
    message: 'Sample products and batches are ready to explore.'
  });
  console.log('Development data is ready.');
}

seed()
  .catch((error) => {
    console.error('Unable to seed development data:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
