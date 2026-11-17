const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    batchNumber: { type: String, required: true, trim: true, maxlength: 80 },
    manufactureDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 10 },
    supplier: { type: String, trim: true, maxlength: 160, default: '' }
  },
  { timestamps: true }
);

batchSchema.index({ workspaceId: 1, medicineId: 1, batchNumber: 1 }, { unique: true });

module.exports = mongoose.model('Batch', batchSchema);
