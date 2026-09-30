import { body } from 'express-validator';

export const addCartItemValidator = [
  body('productId').notEmpty().withMessage('Product is required.').isInt({ min: 1 }).toInt(),
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.')
    .toInt(),
];

export const updateCartItemValidator = [
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required.')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.')
    .toInt(),
];
