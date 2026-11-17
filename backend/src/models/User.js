const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['household', 'pharmacy', 'clinic'], required: true },
    membershipRole: { type: String, enum: ['owner', 'staff'], default: 'owner', required: true },
    organizationName: { type: String, trim: true, maxlength: 160, default: '' },
    workspaceId: { type: String, required: true, index: true }
  },
  { timestamps: true, autoIndex: false }
);

module.exports = mongoose.model('User', userSchema);
