const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    actor: { type: String, required: true, default: 'Local user', maxlength: 120 },
    action: { type: String, required: true, maxlength: 100 },
    entityType: { type: String, enum: ['medicine', 'batch', 'stock', 'appointment'], required: true },
    entityId: { type: String, required: true },
    details: { type: String, required: true, maxlength: 500 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
