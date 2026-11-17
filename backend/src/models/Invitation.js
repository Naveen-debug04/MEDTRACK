const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: { type: String, enum: ['household', 'pharmacy', 'clinic'], required: true },
    organizationName: { type: String, trim: true, maxlength: 160, default: '' },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    acceptedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invitation', invitationSchema);
