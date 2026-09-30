import { validationResult } from 'express-validator';
import { ApiError } from './errorHandler.js';

/**
 * Runs after a route's validator chain. Turns the first validation
 * failure into the project's standard { success: false, message } shape
 * instead of express-validator's own error array format.
 */
export function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const firstError = result.array()[0];
  next(new ApiError(422, firstError.msg));
}
