const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    doctorName: { type: String, required: true, trim: true, maxlength: 120 },
    specialty: { type: String, trim: true, maxlength: 100, default: '' },
    appointmentDate: { type: Date, required: true, index: true },
    location: { type: String, trim: true, maxlength: 180, default: '' },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled', index: true },
    isSample: { type: Boolean, default: false },
    sampleKey: { type: String, default: null, select: false }
  },
  { timestamps: true }
);

appointmentSchema.index(
  { workspaceId: 1, sampleKey: 1 },
  { unique: true, partialFilterExpression: { sampleKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
