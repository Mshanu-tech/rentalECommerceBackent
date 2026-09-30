/**
 * Consistent response envelope used across every route in this project:
 *   { success: true,  message, data }
 *   { success: false, message }
 */
export function sendSuccess(res, { message = 'Success', data = null, statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}
