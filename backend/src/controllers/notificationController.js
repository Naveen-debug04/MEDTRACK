const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const { batchStatus } = require('../services/inventory');
const { asyncHandler, httpError } = require('../utils/http');
const { getWorkspaceId } = require('../services/scope');
const { getAlertDays } = require('../services/settings');

function buildAlerts(batches, medicines, alertDays) {
  const map = new Map(medicines.map((medicine) => [
    String(medicine._id),
    { name: medicine.name, quantity: 0, threshold: 0, activeBatches: 0 }
  ]));
  const alerts = [];

  for (const batch of batches) {
    const status = batchStatus(batch, new Date(), alertDays);
    if (status === 'expired' || status === 'expiring') {
      alerts.push({
        alertKey: `${status}:batch:${batch._id}`,
        kind: status,
        title: status === 'expired' ? 'Expired batch' : 'Expiry approaching',
        message: `${batch.medicineId?.name || 'Medicine'} · batch ${batch.batchNumber} · expires ${new Date(batch.expiryDate).toISOString().slice(0, 10)}`,
        entityId: String(batch._id)
      });
    }
    if (status !== 'expired') {
      const current = map.get(String(batch.medicineId?._id));
      if (current) {
        current.quantity += batch.quantity;
        current.threshold += batch.lowStockThreshold;
        current.activeBatches += 1;
      }
    }
  }

  for (const [medicineId, amounts] of map) {
    if (amounts.activeBatches > 0 && amounts.quantity <= amounts.threshold) {
      alerts.push({
        alertKey: `low_stock:medicine:${medicineId}`,
        kind: 'low_stock',
        title: 'Low stock',
        message: `${amounts.name} is at or below its stock threshold`,
        entityId: medicineId
      });
    }
  }
  return alerts;
}

const list = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const [batches, medicines, activities, alertDays] = await Promise.all([
    Batch.find({ workspaceId }).populate('medicineId', 'name').lean(),
    Medicine.find({ workspaceId }).select('_id name').lean(),
    Notification.find({ workspaceId, kind: 'activity' }).sort({ createdAt: -1 }).limit(25).lean(),
    getAlertDays(workspaceId)
  ]);
  const alerts = buildAlerts(batches, medicines, alertDays);
  if (alerts.length) {
    await Notification.bulkWrite(alerts.map((alert) => ({
      updateOne: {
        filter: { workspaceId, alertKey: alert.alertKey },
        update: {
          $set: {
            kind: alert.kind,
            title: alert.title,
            message: alert.message,
            entityId: alert.entityId
          },
          $setOnInsert: { workspaceId, alertKey: alert.alertKey, readAt: null }
        },
        upsert: true
      }
    })));
  }
  await Notification.deleteMany({
    workspaceId,
    kind: { $in: ['low_stock', 'expiring', 'expired'] },
    alertKey: { $nin: alerts.map((alert) => alert.alertKey) }
  });
  const persistedAlerts = await Notification.find({
    workspaceId,
    kind: { $in: ['low_stock', 'expiring', 'expired'] }
  }).sort({ createdAt: -1 }).lean();
  const history = activities.map((item) => ({
    id: String(item._id),
    kind: item.kind,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    read: Boolean(item.readAt)
  }));
  const persisted = persistedAlerts.map((item) => ({
    id: String(item._id),
    kind: item.kind,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    read: Boolean(item.readAt)
  }));
  res.json({ notifications: [...persisted, ...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, workspaceId: getWorkspaceId(req) },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw httpError(404, 'Notification not found');
  res.json({ message: 'Notification marked as read' });
});

module.exports = { buildAlerts, list, markRead };
