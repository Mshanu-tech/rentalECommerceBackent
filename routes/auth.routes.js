import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter.js';
import {
  registerValidator,
  loginValidator,
  verifyOtpValidator,
  resendOtpValidator,
  verifyLoginOtpValidator,
  resendLoginOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} from '../validators/auth.validators.js';

const router = Router();

// POST /api/auth/register
router.post('/register', authLimiter, registerValidator, validate, authController.register);

// POST /api/auth/verify-otp
router.post('/verify-otp', otpLimiter, verifyOtpValidator, validate, authController.verifyOtp);

// POST /api/auth/resend-otp
router.post('/resend-otp', otpLimiter, resendOtpValidator, validate, authController.resendOtp);

// POST /api/auth/login  { email, password, portal }  ->  step 1: checks the password, emails a code
router.post('/login', authLimiter, loginValidator, validate, authController.login);

// POST /api/auth/login/verify  { email, otp, portal }  ->  step 2: the code is exchanged for a token
router.post('/login/verify', otpLimiter, verifyLoginOtpValidator, validate, authController.verifyLoginOtp);

// POST /api/auth/login/resend  { email, portal }
router.post('/login/resend', otpLimiter, resendLoginOtpValidator, validate, authController.resendLoginOtp);

// POST /api/auth/forgot-password  { email }
router.post('/forgot-password', otpLimiter, forgotPasswordValidator, validate, authController.forgotPassword);

// POST /api/auth/reset-password  { email, otp, password }
router.post('/reset-password', otpLimiter, resetPasswordValidator, validate, authController.resetPassword);

// GET /api/auth/me
router.get('/me', protect, authController.me);

// POST /api/auth/logout
router.post('/logout', protect, authController.logout);

export default router;
