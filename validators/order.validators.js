import { body } from 'express-validator';

export const checkoutValidator = [
  body('addressId').notEmpty().withMessage('Shipping address is required.').isInt({ min: 1 }).toInt(),
  body('paymentMethod')
    .optional()
    .isIn(['cod'])
    .withMessage('Only Cash on Delivery is available right now.'),
];

export const updateOrderStatusValidator = [
  body('status')
    .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid order status.'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 255 }).withMessage('Note is too long.'),
  body('trackingNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Tracking number is too long.'),
  body('carrier').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Carrier name is too long.'),
];

export const updateOrderPaymentStatusValidator = [
  body('paymentStatus')
    .equals('paid')
    .withMessage('Admin can only mark Cash on Delivery orders as paid.'),
];

export const cancelOrderValidator = [
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 255 }).withMessage('Reason is too long.'),
];

export const createRazorpayOrderValidator = [
  body('addressId').notEmpty().withMessage('Shipping address is required.').isInt({ min: 1 }).toInt(),
];

export const verifyRazorpayPaymentValidator = [
  body('razorpayOrderId').trim().notEmpty().withMessage('razorpayOrderId is required.'),
  body('razorpayPaymentId').trim().notEmpty().withMessage('razorpayPaymentId is required.'),
  body('razorpaySignature').trim().notEmpty().withMessage('razorpaySignature is required.'),
];
