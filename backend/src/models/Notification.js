const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['low_stock', 'expiring', 'expired', 'activity'], required: true },
    title: { type: String, required: true, maxlength: 180 },
    message: { type: String, required: true, maxlength: 500 },
    entityId: { type: String, default: '' },
    alertKey: { type: String, default: undefined },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

notificationSchema.index(
  { workspaceId: 1, alertKey: 1 },
  { unique: true, partialFilterExpression: { alertKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
