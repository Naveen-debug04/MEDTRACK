const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
    actor: { type: String, required: true, default: 'Local user', maxlength: 120 },
    change: { type: Number, required: true },
    resultingQuantity: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, maxlength: 200, default: 'Stock adjustment' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockMovement', stockMovementSchema);
