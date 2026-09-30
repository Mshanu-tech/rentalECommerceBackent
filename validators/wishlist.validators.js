import { body } from 'express-validator';

export const addWishlistItemValidator = [
  body('productId').notEmpty().withMessage('Product is required.').isInt({ min: 1 }).toInt(),
];
