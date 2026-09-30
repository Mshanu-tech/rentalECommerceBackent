import { body } from 'express-validator';

export const createProductValidator = [
  body('categoryId')
    .notEmpty()
    .withMessage('Category is required.')
    .isInt({ min: 1 })
    .withMessage('Invalid category.')
    .toInt(),
  body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Name must be 2–200 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be under 5000 characters.'),
  body('price')
    .notEmpty()
    .withMessage('Price is required.')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number.')
    .toFloat(),
  body('compareAtPrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Compare-at price must be a positive number.')
    .toFloat(),
  body('sku')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('SKU must be under 100 characters.'),
  body('stockQuantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be 0 or more.')
    .toInt(),
  body('lowStockThreshold')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Low-stock threshold must be 0 or more.')
    .toInt(),
  body('isFeatured')
    .optional()
    .isBoolean()
    .withMessage('isFeatured must be true or false.')
    .toBoolean(),
];

export const updateProductValidator = [
  body('categoryId').optional().isInt({ min: 1 }).withMessage('Invalid category.').toInt(),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2–200 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be under 5000 characters.'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number.')
    .toFloat(),
  body('compareAtPrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Compare-at price must be a positive number.')
    .toFloat(),
  body('sku')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('SKU must be under 100 characters.'),
  body('stockQuantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be 0 or more.')
    .toInt(),
  body('lowStockThreshold')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Low-stock threshold must be 0 or more.')
    .toInt(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be true or false.')
    .toBoolean(),
  body('isFeatured')
    .optional()
    .isBoolean()
    .withMessage('isFeatured must be true or false.')
    .toBoolean(),
];

// Phase 8 — admin manual stock adjustment.
export const adjustStockValidator = [
  body('type')
    .isIn(['increment', 'decrement', 'set'])
    .withMessage('Type must be one of: increment, decrement, set.'),
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required.')
    .isInt({ min: 0 })
    .withMessage('Quantity must be 0 or more.')
    .toInt(),
  body('reason')
    .optional({ values: 'falsy' })
    .isIn(['restock', 'correction', 'damaged', 'returned', 'other'])
    .withMessage('Invalid reason.'),
  body('note')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Note is too long.'),
];
