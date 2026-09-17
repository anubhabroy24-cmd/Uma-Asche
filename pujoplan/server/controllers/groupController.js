const prisma = require('../config/prisma');
const { generateToken } = require('../utils/tokenHelper');
const routeService = require('../services/routeService');

/* ─────────────────── GROUPS ─────────────────── */

/** POST /api/groups */
async function createGroup(req, res, next) {
  try {
    const { name, region, visitDate, startLocation } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required.' });
    if (!visitDate || !visitDate.trim()) return res.status(400).json({ error: 'Visit date is required.' });
    if (!startLocation || !startLocation.trim()) return res.status(400).json({ error: 'Starting location is required.' });

    const inviteToken = generateToken();

    const group = await prisma.group.create({
      data: {
        name: name.trim().slice(0, 100),
        region: region || 'Kolkata',
        adminId: req.user.id,
        inviteToken,
        visitDate: visitDate.trim(),
        startLocation: startLocation.trim(),
      },
    });

    // Creator automatically joins as admin
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user.id, role: 'admin' },
    });

    return res.status(201).json(group);
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups — groups the current user belongs to */
async function getMyGroups(req, res, next) {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            _count: { select: { members: true, spots: true } },
            admin: { select: { id: true, name: true, profileImage: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map(m => ({
      ...m.group,
      myRole: m.role,
    }));

    return res.json(groups);
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups/:id */
async function getGroupById(req, res, next) {
  try {
    const { id } = req.params;

    // Must be a member
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, name: true, email: true, profileImage: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, profileImage: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        spots: {
          include: {
            spot: true,
            addedBy: { select: { id: true, name: true, profileImage: true } },
            votes: { select: { userId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!group) return res.status(404).json({ error: 'Group not found.' });

    // Enrich spots with vote count and whether current user voted
    const enrichedSpots = group.spots.map(gs => ({
      id: gs.id,
      spotId: gs.spotId,
      spot: gs.spot,
      addedBy: gs.addedBy,
      status: gs.status,
      createdAt: gs.createdAt,
      voteCount: gs.votes.length,
      iVoted: gs.votes.some(v => v.userId === req.user.id),
    }));

    return res.json({
      ...group,
      spots: enrichedSpots,
      myRole: membership.role,
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id — admin only */
async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== req.user.id) return res.status(403).json({ error: 'Only the group admin can delete this group.' });

    await prisma.group.delete({ where: { id } });
    return res.json({ message: 'Group deleted.' });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── INVITE ─────────────────── */

/** POST /api/groups/:id/invite — regenerate invite token */
async function regenerateInvite(req, res, next) {
  try {
    const { id } = req.params;
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== req.user.id) return res.status(403).json({ error: 'Only the admin can regenerate the invite link.' });

    const inviteToken = generateToken();
    const updated = await prisma.group.update({ where: { id }, data: { inviteToken } });
    return res.json({ inviteToken: updated.inviteToken });
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups/invite-info/:token — public preview */
async function getInviteInfo(req, res, next) {
  try {
    const { token } = req.params;
    const group = await prisma.group.findUnique({
      where: { inviteToken: token },
      include: {
        admin: { select: { name: true, profileImage: true } },
        _count: { select: { members: true } },
      },
    });
    if (!group) return res.status(404).json({ error: 'Invalid or expired invite link.' });

    return res.json({
      groupId: group.id,
      groupName: group.name,
      region: group.region,
      adminName: group.admin.name,
      adminPhoto: group.admin.profileImage,
      memberCount: group._count.members,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/join/:token — join via invite */
async function joinGroup(req, res, next) {
  try {
    const { token } = req.params;
    const group = await prisma.group.findUnique({ where: { inviteToken: token } });
    if (!group) return res.status(404).json({ error: 'Invalid or expired invite link.' });

    // Check already a member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user.id } },
    });
    if (existing) {
      return res.json({ message: 'Already a member.', groupId: group.id, alreadyMember: true });
    }

    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user.id, role: 'member' },
    });

    return res.status(201).json({ message: 'Joined successfully.', groupId: group.id });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── MEMBERS ─────────────────── */

/** GET /api/groups/:id/members */
async function getMembers(req, res, next) {
  try {
    const { id } = req.params;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const members = await prisma.groupMember.findMany({
      where: { groupId: id },
      include: { user: { select: { id: true, name: true, email: true, profileImage: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return res.json(members);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id/members/:userId — admin only */
async function removeMember(req, res, next) {
  try {
    const { id, userId } = req.params;
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== req.user.id) return res.status(403).json({ error: 'Only the admin can remove members.' });
    if (userId === req.user.id) return res.status(400).json({ error: 'Admin cannot remove themselves.' });

    await prisma.groupMember.deleteMany({ where: { groupId: id, userId } });
    return res.json({ message: 'Member removed.' });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── SPOTS ─────────────────── */

/** POST /api/groups/:id/spots */
async function addSpot(req, res, next) {
  try {
    const { id } = req.params;
    const { spotId } = req.body;
    if (!spotId) return res.status(400).json({ error: 'spotId is required.' });

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const spot = await prisma.pujaSpot.findUnique({ where: { id: spotId } });
    if (!spot) return res.status(404).json({ error: 'Spot not found.' });

    const groupSpot = await prisma.groupSpot.upsert({
      where: { groupId_spotId: { groupId: id, spotId } },
      update: {},
      create: { groupId: id, spotId, addedById: req.user.id },
      include: {
        spot: true,
        addedBy: { select: { id: true, name: true, profileImage: true } },
        votes: { select: { userId: true } },
      },
    });

    return res.status(201).json({
      ...groupSpot,
      voteCount: groupSpot.votes.length,
      iVoted: groupSpot.votes.some(v => v.userId === req.user.id),
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id/spots/:spotId */
async function removeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;

    // Verify requester is a member of this group
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    // Look up by groupId_spotId OR by groupSpot.id
    let gs = await prisma.groupSpot.findUnique({
      where: { groupId_spotId: { groupId: id, spotId } },
      include: { group: true },
    });
    if (!gs) {
      gs = await prisma.groupSpot.findFirst({
        where: { groupId: id, id: spotId },
        include: { group: true },
      });
    }
    if (!gs) return res.status(404).json({ error: 'Spot not in this group.' });

    await prisma.groupSpot.delete({ where: { id: gs.id } });
    return res.json({ message: 'Spot removed.', spotId: gs.spotId, groupSpotId: gs.id });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── VOTING ─────────────────── */

/** POST /api/groups/:id/spots/:spotId/vote — toggle vote */
async function voteSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const gs = await prisma.groupSpot.findUnique({
      where: { groupId_spotId: { groupId: id, spotId } },
    });
    if (!gs) return res.status(404).json({ error: 'Spot not found in this group.' });

    const existing = await prisma.spotVote.findUnique({
      where: { groupSpotId_userId: { groupSpotId: gs.id, userId: req.user.id } },
    });

    if (existing) {
      await prisma.spotVote.delete({ where: { id: existing.id } });
      const count = await prisma.spotVote.count({ where: { groupSpotId: gs.id } });
      return res.json({ voted: false, voteCount: count });
    } else {
      await prisma.spotVote.create({ data: { groupSpotId: gs.id, userId: req.user.id } });
      const count = await prisma.spotVote.count({ where: { groupSpotId: gs.id } });
      return res.json({ voted: true, voteCount: count });
    }
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/spots/:spotId/finalize — admin finalises a spot */
async function finalizeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== req.user.id) return res.status(403).json({ error: 'Only admin can finalize spots.' });

    const gs = await prisma.groupSpot.findUnique({
      where: { groupId_spotId: { groupId: id, spotId } },
    });
    if (!gs) return res.status(404).json({ error: 'Spot not in this group.' });

    const updated = await prisma.groupSpot.update({
      where: { id: gs.id },
      data: { status: gs.status === 'finalized' ? 'suggested' : 'finalized' },
    });
    return res.json(updated);
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── ROUTE ─────────────────── */

/** POST /api/groups/:id/route */
async function generateRoute(req, res, next) {
  try {
    const { id } = req.params;
    const { startLocation, useFinalized } = req.body;

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        spots: {
          where: useFinalized ? { status: 'finalized' } : {},
          include: { spot: true },
        },
      },
    });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const spots = group.spots
      .map(gs => gs.spot)
      .filter(s => s.latitude && s.longitude);

    if (spots.length === 0) {
      return res.status(400).json({ error: 'No spots with coordinates found.' });
    }

    const start = startLocation || group.startLocation || 'Howrah Railway Station, Kolkata';
    const result = await routeService.generateRoute(start, spots);

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── GROUP MESSAGES ─────────────────── */

/** GET /api/groups/:id/messages — fetch message history */
async function getGroupMessages(req, res, next) {
  try {
    const { id } = req.params;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const messages = await prisma.groupMessage.findMany({
      where: { groupId: id },
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 150,
    });

    return res.json(messages);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/messages — send a message */
async function sendGroupMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty.' });
    }

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const message = await prisma.groupMessage.create({
      data: {
        groupId: id,
        userId: req.user.id,
        text: text.trim().slice(0, 1000),
      },
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
      },
    });

    return res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── LOCATION TRACKER ─────────────────── */

/** GET /api/groups/:id/locations — get all members and their current location */
async function getGroupLocations(req, res, next) {
  try {
    const { id } = req.params;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const members = await prisma.groupMember.findMany({
      where: { groupId: id },
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const locations = members.map(m => ({
      userId: m.userId,
      name: m.user.name,
      profileImage: m.user.profileImage,
      role: m.role,
      latitude: m.latitude,
      longitude: m.longitude,
      lastLocationUpdate: m.lastLocationUpdate,
      isSharingLocation: m.isSharingLocation && m.latitude !== null && m.longitude !== null,
    }));

    return res.json(locations);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/location — update my current location */
async function updateMemberLocation(req, res, next) {
  try {
    const { id } = req.params;
    const { latitude, longitude, isSharingLocation } = req.body;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'You are not a member of this group.' });

    const updateData = {
      isSharingLocation: isSharingLocation !== undefined ? Boolean(isSharingLocation) : true,
    };

    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      updateData.latitude = parseFloat(latitude);
      updateData.longitude = parseFloat(longitude);
      updateData.lastLocationUpdate = new Date();
    }

    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId: id, userId: req.user.id } },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
      },
    });

    return res.json({
      userId: updated.userId,
      name: updated.user.name,
      profileImage: updated.user.profileImage,
      latitude: updated.latitude,
      longitude: updated.longitude,
      lastLocationUpdate: updated.lastLocationUpdate,
      isSharingLocation: updated.isSharingLocation,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGroup, getMyGroups, getGroupById, deleteGroup,
  regenerateInvite, getInviteInfo, joinGroup,
  getMembers, removeMember,
  addSpot, removeSpot, voteSpot, finalizeSpot,
  generateRoute,
  getGroupMessages, sendGroupMessage,
  getGroupLocations, updateMemberLocation,
};

