const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['audio', 'video', 'voice', 'default'], default: 'video' },
    status: { type: String, enum: ['ringing', 'active', 'ended', 'declined'], default: 'ringing' },
    caller: {
      id: { type: String, required: true },
      name: { type: String, default: 'Caller' },
      profileImage: { type: String, default: null },
    },
    offer: { type: mongoose.Schema.Types.Mixed, default: null },
    answer: { type: mongoose.Schema.Types.Mixed, default: null },
    candidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Call', callSchema);

