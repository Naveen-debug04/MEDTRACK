const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const { batchStatus, dayStart } = require('../services/inventory');
const { asyncHandler } = require('../utils/http');
const { getWorkspaceId } = require('../services/scope');
const { getAlertDays } = require('../services/settings');

const dashboard = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const [medicines, batches, movements, alertDays] = await Promise.all([
    Medicine.find({ workspaceId }).select('name').lean(),
    Batch.find({ workspaceId }).populate('medicineId', 'name').lean(),
    StockMovement.find({ workspaceId }).populate('medicineId', 'name').sort({ createdAt: -1 }).limit(6).lean(),
    getAlertDays(workspaceId)
  ]);
  const now = dayStart();
  const byMedicine = new Map(medicines.map((medicine) => [
    String(medicine._id),
    { quantity: 0, threshold: 0, activeBatches: 0 }
  ]));
  const statuses = batches.map((batch) => {
    const status = batchStatus(batch, now, alertDays);
    if (status !== 'expired') {
      const current = byMedicine.get(String(batch.medicineId?._id));
      if (current) {
        current.quantity += batch.quantity;
        current.threshold += batch.lowStockThreshold;
        current.activeBatches += 1;
      }
    }
    return { batch, status };
  });
  const lowStockCount = [...byMedicine.values()].filter((item) =>
    item.activeBatches > 0 && item.quantity <= item.threshold
  ).length;
  const expiring = statuses.filter((item) => item.status === 'expiring');
  const expired = statuses.filter((item) => item.status === 'expired');
  const monthCounts = Array.from({ length: 6 }, (_value, index) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, 1));
    return {
      month: start.toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
      count: statuses.filter(({ batch }) => batch.expiryDate >= start && batch.expiryDate < end).length
    };
  });
  const stockSummary = {
    available: statuses.reduce((sum, item) => sum + (item.status === 'expired' ? 0 : item.batch.quantity), 0),
    expired: statuses.reduce((sum, item) => sum + (item.status === 'expired' ? item.batch.quantity : 0), 0)
  };
  res.json({
    summary: {
      products: medicines.length,
      stock: stockSummary.available,
      lowStock: lowStockCount,
      expiring: expiring.length,
      expired: expired.length
    },
    stockSummary,
    expiryOverview: monthCounts,
    alerts: statuses
      .filter((item) => ['expiring', 'expired'].includes(item.status))
      .slice(0, 5)
      .map(({ batch, status }) => ({
        id: batch._id,
        medicineName: batch.medicineId?.name || 'Medicine',
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        status
      })),
    recentActivity: movements.map((movement) => ({
      id: movement._id,
      medicineName: movement.medicineId?.name || 'Medicine',
      change: movement.change,
      reason: movement.reason,
      createdAt: movement.createdAt
    }))
  });
});

module.exports = { dashboard };
