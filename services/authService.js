import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import { ApiError } from '../middleware/errorHandler.js';
import * as userModel from '../models/userModel.js';
import * as otpModel from '../models/otpModel.js';
import { generateOtp, hashOtp, compareOtp } from '../utils/otp.js';
import { signToken } from '../utils/token.js';
import { sendOtpEmail, sendWelcomeEmail } from './emailService.js';
import { domainCanReceiveMail } from '../utils/emailDomain.js';

function otpExpiryDate() {
  return new Date(Date.now() + env.otp.expiryMinutes * 60 * 1000);
}

async function issueAndSendOtp(user, purpose = 'registration') {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  await otpModel.createOtp({
    userId: user.id,
    otpHash,
    purpose,
    expiresAt: otpExpiryDate(),
  });
  await sendOtpEmail({ to: user.email, name: user.name, otp, purpose });
}

function toPublicUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { password, ...publicUser } = user;
  return publicUser;
}

/**
 * Customers and admins sign in through separate portals so one browser can hold both
 * sessions without them being mixed up.
 */
function assertPortalMatchesRole(user, portal) {
  if (portal === 'admin' && user.role !== 'admin') {
    throw new ApiError(403, 'This account does not have admin access.');
  }
  if (portal !== 'admin' && user.role === 'admin') {
    throw new ApiError(403, 'Admin accounts must sign in from the admin login page.');
  }
}

export async function register({ name, email, password, phone }) {
  const existing = await userModel.findByEmail(email);

  if (existing && existing.is_verified) {
    throw new ApiError(409, 'An account with this email already exists. Please log in.');
  }

  if (!(await domainCanReceiveMail(email))) {
    throw new ApiError(422, "That email domain can't receive mail. Please check the address and try again.");
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const user = existing
    ? await userModel.updateUnverifiedUser(existing.id, { name, passwordHash, phone })
    : await userModel.createUser({ name, email, passwordHash, phone });

  await issueAndSendOtp(user, 'registration');

  return { email: user.email };
}

export async function resendOtp({ email, purpose = 'registration' }) {
  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new ApiError(404, 'No account found for this email.');
  }
  if (purpose === 'registration' && user.is_verified) {
    throw new ApiError(400, 'This account is already verified. Please log in.');
  }

  const active = await otpModel.findLatestActiveOtp({ userId: user.id, purpose });
  if (active) {
    const secondsSinceSent = (Date.now() - new Date(active.created_at).getTime()) / 1000;
    if (secondsSinceSent < env.otp.resendCooldownSeconds) {
      const wait = Math.ceil(env.otp.resendCooldownSeconds - secondsSinceSent);
      throw new ApiError(429, `Please wait ${wait}s before requesting another code.`);
    }
  }

  await issueAndSendOtp(user, purpose);
  return { email: user.email };
}

/**
 * Validates `otp` against the user's latest active code for `purpose` and consumes it on success.
 * Throws a specific ApiError for missing / expired / locked-out / wrong codes.
 */
async function checkAndConsumeOtp(user, purpose, otp) {
  const record = await otpModel.findLatestActiveOtp({ userId: user.id, purpose });
  if (!record) {
    throw new ApiError(400, 'No active code found. Please request a new one.');
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, 'This code has expired. Please request a new one.');
  }
  if (record.attempts >= env.otp.maxAttempts) {
    throw new ApiError(429, 'Too many incorrect attempts. Please request a new code.');
  }

  const isMatch = await compareOtp(otp, record.otp_hash);
  if (!isMatch) {
    await otpModel.incrementAttempts(record.id);
    throw new ApiError(400, 'Incorrect code. Please try again.');
  }

  await otpModel.consumeOtp(record.id);
}

export async function verifyOtp({ email, otp, purpose = 'registration' }) {
  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new ApiError(404, 'No account found for this email.');
  }
  if (purpose === 'registration' && user.is_verified) {
    throw new ApiError(400, 'This account is already verified. Please log in.');
  }

  await checkAndConsumeOtp(user, purpose, otp);
  if (purpose === 'registration') {
    await userModel.markVerified(user.id);
  }

  const verifiedUser = await userModel.findById(user.id);
  if (purpose === 'registration') {
    // Fire-and-forget: a mail hiccup must not stop someone who just verified from logging in.
    sendWelcomeEmail({ to: verifiedUser.email, name: verifiedUser.name }).catch((err) =>
      console.error('Could not send welcome email:', err.message)
    );
  }
  const token = signToken({ id: verifiedUser.id, role: verifiedUser.role });
  return { token, user: verifiedUser };
}

export async function login({ email, password, portal = 'customer' }) {
  const user = await userModel.findByEmail(email);
  // Same generic message whether the email is unknown or the password is
  // wrong — never reveal which one failed.
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!user.is_verified) {
    const err = new ApiError(403, 'Please verify your email before logging in.');
    err.data = { needsVerification: true, email: user.email };
    throw err;
  }

  assertPortalMatchesRole(user, portal);

  // Password is correct — the session itself is only issued after the emailed code is verified.
  await issueAndSendOtp(user, 'login');
  return { otpRequired: true, email: user.email };
}

/** Step 2 of login: exchange the emailed code for a session token. */
export async function verifyLoginOtp({ email, otp, portal = 'customer' }) {
  const invalid = new ApiError(400, 'Invalid or expired code. Please sign in again.');
  const user = await userModel.findByEmail(email);
  if (!user || !user.is_verified) throw invalid;
  assertPortalMatchesRole(user, portal);

  await checkAndConsumeOtp(user, 'login', otp);

  const token = signToken({ id: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}

/**
 * Resend for the login step. Like forgotPassword it answers the same way whether or not the
 * account exists, and silently honours the cooldown, so it can't be used to probe for accounts.
 */
export async function resendLoginOtp({ email, portal = 'customer' }) {
  const user = await userModel.findByEmail(email);
  if (!user || !user.is_verified) return { email };
  try {
    assertPortalMatchesRole(user, portal);
  } catch {
    return { email };
  }

  const active = await otpModel.findLatestActiveOtp({ userId: user.id, purpose: 'login' });
  if (active) {
    const secondsSinceSent = (Date.now() - new Date(active.created_at).getTime()) / 1000;
    if (secondsSinceSent < env.otp.resendCooldownSeconds) {
      const wait = Math.ceil(env.otp.resendCooldownSeconds - secondsSinceSent);
      throw new ApiError(429, `Please wait ${wait}s before requesting another code.`);
    }
  }
  await issueAndSendOtp(user, 'login');
  return { email };
}

// --- Forgot / reset password -------------------------------------------------

/**
 * Always resolves the same way whether or not the email exists, so this endpoint can't be
 * used to discover which emails have accounts. The code is only actually sent to verified
 * accounts, and not more often than the resend cooldown allows.
 */
export async function forgotPassword({ email, portal = 'customer' }) {
  const user = await userModel.findByEmail(email);

  // Admin portal: the email must belong to a verified admin account. Unlike the customer flow this
  // answers explicitly, so an admin who mistyped their address is told instead of waiting for a
  // code that will never arrive.
  if (portal === 'admin') {
    if (!user || !user.is_verified || user.role !== 'admin') {
      throw new ApiError(404, 'This email is not registered as an admin account.');
    }
  } else if (user && user.role === 'admin') {
    // Admin credentials are only recoverable from the admin portal.
    return { email };
  }

  if (!user || !user.is_verified) return { email };

  const active = await otpModel.findLatestActiveOtp({ userId: user.id, purpose: 'password_reset' });
  if (active) {
    const secondsSinceSent = (Date.now() - new Date(active.created_at).getTime()) / 1000;
    if (secondsSinceSent < env.otp.resendCooldownSeconds) return { email };
  }

  await issueAndSendOtp(user, 'password_reset');
  return { email };
}

export async function resetPassword({ email, otp, password, portal = 'customer' }) {
  const invalid = new ApiError(400, 'Invalid or expired code. Please request a new one.');
  const user = await userModel.findByEmail(email);
  if (!user) throw invalid;
  if (portal === 'admin' && user.role !== 'admin') {
    throw new ApiError(404, 'This email is not registered as an admin account.');
  }
  if (portal !== 'admin' && user.role === 'admin') throw invalid;

  const record = await otpModel.findLatestActiveOtp({ userId: user.id, purpose: 'password_reset' });
  if (!record || new Date(record.expires_at).getTime() < Date.now()) throw invalid;
  if (record.attempts >= env.otp.maxAttempts) {
    throw new ApiError(429, 'Too many incorrect attempts. Please request a new code.');
  }

  if (!(await compareOtp(otp, record.otp_hash))) {
    await otpModel.incrementAttempts(record.id);
    throw new ApiError(400, 'Incorrect code. Please try again.');
  }

  await otpModel.consumeOtp(record.id);
  await userModel.updatePassword(user.id, await bcrypt.hash(password, env.bcryptSaltRounds));
  return { email: user.email };
}
