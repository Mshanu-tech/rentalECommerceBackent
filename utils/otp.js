import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import env from '../config/env.js';

/** Cryptographically random numeric OTP, e.g. "308452" for length 6. */
export function generateOtp(length = env.otp.length) {
  const max = 10 ** length;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(length, '0');
}

/** OTPs are hashed at rest exactly like passwords — never stored in plaintext. */
export function hashOtp(otp) {
  return bcrypt.hash(otp, env.bcryptSaltRounds);
}

export function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}
