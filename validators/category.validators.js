import { body } from 'express-validator';

export const createCategoryValidator = [
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Name must be 2–150 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters.'),
];

export const updateCategoryValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Name must be 2–150 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters.'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be true or false.')
    .toBoolean(),
];
