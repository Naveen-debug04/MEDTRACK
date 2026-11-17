const { randomBytes } = require('node:crypto');
const { z } = require('zod');
const Invitation = require('../models/Invitation');
const Session = require('../models/Session');
const User = require('../models/User');
const { asyncHandler, httpError } = require('../utils/http');
const { hashSessionToken } = require('../middleware/requireAuth');
const { getWorkspaceId } = require('../services/scope');
const { withTransaction } = require('../services/transaction');

const invitationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase())
}).strict();

const listMembers = asyncHandler(async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const [members, invitations] = await Promise.all([
    User.find({ workspaceId })
      .select('fullName email role membershipRole createdAt')
      .sort({ membershipRole: 1, fullName: 1 })
      .lean(),
    Invitation.find({ workspaceId, acceptedAt: null, expiresAt: { $gt: new Date() } })
      .select('email expiresAt')
      .sort({ createdAt: -1 })
      .lean()
  ]);
  res.json({
    members: members.map((member) => ({
      id: String(member._id),
      fullName: member.fullName,
      email: member.email,
      role: member.role,
      membershipRole: member.membershipRole || 'owner',
      createdAt: member.createdAt
    })),
    invitations: invitations.map((invitation) => ({
      id: String(invitation._id),
      email: invitation.email,
      expiresAt: invitation.expiresAt
    }))
  });
});

const createInvitation = asyncHandler(async (req, res) => {
  const { email } = invitationSchema.parse(req.body);
  if (await User.exists({ email })) throw httpError(409, 'This email already belongs to an account');
  const workspaceId = getWorkspaceId(req);
  const pending = await Invitation.exists({
    workspaceId,
    email,
    acceptedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (pending) throw httpError(409, 'A pending invitation already exists for this email');

  const invitationCode = randomBytes(32).toString('base64url');
  const invitation = await Invitation.create({
    workspaceId,
    email,
    role: req.user.role,
    organizationName: req.user.organizationName,
    tokenHash: hashSessionToken(invitationCode),
    invitedBy: req.user._id,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
  });
  res.status(201).json({
    invitation: {
      id: String(invitation._id),
      email: invitation.email,
      expiresAt: invitation.expiresAt
    },
    invitationCode
  });
});

const revokeInvitation = asyncHandler(async (req, res) => {
  const invitation = await Invitation.findOneAndDelete({
    _id: req.params.id,
    workspaceId: getWorkspaceId(req),
    acceptedAt: null
  });
  if (!invitation) throw httpError(404, 'Pending invitation not found');
  res.json({ message: 'Invitation revoked' });
});

const removeMember = asyncHandler(async (req, res) => {
  await withTransaction(async (session) => {
    const member = await User.findOne({
      _id: req.params.id,
      workspaceId: getWorkspaceId(req),
      membershipRole: 'staff'
    }).session(session);
    if (!member) throw httpError(404, 'Staff member not found');
    await Session.deleteMany({ userId: member._id }, { session });
    await member.deleteOne({ session });
  });
  res.json({ message: 'Staff member removed' });
});

module.exports = { createInvitation, listMembers, removeMember, revokeInvitation };
