import { ApiError } from './errorHandler.js';
import { verifyToken } from '../utils/token.js';
import * as userModel from '../models/userModel.js';

/**
 * Requires a valid `Authorization: Bearer <token>` header. Re-fetches the
 * user from the DB (rather than trusting the JWT payload alone) so a
 * deleted/disabled account is rejected immediately, not just at expiry.
 */
export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, 'Not authenticated. Please log in.'));
  }

  try {
    const payload = verifyToken(token);
    const user = await userModel.findById(payload.id);
    if (!user) {
      return next(new ApiError(401, 'Account no longer exists.'));
    }
    req.user = user;
    next();
  } catch (err) {
    next(new ApiError(401, 'Session expired or invalid. Please log in again.'));
  }
}

/**
 * For public routes that behave differently for a logged-in admin (e.g.
 * seeing inactive categories/products) without requiring a token. Unlike
 * `protect`, a missing or invalid token is not an error — the request just
 * proceeds without `req.user`, same as a guest.
 */
export async function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return next();

  try {
    const payload = verifyToken(token);
    const user = await userModel.findById(payload.id);
    if (user) req.user = user;
  } catch {
    // Expired/invalid token on a public route — treat as a guest.
  }
  next();
}

/** Use after `protect`. Example: router.delete('/:id', protect, authorize('admin'), ...) */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
}
