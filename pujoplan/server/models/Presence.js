const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, default: 'Explorer' },
    profileImage: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    isSharingLocation: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

presenceSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Presence', presenceSchema);
