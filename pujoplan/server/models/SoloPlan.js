const mongoose = require('mongoose');

const soloPlanSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: '' },
    userName: { type: String, default: 'Explorer' },
    name: { type: String, required: true },
    region: { type: String, default: 'Kolkata' },
    visitDate: { type: String, default: '' },
    startLocation: { type: String, default: '' },
    spots: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SoloPlan', soloPlanSchema);
