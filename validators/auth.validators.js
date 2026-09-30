import { body } from 'express-validator';

export const registerValidator = [
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Name must be 2–150 characters.'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/\d/)
    .withMessage('Password must contain at least one number.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter.'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isMobilePhone('any')
    .withMessage('Enter a valid phone number.'),
];

export const loginValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
  body('portal').optional().isIn(['customer', 'admin']).withMessage('Invalid login portal.'),
];

export const forgotPasswordValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('portal').optional().isIn(['customer', 'admin']).withMessage('Invalid login portal.'),
];

export const resetPasswordValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('portal').optional().isIn(['customer', 'admin']).withMessage('Invalid login portal.'),
  body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the 6-digit code.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/\d/)
    .withMessage('Password must contain at least one number.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter.'),
];

export const verifyOtpValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the 6-digit code.'),
];

export const resendOtpValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
];

export const verifyLoginOtpValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the 6-digit code.'),
  body('portal').optional().isIn(['customer', 'admin']).withMessage('Invalid login portal.'),
];

export const resendLoginOtpValidator = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('portal').optional().isIn(['customer', 'admin']).withMessage('Invalid login portal.'),
];
