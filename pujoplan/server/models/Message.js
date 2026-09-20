const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    groupId: { type: String, required: true, index: true },
    text: { type: String, default: '' },
    imageUrl: { type: String, default: null },
    type: { type: String, default: 'text' }, // 'text' | 'system' | 'image'
    senderId: { type: String, default: '' },
    senderName: { type: String, default: 'Explorer' },
    senderImage: { type: String, default: null },
    user: {
      id: { type: String },
      name: { type: String },
      profileImage: { type: String },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);

