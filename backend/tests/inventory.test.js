const test = require('node:test');
const assert = require('node:assert/strict');
const { batchStatus, dayStart } = require('../src/services/inventory');
const { buildAlerts } = require('../src/controllers/notificationController');
const { shouldUseAiProvider } = require('../src/controllers/assistantController');

const today = new Date('2026-11-16T12:00:00.000Z');

test('expired batches are always classified as expired', () => {
  assert.equal(batchStatus({ expiryDate: new Date('2026-11-15T00:00:00.000Z'), quantity: 100, lowStockThreshold: 0 }, today, 30), 'expired');
});

test('expiry alert period is inclusive and configurable', () => {
  assert.equal(batchStatus({ expiryDate: new Date('2026-12-01T00:00:00.000Z'), quantity: 100, lowStockThreshold: 0 }, today, 15), 'expiring');
  assert.equal(batchStatus({ expiryDate: new Date('2026-12-02T00:00:00.000Z'), quantity: 100, lowStockThreshold: 0 }, today, 15), 'healthy');
});

test('stock status uses the batch threshold when not expiring', () => {
  assert.equal(batchStatus({ expiryDate: new Date('2027-01-01T00:00:00.000Z'), quantity: 2, lowStockThreshold: 2 }, today, 15), 'low_stock');
  assert.equal(batchStatus({ expiryDate: new Date('2027-01-01T00:00:00.000Z'), quantity: 3, lowStockThreshold: 2 }, today, 15), 'healthy');
});

test('dayStart ignores time-of-day', () => {
  assert.equal(dayStart(today).getUTCHours(), 0);
  assert.equal(dayStart(today).getUTCDate(), today.getUTCDate());
});

test('products with no batches do not produce threshold-based low-stock alerts', () => {
  const medicine = { _id: 'medicine-1', name: 'Sample medicine' };
  const alerts = buildAlerts([{
    _id: 'batch-1',
    medicineId: medicine,
    batchNumber: 'B-1',
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    quantity: 0,
    lowStockThreshold: 5
  }], [
    medicine,
    { _id: 'medicine-2', name: 'No-batch medicine' }
  ], 30);

  assert.deepEqual(alerts.map((alert) => alert.kind), ['low_stock']);
  assert.equal(alerts[0].entityId, 'medicine-1');
});

test('external AI use requires both a provider key and workspace consent', () => {
  assert.equal(shouldUseAiProvider('', true), false);
  assert.equal(shouldUseAiProvider('configured-key', false), false);
  assert.equal(shouldUseAiProvider('configured-key', true), true);
});
