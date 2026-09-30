import { body } from 'express-validator';

const fields = [
  body('fullName').trim().isLength({ min: 2, max: 150 }).withMessage('Full name must be 2–150 characters.'),
  body('phone')
    .trim()
    .isLength({ min: 7, max: 20 })
    .withMessage('Enter a valid phone number.'),
  body('line1').trim().isLength({ min: 3, max: 200 }).withMessage('Address line 1 is required.'),
  body('line2').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('city').trim().isLength({ min: 2, max: 100 }).withMessage('City is required.'),
  body('state').trim().isLength({ min: 2, max: 100 }).withMessage('State is required.'),
  body('postalCode')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Postal code is required.'),
  body('country').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true or false.').toBoolean(),
];

export const createAddressValidator = fields;
export const updateAddressValidator = fields;
