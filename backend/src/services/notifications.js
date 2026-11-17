const { randomUUID } = require('node:crypto');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

async function recordActivity(workspaceId, action, entityType, title, message, entityId, actor, session) {
  const options = session ? { session } : undefined;
  await Notification.create([{
    workspaceId,
    kind: 'activity',
    title,
    message,
    entityId: `activity:${randomUUID()}`
  }], options);
  await AuditLog.create([{ workspaceId, actor, action, entityType, entityId, details: message }], options);
}

module.exports = { recordActivity };
