const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const { batchStatus } = require('../services/inventory');
const { asyncHandler } = require('../utils/http');
const { getWorkspaceId } = require('../services/scope');
const { getAlertDays } = require('../services/settings');

function csvCell(value) {
  let text = String(value == null ? '' : value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const inventoryReport = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const [medicines, batches, movements, alertDays] = await Promise.all([
    Medicine.find({ workspaceId }).sort({ name: 1 }).lean(),
    Batch.find({ workspaceId }).populate('medicineId', 'name category').sort({ expiryDate: 1 }).lean(),
    StockMovement.find({
      workspaceId,
      ...(from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {})
    }).populate('medicineId', 'name').sort({ createdAt: -1 }).limit(5000).lean(),
    getAlertDays(workspaceId)
  ]);
  const records = batches.map((batch) => ({
    medicine: batch.medicineId?.name || 'Medicine',
    category: batch.medicineId?.category || 'Other',
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    quantity: batch.quantity,
    available: batchStatus(batch, new Date(), alertDays) === 'expired' ? 0 : batch.quantity,
    status: batchStatus(batch, new Date(), alertDays)
  }));
  if (req.query.format === 'csv') {
    const rows = [
      ['Record type', 'Medicine', 'Category', 'Batch', 'Expiry date', 'Quantity', 'Available quantity', 'Status', 'Date', 'Change', 'Resulting quantity', 'Reason'],
      ...records.map((item) => ['Batch', item.medicine, item.category, item.batchNumber, new Date(item.expiryDate).toISOString().slice(0, 10), item.quantity, item.available, item.status, '', '', '', '']),
      ...movements.map((item) => ['Stock movement', item.medicineId?.name || 'Medicine', '', '', '', '', '', '', new Date(item.createdAt).toISOString(), item.change, item.resultingQuantity, item.reason])
    ];
    res.type('text/csv').attachment('medtrack-inventory-report.csv').send(toCsv(rows));
    return;
  }
  const byMedicine = new Map(medicines.map((medicine) => [
    String(medicine._id),
    { quantity: 0, threshold: 0, activeBatches: 0 }
  ]));
  for (const batch of batches) {
    if (batchStatus(batch, new Date(), alertDays) === 'expired') continue;
    const item = byMedicine.get(String(batch.medicineId?._id));
    if (item) {
      item.quantity += batch.quantity;
      item.threshold += batch.lowStockThreshold;
      item.activeBatches += 1;
    }
  }
  res.json({
    summary: {
      products: medicines.length,
      totalStock: batches.reduce((sum, batch) => sum + batch.quantity, 0),
      availableStock: records.reduce((sum, batch) => sum + batch.available, 0),
      lowStock: [...byMedicine.values()].filter((item) =>
        item.activeBatches > 0 && item.quantity <= item.threshold
      ).length,
      expiring: records.filter((batch) => batch.status === 'expiring').length,
      expired: records.filter((batch) => batch.status === 'expired').length
    },
    batches: records,
    movements: movements.map((item) => ({
      medicine: item.medicineId?.name || 'Medicine',
      change: item.change,
      resultingQuantity: item.resultingQuantity,
      reason: item.reason,
      date: item.createdAt
    }))
  });
});

module.exports = { inventoryReport };
