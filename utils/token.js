import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Every JWT issued by this app carries just enough to authorize a
 * request without a DB hit for role checks; auth.middleware still
 * re-fetches the user for routes that need up-to-date profile data.
 */
export function signToken({ id, role }) {
  return jwt.sign({ id, role }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwt.secret);
}
