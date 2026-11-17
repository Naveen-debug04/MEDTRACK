const { z } = require('zod');
const Appointment = require('../models/Appointment');
const { recordActivity } = require('../services/notifications');
const { getWorkspaceId } = require('../services/scope');
const { asyncHandler, httpError } = require('../utils/http');
const { withTransaction } = require('../services/transaction');

const appointmentSchema = z.object({
  doctorName: z.string().trim().min(2, 'Doctor name is required').max(120),
  specialty: z.string().trim().max(100).optional().default(''),
  appointmentDate: z.coerce.date(),
  location: z.string().trim().max(180).optional().default('')
}).strict();

const statusSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'cancelled'])
}).strict();

const list = asyncHandler(async (req, res) => {
  const appointments = await Appointment.find({ workspaceId: getWorkspaceId(req) })
    .sort({ appointmentDate: 1 })
    .lean();
  res.json({ appointments });
});

const create = asyncHandler(async (req, res) => {
  const data = appointmentSchema.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  const appointment = await withTransaction(async (session) => {
    const [created] = await Appointment.create([{ ...data, workspaceId }], { session });
    await recordActivity(
      workspaceId,
      'appointment.created',
      'appointment',
      'Appointment scheduled',
      `${created.doctorName}${created.specialty ? ` · ${created.specialty}` : ''} · ${created.appointmentDate.toISOString()}`,
      created.id,
      req.user.fullName,
      session
    );
    return created;
  });
  res.status(201).json({ appointment });
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  const appointment = await withTransaction(async (session) => {
    const updated = await Appointment.findOneAndUpdate(
      { _id: req.params.id, workspaceId },
      { $set: { status } },
      { new: true, runValidators: true, session }
    );
    if (!updated) throw httpError(404, 'Appointment not found');
    await recordActivity(
      workspaceId,
      `appointment.${status}`,
      'appointment',
      `Appointment ${status}`,
      `${updated.doctorName}'s appointment was marked ${status}`,
      updated.id,
      req.user.fullName,
      session
    );
    return updated;
  });
  res.json({ appointment });
});

const remove = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  await withTransaction(async (session) => {
    const appointment = await Appointment.findOneAndDelete({ _id: req.params.id, workspaceId }, { session });
    if (!appointment) throw httpError(404, 'Appointment not found');
    await recordActivity(
      workspaceId,
      'appointment.deleted',
      'appointment',
      'Appointment removed',
      `${appointment.doctorName}'s appointment was removed`,
      appointment.id,
      req.user.fullName,
      session
    );
  });
  res.json({ message: 'Appointment removed' });
});

module.exports = { appointmentSchema, create, list, remove, statusSchema, updateStatus };
