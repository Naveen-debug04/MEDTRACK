const { createHash } = require('node:crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const { asyncHandler, httpError } = require('../utils/http');

const SESSION_COOKIE = 'medtrack.sid';

function getSessionToken(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCookieOptions() {
  const sameSite = (process.env.SESSION_COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict, or none');
  }
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/api',
    maxAge: 8 * 60 * 60 * 1000
  };
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = getSessionToken(req);
  if (!token) throw httpError(401, 'Please sign in to access this resource');
  const session = await Session.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() }
  }).lean();
  if (!session) throw httpError(401, 'Your session has expired. Please sign in again');

  const user = await User.findById(session.userId)
    .select('fullName email role membershipRole organizationName workspaceId')
    .lean();
  if (!user) {
    await Session.deleteOne({ _id: session._id });
    throw httpError(401, 'Please sign in to access this resource');
  }
  user.membershipRole = user.membershipRole || 'owner';
  req.user = user;
  req.workspaceId = user.workspaceId;
  next();
});

const requireOwner = asyncHandler(async (req, _res, next) => {
  if (req.user.membershipRole !== 'owner') {
    throw httpError(403, 'Only the workspace owner can manage members or settings');
  }
  next();
});

module.exports = { SESSION_COOKIE, getSessionToken, hashSessionToken, requireAuth, requireOwner, sessionCookieOptions };
