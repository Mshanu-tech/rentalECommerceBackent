import { sendSuccess } from '../utils/apiResponse.js';
import * as orderService from '../services/orderService.js';

export async function checkout(req, res, next) {
  try {
    const order = await orderService.checkout(req.user.id, req.body);
    return sendSuccess(res, { statusCode: 201, message: 'Order placed.', data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function createRazorpayOrder(req, res, next) {
  try {
    const payment = await orderService.createRazorpayOrder(req.user.id, req.body);
    return sendSuccess(res, { statusCode: 201, message: 'Razorpay order created.', data: { payment } });
  } catch (err) {
    next(err);
  }
}

export async function verifyRazorpayPayment(req, res, next) {
  try {
    const order = await orderService.verifyRazorpayPayment(req.user.id, req.body);
    return sendSuccess(res, { statusCode: 201, message: 'Order placed.', data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const orders = await orderService.listOrders(req.user.id);
    return sendSuccess(res, { message: 'Orders fetched.', data: { orders } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const order = await orderService.getOrder(Number(req.params.id), req.user.id);
    return sendSuccess(res, { message: 'Order fetched.', data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req, res, next) {
  try {
    const order = await orderService.cancelOrder(Number(req.params.id), req.user.id, req.body.reason);
    return sendSuccess(res, { message: 'Order cancelled.', data: { order } });
  } catch (err) {
    next(err);
  }
}

// --- Admin -------------------------------------------------------------

export async function listAdmin(req, res, next) {
  try {
    const { status, search, dateFrom, dateTo, paymentStatus, paymentMethod, page, limit } = req.query;
    const { orders, pagination } = await orderService.listOrdersAdmin({
      status: status || null,
      search: search || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      paymentStatus: paymentStatus || null,
      paymentMethod: paymentMethod || null,
      page,
      limit,
    });
    return sendSuccess(res, { message: 'Orders fetched.', data: { orders, pagination } });
  } catch (err) {
    next(err);
  }
}

// GET /api/orders/admin/stats — order counts by status, today's count, and paid revenue.
export async function stats(req, res, next) {
  try {
    const data = await orderService.getOrderStats();
    return sendSuccess(res, { message: 'Order stats fetched.', data });
  } catch (err) {
    next(err);
  }
}

export async function getOneAdmin(req, res, next) {
  try {
    const order = await orderService.getOrder(Number(req.params.id));
    return sendSuccess(res, { message: 'Order fetched.', data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { status, note, trackingNumber, carrier } = req.body;
    const order = await orderService.updateOrderStatus(
      Number(req.params.id),
      { status, note, trackingNumber, carrier },
      req.user.id
    );
    return sendSuccess(res, { message: 'Order status updated.', data: { order } });
  } catch (err) {
    next(err);
  }
}

export async function updatePaymentStatus(req, res, next) {
  try {
    const order = await orderService.markOrderPaid(Number(req.params.id));
    return sendSuccess(res, { message: 'Payment status updated.', data: { order } });
  } catch (err) {
    next(err);
  }
}
