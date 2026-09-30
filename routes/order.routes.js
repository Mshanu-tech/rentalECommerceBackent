import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  checkoutValidator,
  updateOrderStatusValidator,
  updateOrderPaymentStatusValidator,
  createRazorpayOrderValidator,
  verifyRazorpayPaymentValidator,
  cancelOrderValidator,
} from '../validators/order.validators.js';

const router = Router();

router.use(protect);

// GET /api/orders/admin — admin only; every customer's orders, filterable + paginated
// (?status=&search=&dateFrom=&dateTo=&paymentStatus=&paymentMethod=&page=&limit=)
router.get('/admin', authorize('admin'), orderController.listAdmin);

// GET /api/orders/admin/stats — admin only. Must come before /admin/:id so "stats" is never
// parsed as an order id.
router.get('/admin/stats', authorize('admin'), orderController.stats);

// GET /api/orders/admin/:id — admin only
router.get('/admin/:id', authorize('admin'), orderController.getOneAdmin);

// PATCH /api/orders/admin/:id/status — admin only
router.patch(
  '/admin/:id/status',
  authorize('admin'),
  updateOrderStatusValidator,
  validate,
  orderController.updateStatus
);

// PATCH /api/orders/admin/:id/payment-status — mark a COD payment as collected
router.patch(
  '/admin/:id/payment-status',
  authorize('admin'),
  updateOrderPaymentStatusValidator,
  validate,
  orderController.updatePaymentStatus
);

// POST /api/orders  { addressId, paymentMethod? } — places a Cash on Delivery order from the current cart
router.post('/', checkoutValidator, validate, orderController.checkout);

// POST /api/orders/razorpay/create  { addressId } — opens a Razorpay order for the current cart
router.post(
  '/razorpay/create',
  createRazorpayOrderValidator,
  validate,
  orderController.createRazorpayOrder
);

// POST /api/orders/razorpay/verify  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
router.post(
  '/razorpay/verify',
  verifyRazorpayPaymentValidator,
  validate,
  orderController.verifyRazorpayPayment
);

// GET /api/orders — the logged-in user's own order history
router.get('/', orderController.list);

// GET /api/orders/:id — must belong to the logged-in user
router.get('/:id', orderController.getOne);

// POST /api/orders/:id/cancel  { reason? } — customer self-cancel; only while pending/processing
router.post('/:id/cancel', cancelOrderValidator, validate, orderController.cancel);

export default router;
