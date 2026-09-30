import { sendSuccess } from '../utils/apiResponse.js';
import * as authService from '../services/authService.js';

export async function register(req, res, next) {
  try {
    const { email } = await authService.register(req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Registration successful. We sent a verification code to your email.',
      data: { email },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { token, user } = await authService.verifyOtp({ ...req.body, purpose: 'registration' });
    return sendSuccess(res, {
      message: 'Email verified. You are now logged in.',
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req, res, next) {
  try {
    const { email } = await authService.resendOtp({ ...req.body, purpose: 'registration' });
    return sendSuccess(res, {
      message: 'A new verification code has been sent.',
      data: { email },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const data = await authService.login(req.body); // { otpRequired, email }
    return sendSuccess(res, {
      message: 'We sent a sign-in code to your email.',
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyLoginOtp(req, res, next) {
  try {
    const { token, user } = await authService.verifyLoginOtp(req.body);
    return sendSuccess(res, {
      message: 'Logged in successfully.',
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
}

export async function resendLoginOtp(req, res, next) {
  try {
    await authService.resendLoginOtp(req.body);
    return sendSuccess(res, { message: 'If the details are right, a new code is on its way.' });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    return sendSuccess(res, { message: 'Current user', data: { user: req.user } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    // Stateless JWT — nothing to invalidate server-side. The route exists so
    // the client has one consistent place to call, and so a token blacklist
    // or refresh-token cookie can be added here later without an API change.
    return sendSuccess(res, { message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    await authService.forgotPassword(req.body);
    return sendSuccess(res, {
      message: 'If an account exists for that email, we have sent a reset code to it.',
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body);
    return sendSuccess(res, { message: 'Password updated. You can now log in.' });
  } catch (err) {
    next(err);
  }
}
