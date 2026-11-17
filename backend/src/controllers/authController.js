const { randomBytes, randomUUID } = require('node:crypto');
const { z } = require('zod');
const Session = require('../models/Session');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { getSessionToken, hashSessionToken, SESSION_COOKIE, sessionCookieOptions } = require('../middleware/requireAuth');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { asyncHandler, httpError } = require('../utils/http');
const { withTransaction } = require('../services/transaction');

const registrationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['household', 'pharmacy', 'clinic']),
  organizationName: z.string().trim().max(160).optional().default('')
}).strict().refine(
  (value) => value.role === 'household' || value.organizationName.length > 0,
  { message: 'Organization name is required for pharmacies and clinics', path: ['organizationName'] }
);

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(128)
}).strict();

const invitationRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  inviteCode: z.string().trim()
    .min(32, 'Paste the complete invitation code from the workspace owner, or leave this field empty to register normally')
    .max(128, 'Invitation code is invalid')
}).strict();

function userResponse(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    membershipRole: user.membershipRole || 'owner',
    organizationName: user.organizationName
  };
}

async function startSession(user, req, res) {
  const previousToken = getSessionToken(req);
  if (previousToken) await Session.deleteOne({ tokenHash: hashSessionToken(previousToken) });

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionCookieOptions().maxAge);
  await Session.create({
    tokenHash: hashSessionToken(token),
    userId: user._id,
    expiresAt
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

const register = asyncHandler(async (req, res) => {
  const data = registrationSchema.parse(req.body);
  const { password, ...userData } = data;
  const user = await User.create({
    ...userData,
    passwordHash: await hashPassword(password),
    workspaceId: randomUUID(),
    membershipRole: 'owner'
  });
  res.status(201).json({ message: 'Account created. Please sign in.', user: userResponse(user) });
});

const acceptInvitation = asyncHandler(async (req, res) => {
  const data = invitationRegistrationSchema.parse(req.body);
  const tokenHash = hashSessionToken(data.inviteCode);
  const passwordHash = await hashPassword(data.password);
  const user = await withTransaction(async (session) => {
    const invitation = await Invitation.findOneAndUpdate(
      { tokenHash, email: data.email, expiresAt: { $gt: new Date() }, acceptedAt: null },
      { $set: { acceptedAt: new Date() } },
      { new: true, session }
    );
    if (!invitation) throw httpError(400, 'Invitation is invalid, expired, or for a different email address');
    const existing = await User.exists({ email: data.email }).session(session);
    if (existing) throw httpError(409, 'An account with this email already exists');
    const [created] = await User.create([{
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      role: invitation.role,
      membershipRole: 'staff',
      organizationName: invitation.organizationName,
      workspaceId: invitation.workspaceId
    }], { session });
    return created;
  });
  res.status(201).json({ message: 'Invitation accepted. Please sign in.', user: userResponse(user) });
});

const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select('+passwordHash');
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw httpError(401, 'Email or password is incorrect');
  }
  await startSession(user, req, res);
  res.json({ user: userResponse(user) });
});

const logout = asyncHandler(async (req, res) => {
  const token = getSessionToken(req);
  if (token) await Session.deleteOne({ tokenHash: hashSessionToken(token) });
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.json({ message: 'Signed out' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: userResponse(req.user) });
});

module.exports = {
  acceptInvitation,
  invitationRegistrationSchema,
  login,
  logout,
  me,
  register,
  registrationSchema
};
