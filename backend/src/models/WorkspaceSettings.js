const mongoose = require('mongoose');

const workspaceSettingsSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, unique: true },
    alertDays: { type: Number, enum: [7, 15, 30], default: 30 },
    aiDataSharingEnabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkspaceSettings', workspaceSettingsSchema);
