const { z } = require('zod');
const Medicine = require('../models/Medicine');
const Batch = require('../models/Batch');
const { asyncHandler, httpError } = require('../utils/http');
const { recordActivity } = require('../services/notifications');
const { getWorkspaceId } = require('../services/scope');
const { withTransaction } = require('../services/transaction');

const medicineSchema = z.object({
  name: z.string().trim().min(1, 'Medicine name is required').max(160),
  barcode: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default('Other'),
  manufacturer: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(1000).optional().default('')
}).strict();

const list = asyncHandler(async (req, res) => {
  const query = { workspaceId: getWorkspaceId(req) };
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.barcode) query.barcode = String(req.query.barcode).trim();
  if (req.query.search) {
    const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: new RegExp(escaped, 'i') }, { barcode: new RegExp(escaped, 'i') }];
  }
  const medicines = await Medicine.find(query).sort({ name: 1 }).lean();
  res.json({ medicines });
});

const create = asyncHandler(async (req, res) => {
  const data = medicineSchema.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  const medicine = await withTransaction(async (session) => {
    const [created] = await Medicine.create([{ ...data, workspaceId }], { session });
    await recordActivity(
      workspaceId, 'medicine.created', 'medicine', 'Medicine added',
      `${created.name} was added to inventory`, created.id, req.user.fullName, session
    );
    return created;
  });
  res.status(201).json({ medicine });
});

const update = asyncHandler(async (req, res) => {
  const data = medicineSchema.partial().parse(req.body);
  if (!Object.keys(data).length) throw httpError(400, 'Provide at least one field to update');
  const workspaceId = getWorkspaceId(req);
  const medicine = await withTransaction(async (session) => {
    const updated = await Medicine.findOneAndUpdate(
      { _id: req.params.id, workspaceId },
      { $set: data },
      { new: true, runValidators: true, session }
    );
    if (!updated) throw httpError(404, 'Medicine not found');
    await recordActivity(
      workspaceId, 'medicine.updated', 'medicine', 'Medicine updated',
      `${updated.name} details were updated`, updated.id, req.user.fullName, session
    );
    return updated;
  });
  res.json({ medicine });
});

const remove = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  await withTransaction(async (session) => {
    const medicine = await Medicine.findOne({ _id: req.params.id, workspaceId }).session(session);
    if (!medicine) throw httpError(404, 'Medicine not found');
    const batchCount = await Batch.countDocuments({ medicineId: medicine.id, workspaceId }).session(session);
    if (batchCount) throw httpError(409, 'Remove this medicine’s batches before deleting it');
    await medicine.deleteOne({ session });
    await recordActivity(
      workspaceId, 'medicine.deleted', 'medicine', 'Medicine removed',
      `${medicine.name} was removed from inventory`, medicine.id, req.user.fullName, session
    );
  });
  res.json({ message: 'Medicine removed' });
});

module.exports = { create, list, remove, update };
