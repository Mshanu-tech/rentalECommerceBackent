import rateLimit from 'express-rate-limit';

const jsonHandler = (req, res, next, options) => {
  res.status(options.statusCode).json({ success: false, message: options.message });
};

/** Register/login: generous enough for real users, tight enough to slow credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Please try again in a few minutes.',
  handler: jsonHandler,
});

/** OTP verify/resend: stricter, since these are the brute-forceable step. */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many code requests. Please try again in a few minutes.',
  handler: jsonHandler,
});
