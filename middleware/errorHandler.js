import env from '../config/env.js';

/** Thrown deliberately from controllers/services for expected failure cases. */
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Catches unmatched routes and forwards a consistent 404 to the error handler. */
export function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler — every controller in this project should call
 * next(err) on failure rather than crafting its own error response, so the
 * API's response shape stays consistent everywhere:
 * { success: false, message: "..." }
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Lets a controller attach extra machine-readable context to an error
    // (e.g. { needsVerification: true }) without changing the envelope shape.
    ...(err.data ? { data: err.data } : {}),
    ...(env.NODE_ENV === 'development' && statusCode === 500 ? { stack: err.stack } : {}),
  });
}
