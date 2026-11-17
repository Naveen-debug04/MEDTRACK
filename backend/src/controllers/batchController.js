const { z } = require('zod');
const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const { asyncHandler, httpError } = require('../utils/http');
const { batchStatus, dayStart } = require('../services/inventory');
const { recordActivity } = require('../services/notifications');
const { getWorkspaceId } = require('../services/scope');
const { getAlertDays } = require('../services/settings');
const { withTransaction } = require('../services/transaction');

const batchSchema = z.object({
  medicineId: z.string().min(1),
  batchNumber: z.string().trim().min(1, 'Batch number is required').max(80),
  manufactureDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  quantity: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  supplier: z.string().trim().max(160).optional().default('')
}).strict().refine((value) => value.manufactureDate <= value.expiryDate, {
  message: 'Manufacturing date must be on or before expiry date',
  path: ['expiryDate']
});

const stockSchema = z.object({
  change: z.coerce.number().int().refine((value) => value !== 0, 'Enter a non-zero stock change'),
  reason: z.string().trim().min(2).max(200).default('Stock adjustment')
}).strict();

const list = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const alertDays = await getAlertDays(workspaceId);
  const query = { workspaceId };
  if (req.query.medicineId) query.medicineId = req.query.medicineId;
  const batches = await Batch.find(query).populate('medicineId', 'name category barcode').sort({ expiryDate: 1 }).lean();
  res.json({
    batches: batches.map((batch) => ({
      ...batch,
      status: batchStatus(batch, new Date(), alertDays),
      availableQuantity: dayStart(batch.expiryDate) < dayStart() ? 0 : batch.quantity
    }))
  });
});

const create = asyncHandler(async (req, res) => {
  const data = batchSchema.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  const batch = await withTransaction(async (session) => {
    const medicine = await Medicine.findOne({ _id: data.medicineId, workspaceId }).session(session);
    if (!medicine) throw httpError(404, 'Medicine not found in your inventory');
    const [createdBatch] = await Batch.create([{ ...data, workspaceId }], { session });
    if (createdBatch.quantity > 0) {
      await StockMovement.create([{
        workspaceId,
        medicineId: medicine.id,
        batchId: createdBatch.id,
        actor: req.user.fullName,
        change: createdBatch.quantity,
        resultingQuantity: createdBatch.quantity,
        reason: 'Opening stock'
      }], { session });
    }
    await recordActivity(
      workspaceId,
      'batch.created',
      'batch',
      'Batch added',
      `${medicine.name}, batch ${createdBatch.batchNumber}, was added`,
      createdBatch.id,
      req.user.fullName,
      session
    );
    return createdBatch;
  });
  res.status(201).json({ batch });
});

const updateStock = asyncHandler(async (req, res) => {
  const data = stockSchema.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  const batch = await withTransaction(async (session) => {
    const filter = { _id: req.params.id, workspaceId };
    if (data.change < 0) filter.quantity = { $gte: Math.abs(data.change) };
    const updatedBatch = await Batch.findOneAndUpdate(
      filter,
      { $inc: { quantity: data.change } },
      { new: true, runValidators: true, session }
    );
    if (!updatedBatch) {
      const exists = await Batch.exists({ _id: req.params.id, workspaceId }).session(session);
      throw httpError(exists ? 400 : 404, exists ? 'Stock cannot be reduced below zero' : 'Batch not found');
    }
    await StockMovement.create([{
      workspaceId,
      medicineId: updatedBatch.medicineId,
      batchId: updatedBatch.id,
      actor: req.user.fullName,
      change: data.change,
      resultingQuantity: updatedBatch.quantity,
      reason: data.reason
    }], { session });
    await recordActivity(
      workspaceId,
      'stock.adjusted',
      'stock',
      'Stock updated',
      `Batch ${updatedBatch.batchNumber}: ${data.change > 0 ? '+' : ''}${data.change} units (${data.reason})`,
      updatedBatch.id,
      req.user.fullName,
      session
    );
    return updatedBatch;
  });
  res.json({ batch });
});

const remove = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  await withTransaction(async (session) => {
    const batch = await Batch.findOneAndDelete({ _id: req.params.id, workspaceId }, { session });
    if (!batch) throw httpError(404, 'Batch not found');
    await recordActivity(
      workspaceId,
      'batch.deleted',
      'batch',
      'Batch removed',
      `Batch ${batch.batchNumber} was removed`,
      batch.id,
      req.user.fullName,
      session
    );
  });
  res.json({ message: 'Batch removed' });
});

module.exports = { create, list, remove, updateStock };
