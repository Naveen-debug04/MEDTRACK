const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    barcode: { type: String, trim: true, maxlength: 80, default: '' },
    category: { type: String, trim: true, maxlength: 80, default: 'Other' },
    manufacturer: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' }
  },
  { timestamps: true }
);

medicineSchema.index(
  { workspaceId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('Medicine', medicineSchema);
