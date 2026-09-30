import { body } from 'express-validator';

export const reviewValidator = [
  body('rating')
    .notEmpty()
    .withMessage('Please choose a star rating.')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5.')
    .toInt(),
  body('title')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Title must be 120 characters or fewer.'),
  body('comment')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Review must be 2000 characters or fewer.'),
];

export const reviewVisibilityValidator = [
  body('isHidden').isBoolean().withMessage('isHidden must be true or false.').toBoolean(),
];
