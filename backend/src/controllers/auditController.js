const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../utils/http');
const { getWorkspaceId } = require('../services/scope');

const list = asyncHandler(async (req, res) => {
  const query = { workspaceId: getWorkspaceId(req) };
  if (req.query.from || req.query.to) {
    query.createdAt = {};
    if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
  }
  const entries = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  res.json({
    entries: entries.map((entry) => ({
      id: entry._id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details,
      actor: entry.actor,
      createdAt: entry.createdAt
    }))
  });
});

module.exports = { list };
