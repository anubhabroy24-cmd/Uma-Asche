const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    user: {
      id: { type: String },
      name: { type: String, default: 'Explorer' },
      email: { type: String, default: '' },
      profileImage: { type: String, default: null },
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const spotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    spotId: { type: String, required: true },
    spot: { type: mongoose.Schema.Types.Mixed, default: {} },
    addedBy: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['suggested', 'finalized'], default: 'suggested' },
    voteCount: { type: Number, default: 0 },
    votes: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    region: { type: String, default: 'Kolkata' },
    visitDate: { type: String, default: '' },
    startLocation: { type: String, default: '' },
    adminId: { type: String, required: true, index: true },
    admin: {
      id: { type: String },
      name: { type: String, default: 'Admin' },
      email: { type: String, default: '' },
      profileImage: { type: String, default: null },
    },
    members: { type: [memberSchema], default: [] },
    memberUids: { type: [String], index: true, default: [] },
    spots: { type: [spotSchema], default: [] },
    inviteToken: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// Helper to sanitize json return
groupSchema.methods.toClientJSON = function (currentUid) {
  const obj = this.toObject();
  const isAdmin = obj.adminId === currentUid;
  obj.myRole = isAdmin ? 'admin' : 'member';
  obj._count = {
    members: (obj.members || []).length,
    spots: (obj.spots || []).length,
  };
  return obj;
};

module.exports = mongoose.model('Group', groupSchema);
