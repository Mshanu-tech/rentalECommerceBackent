import { ApiError } from '../middleware/errorHandler.js';
import pool from '../config/database.js';
import env from '../config/env.js';
import * as orderModel from '../models/orderModel.js';
import * as cartModel from '../models/cartModel.js';
import * as productModel from '../models/productModel.js';
import * as addressModel from '../models/addressModel.js';
import * as paymentIntentModel from '../models/paymentIntentModel.js';
import * as addressService from './addressService.js';
import * as razorpayService from './razorpayService.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { getPublicUrl } from './storageService.js';
import * as orderNotifications from './orderNotifications.js';

// Flat-rate shipping with a free-shipping threshold — simple placeholder
// until pricing rules move into an admin-configurable settings table.
const SHIPPING_FEE = 49;
const FREE_SHIPPING_THRESHOLD = 999;

function computeShipping(subtotal) {
  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { shippingFee, total: Number((subtotal + shippingFee).toFixed(2)) };
}

function addressRowToOrderAddress(row) {
  return {
    fullName: row.full_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
  };
}

/**
 * Locks a product row (FOR UPDATE) and atomically decrements its stock — shared by the COD
 * checkout and the Razorpay fulfillment path so both check/reserve stock the same way, inside
 * the same transaction as the order they belong to.
 */
async function lockAndDecrementStock(connection, productId, quantity, productLabel) {
  const product = await productModel.findByIdForUpdate(productId, connection);
  if (!product || !product.is_active) {
    throw new ApiError(422, `"${productLabel}" is no longer available. Please remove it from your cart.`);
  }
  if (Number(product.stock_quantity) < quantity) {
    throw new ApiError(
      422,
      `Only ${product.stock_quantity} of "${product.name}" left in stock — please update your cart.`
    );
  }
  const decremented = await productModel.decrementStock(productId, quantity, connection);
  if (!decremented) {
    throw new ApiError(422, `"${product.name}" just went out of stock — please update your cart.`);
  }
  return product;
}

// Phase 7 — order tracking / status history.
//
// `delivered` and `cancelled` are terminal: once an order reaches either, its status can't
// be changed again. `cancelled` is only reachable from `pending` or `processing` — once an
// order has shipped, it's physically on its way, so undoing that is a return/refund handled
// outside this simple status flow rather than a plain "cancel". Otherwise moves must go
// forward along PROGRESS_ORDER (skipping ahead is fine — e.g. an admin marking an order
// "delivered" directly — but moving backward isn't).
const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);
const PROGRESS_ORDER = ['pending', 'processing', 'shipped', 'delivered'];
const CANCELLABLE_FROM = new Set(['pending', 'processing']);

function assertValidTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    throw new ApiError(409, `Order is already "${nextStatus}".`);
  }
  if (TERMINAL_STATUSES.has(currentStatus)) {
    throw new ApiError(409, `Order is already "${currentStatus}" and its status can't be changed further.`);
  }
  if (nextStatus === 'cancelled') {
    if (!CANCELLABLE_FROM.has(currentStatus)) {
      throw new ApiError(409, `Orders that are already "${currentStatus}" can no longer be cancelled.`);
    }
    return;
  }
  const currentIdx = PROGRESS_ORDER.indexOf(currentStatus);
  const nextIdx = PROGRESS_ORDER.indexOf(nextStatus);
  if (nextIdx === -1 || nextIdx < currentIdx) {
    throw new ApiError(422, `Can't move an order from "${currentStatus}" to "${nextStatus}".`);
  }
}

/**
 * Shared by the admin status-update path and customer self-cancel: validates the transition,
 * restocks every line item when cancelling (stock was reserved at checkout time and is never
 * physically shipped for a cancelled order), and writes both the new status and a timeline
 * row — all inside the caller's transaction so a failure midway leaves nothing changed.
 */
async function applyStatusChange(connection, order, nextStatus, { note = null, changedBy = null, trackingNumber, carrier } = {}) {
  assertValidTransition(order.status, nextStatus);

  let cancelledReason = null;
  if (nextStatus === 'cancelled') {
    cancelledReason = note || 'Order cancelled.';
    const items = await orderModel.findItemsByOrder(order.id);
    for (const item of items) {
      if (item.product_id) {
        await productModel.incrementStock(item.product_id, item.quantity, connection);
      }
    }
  }

  await orderModel.updateStatusAndTracking(connection, order.id, {
    status: nextStatus,
    trackingNumber,
    carrier,
    cancelledReason,
  });
  await orderModel.addStatusHistory(connection, order.id, { status: nextStatus, note, changedBy });
}

/**
 * A cancellation that lands after a Razorpay payment already succeeded needs an actual
 * refund, not just a status flip — the same Razorpay refund path Phase 6 uses when stock
 * runs out after payment. Runs after the status-change transaction has committed, since a
 * failed refund call shouldn't roll back the cancellation itself; it's logged for manual
 * follow-up instead (same trade-off Phase 6 makes for its own automatic refund).
 */
async function refundIfPaidRazorpayOrder(order) {
  if (order.payment_method !== 'razorpay' || order.payment_status !== 'paid') return;
  try {
    await razorpayService.refundPayment(order.razorpay_payment_id, Number(order.total));
    await pool.query('UPDATE orders SET payment_status = :status WHERE id = :id', {
      status: 'refunded',
      id: order.id,
    });
  } catch (refundErr) {
    console.error(`Automatic refund failed while cancelling order ${order.id}:`, refundErr);
  }
}

function toPublicOrder(order, items = [], history = []) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    razorpayOrderId: order.razorpay_order_id,
    razorpayPaymentId: order.razorpay_payment_id,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shipping_fee),
    total: Number(order.total),
    trackingNumber: order.tracking_number,
    carrier: order.carrier,
    cancelledReason: order.cancelled_reason,
    // Convenience flag so the client doesn't have to reimplement the transition rules just
    // to decide whether to show a "Cancel order" button.
    isCancellable: CANCELLABLE_FROM.has(order.status),
    shippingAddress: {
      fullName: order.shipping_full_name,
      phone: order.shipping_phone,
      line1: order.shipping_line1,
      line2: order.shipping_line2,
      city: order.shipping_city,
      state: order.shipping_state,
      postalCode: order.shipping_postal_code,
      country: order.shipping_country,
    },
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    createdAt: order.created_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      image: getPublicUrl(item.product_image),
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
      lineTotal: Number(item.line_total),
    })),
    statusHistory: history.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      changedByName: h.changed_by_name,
      createdAt: h.created_at,
    })),
  };
}

/**
 * Re-derives cart line items straight from `cart_items`/`products` (not cartService's public
 * shape, which discards the raw image filename order_items needs) and rejects up front if
 * anything in the cart isn't currently purchasable. Used by both the COD and Razorpay paths so
 * they apply the exact same pre-checkout validation.
 */
async function getPurchasableCartItems(userId) {
  const rows = await cartModel.findAllByUser(userId);
  if (!rows.length) throw new ApiError(422, 'Your cart is empty.');

  const items = [];
  let subtotal = 0;
  for (const row of rows) {
    const quantity = Number(row.quantity);
    const stock = Number(row.stock_quantity);
    if (!row.product_is_active || stock <= 0 || quantity > stock) {
      throw new ApiError(422, 'Some items in your cart need attention before you can check out.');
    }
    const unitPrice = Number(row.price);
    const lineTotal = Number((unitPrice * quantity).toFixed(2));
    subtotal += lineTotal;
    items.push({
      productId: row.product_id,
      productName: row.product_name,
      productImage: row.image_path,
      unitPrice,
      quantity,
      lineTotal,
    });
  }
  return { items, subtotal: Number(subtotal.toFixed(2)) };
}

// --- Cash on Delivery ----------------------------------------------------

/**
 * Places a COD order from the user's current cart in one transaction: every line is
 * re-priced and stock-checked (locked with FOR UPDATE) against the live `products` row
 * rather than the cart's cached copy, so a price change or a race with another shopper
 * can't produce a bad order. Either every line succeeds and stock is decremented, or
 * nothing is written at all.
 */
export async function checkout(userId, { addressId, paymentMethod = 'cod' }) {
  if (paymentMethod !== 'cod') {
    throw new ApiError(422, 'Use POST /api/orders/razorpay/create to pay online.');
  }

  const address = await addressService.getAddress(addressId, userId);
  const { items } = await getPurchasableCartItems(userId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let subtotal = 0;
    const lineItems = [];

    // Sorting by productId keeps lock acquisition order consistent across concurrent
    // checkouts, avoiding a deadlock between two transactions that share products but
    // list them in a different cart order.
    const sortedItems = [...items].sort((a, b) => a.productId - b.productId);

    for (const item of sortedItems) {
      // COD hasn't collected any money yet, so — unlike the Razorpay path — we re-price
      // against whatever the product's *current* price is at lock time, not the price the
      // cart last saw.
      const product = await lockAndDecrementStock(connection, item.productId, item.quantity, item.productName);
      const unitPrice = Number(product.price);
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      subtotal += lineTotal;
      lineItems.push({ ...item, unitPrice, lineTotal });
    }

    subtotal = Number(subtotal.toFixed(2));
    const { shippingFee, total } = computeShipping(subtotal);

    const orderId = await orderModel.create(connection, {
      userId,
      orderNumber: generateOrderNumber(),
      subtotal,
      shippingFee,
      total,
      address,
    });

    for (const item of lineItems) {
      await orderModel.addItem(connection, orderId, item);
    }

    await orderModel.addStatusHistory(connection, orderId, {
      status: 'pending',
      note: 'Order placed (Cash on Delivery).',
    });

    await connection.commit();

    // Cart is cleared after a successful commit — if this step fails the order still
    // stands; a leftover cart line is a harmless inconvenience compared to rolling back
    // a completed order.
    await cartModel.clear(userId);

    const order = await getOrder(orderId, userId);
    // Emails + in-app notifications are fire-and-forget: the order is already committed, so
    // nothing they do (or fail to do) may affect the response.
    void orderNotifications.orderPlaced(order, userId);
    return order;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// --- Razorpay --------------------------------------------------------------

/**
 * Step 1 of the online-payment flow: opens a Razorpay order for the cart's current total and
 * snapshots the address + priced line items into a `payment_intents` row. Verification later
 * re-hydrates from that snapshot rather than the cart, so nothing the customer does to their
 * cart in the checkout widget's few minutes can change what they end up being charged for.
 */
export async function createRazorpayOrder(userId, { addressId }) {
  const address = await addressService.getAddress(addressId, userId);
  const { items, subtotal } = await getPurchasableCartItems(userId);
  const { shippingFee, total } = computeShipping(subtotal);

  const razorpayOrder = await razorpayService.createOrder({
    amount: total,
    receipt: `rcpt_${userId}_${Date.now()}`,
    notes: { userId: String(userId), addressId: String(addressId) },
  });

  await paymentIntentModel.create({
    userId,
    addressId: address.id,
    razorpayOrderId: razorpayOrder.id,
    subtotal,
    shippingFee,
    amount: total,
    items,
  });

  return {
    keyId: env.razorpay.keyId,
    razorpayOrderId: razorpayOrder.id,
    amount: total,
    currency: razorpayOrder.currency,
  };
}

/**
 * Core of step 2, shared by the client's own confirmation call and the webhook fallback.
 * Assumes the caller has already established the payment is genuine (signature checked by
 * the caller, or the whole webhook body's HMAC checked upstream) — this function's job is
 * purely to turn a verified payment into an order, exactly once.
 *
 * `requireUserId`, when given, rejects an intent that belongs to a different user (defense in
 * depth for the client-facing call); the webhook has no logged-in user, so it's omitted there.
 */
async function fulfillPaymentIntent(razorpayOrderId, razorpayPaymentId, { requireUserId = null } = {}) {
  const connection = await pool.getConnection();
  let settled = false;
  let intent = null;

  try {
    await connection.beginTransaction();

    // FOR UPDATE here is what makes this idempotent under concurrent calls — the client's
    // own confirmation call racing the webhook for the same payment, or a double-submit —
    // whichever arrives first holds the lock until it commits.
    intent = await paymentIntentModel.findByRazorpayOrderIdForUpdate(razorpayOrderId, connection);
    if (!intent || (requireUserId !== null && intent.user_id !== requireUserId)) {
      throw new ApiError(404, 'Payment session not found.');
    }

    if (intent.status === 'paid' && intent.order_id) {
      await connection.commit();
      settled = true;
      return await getOrder(intent.order_id, intent.user_id);
    }
    if (intent.status !== 'created') {
      throw new ApiError(409, 'This payment session is no longer valid. Please try checking out again.');
    }

    const items = JSON.parse(intent.items_json);
    const addressRow = await addressModel.findById(intent.address_id);
    if (!addressRow) {
      // Deleted between opening the Razorpay order and paying for it — rare, but the payment
      // already succeeded, so this falls into the same automatic-refund path as a stock
      // shortfall below rather than leaving the customer's money stuck in limbo.
      throw new ApiError(422, 'The shipping address for this order no longer exists.');
    }

    const orderId = await orderModel.create(connection, {
      userId: intent.user_id,
      orderNumber: generateOrderNumber(),
      subtotal: Number(intent.subtotal),
      shippingFee: Number(intent.shipping_fee),
      total: Number(intent.amount),
      address: addressRowToOrderAddress(addressRow),
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      razorpayOrderId,
      razorpayPaymentId,
    });

    // Stock is (re-)checked here, at fulfillment time, using the item list *and prices* that
    // were actually charged — not re-priced against current product rows, since the customer
    // already paid a fixed amount for this exact snapshot.
    for (const item of items) {
      await lockAndDecrementStock(connection, item.productId, item.quantity, item.productName);
      await orderModel.addItem(connection, orderId, item);
    }

    await orderModel.addStatusHistory(connection, orderId, {
      status: 'pending',
      note: 'Order placed (paid online via Razorpay).',
    });

    await paymentIntentModel.markPaid(connection, intent.id, { razorpayPaymentId, orderId });
    await connection.commit();
    settled = true;

    await cartModel.clear(intent.user_id);
    const order = await getOrder(orderId, intent.user_id);
    void orderNotifications.orderPlaced(order, intent.user_id);
    return order;
  } catch (err) {
    if (!settled) await connection.rollback();

    // A stock failure past this point means Razorpay already captured the payment but the
    // order can no longer be fulfilled — refund automatically rather than keep the customer's
    // money for something that will never ship.
    if (intent && err instanceof ApiError && err.statusCode === 422) {
      try {
        await razorpayService.refundPayment(razorpayPaymentId, Number(intent.amount));
        await paymentIntentModel.markRefunded(intent.id);
      } catch (refundErr) {
        console.error(`Automatic refund failed for Razorpay payment ${razorpayPaymentId}:`, refundErr);
      }
      throw new ApiError(
        409,
        `${err.message} You've been automatically refunded — please review your cart and try again.`
      );
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Step 2, client-facing: called by the browser once Razorpay's Checkout.js reports success.
 * The signature is what actually proves the payment happened — everything else in the
 * browser's success callback is just data the page could fabricate.
 */
export async function verifyRazorpayPayment(userId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const valid = razorpayService.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
  if (!valid) {
    const intent = await paymentIntentModel.findByRazorpayOrderId(razorpayOrderId);
    if (intent && intent.user_id === userId && intent.status === 'created') {
      await paymentIntentModel.markFailed(intent.id, razorpayPaymentId).catch(() => {});
    }
    throw new ApiError(400, 'Payment verification failed. If you were charged, please contact support.');
  }
  return fulfillPaymentIntent(razorpayOrderId, razorpayPaymentId, { requireUserId: userId });
}

/**
 * Step 2, server-to-server fallback: Razorpay calls our webhook independently of the
 * customer's browser, so a closed tab or dropped connection right after payment still results
 * in a fulfilled order. The caller (the webhook controller) has already verified the whole
 * request body's HMAC signature before this runs, so there's no per-payment signature to check
 * here — fulfillPaymentIntent's own idempotency handles it if the client's call already won.
 */
export async function fulfillFromWebhook({ razorpayOrderId, razorpayPaymentId }) {
  return fulfillPaymentIntent(razorpayOrderId, razorpayPaymentId);
}

// --- Reads / admin -----------------------------------------------------

export async function listOrders(userId) {
  const orders = await orderModel.findAllByUser(userId);
  return orders.map((o) => toPublicOrder(o));
}

/**
 * Phase 8: adds search/date-range/payment filters and pagination on top of Phase 5's status
 * filter. `page`/`limit` are clamped here (not trusted from the query string as-is) since
 * orderModel interpolates them directly into a LIMIT/OFFSET clause.
 */
export async function listOrdersAdmin({
  status,
  search,
  dateFrom,
  dateTo,
  paymentStatus,
  paymentMethod,
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));

  const filters = { status, search, dateFrom, dateTo, paymentStatus, paymentMethod };
  const [orders, total] = await Promise.all([
    orderModel.findAllAdmin({ ...filters, page: safePage, limit: safeLimit }),
    orderModel.countAdmin(filters),
  ]);

  return {
    orders: orders.map((o) => toPublicOrder(o)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

/** Dashboard summary — order counts by status, today's order count, and total paid revenue. */
export async function getOrderStats() {
  const stats = await orderModel.getAdminStats();
  return {
    totalOrders: stats.totalOrders,
    todayOrders: stats.todayOrders,
    revenue: Number(stats.revenue),
    byStatus: stats.byStatus,
    daily: stats.daily,
    topProducts: stats.topProducts,
    customers: stats.customers,
    reviews: stats.reviews,
  };
}

export async function getOrder(id, userId = null) {
  const order = await orderModel.findById(id);
  if (!order || (userId !== null && order.user_id !== userId)) {
    throw new ApiError(404, 'Order not found.');
  }
  const items = await orderModel.findItemsByOrder(id);
  const history = await orderModel.findStatusHistory(id);
  return toPublicOrder(order, items, history);
}

/**
 * Admin-only: moves an order to any valid next status, optionally attaching a note and/or a
 * tracking number + carrier (typically set together with the move to "shipped", but accepted
 * on any transition in case it needs correcting later). Runs the status change as one
 * transaction; a same-transaction refund isn't possible against a real payment gateway, so a
 * cancellation of an already-paid Razorpay order is refunded in a separate step right after
 * the transaction commits (see refundIfPaidRazorpayOrder).
 */
export async function updateOrderStatus(orderId, { status, note, trackingNumber, carrier } = {}, adminUserId = null) {
  const connection = await pool.getConnection();
  let order = null;
  try {
    await connection.beginTransaction();
    order = await orderModel.findByIdForUpdate(orderId, connection);
    if (!order) throw new ApiError(404, 'Order not found.');

    await applyStatusChange(connection, order, status, { note, changedBy: adminUserId, trackingNumber, carrier });
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  if (status === 'cancelled') await refundIfPaidRazorpayOrder(order);

  const updated = await getOrder(orderId);
  void orderNotifications.orderStatusChanged(updated, order.user_id, { note });
  return updated;
}

/** Admin-only: record collection of a COD payment. Online payments are changed only by Razorpay verification. */
export async function markOrderPaid(orderId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const order = await orderModel.findByIdForUpdate(orderId, connection);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.payment_method !== 'cod') {
      throw new ApiError(409, 'Online payment status is managed by the payment provider.');
    }
    if (order.payment_status !== 'pending') {
      throw new ApiError(409, `Payment is already "${order.payment_status}".`);
    }

    await orderModel.updatePaymentStatus(connection, orderId, 'paid');
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return getOrder(orderId);
}

/**
 * Customer-facing self-cancel: only the order's own owner can call this, and only while the
 * order is still `pending` or `processing` (enforced by assertValidTransition via
 * applyStatusChange). Shares the same restock + refund handling as the admin path.
 */
export async function cancelOrder(orderId, userId, reason) {
  const connection = await pool.getConnection();
  let order = null;
  try {
    await connection.beginTransaction();
    order = await orderModel.findByIdForUpdate(orderId, connection);
    if (!order || order.user_id !== userId) throw new ApiError(404, 'Order not found.');

    await applyStatusChange(connection, order, 'cancelled', {
      note: reason ? reason.trim() : 'Cancelled by customer.',
      changedBy: null,
    });
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  await refundIfPaidRazorpayOrder(order);

  const updated = await getOrder(orderId, userId);
  void orderNotifications.orderStatusChanged(updated, userId, {
    note: reason ? reason.trim() : null,
    cancelledByCustomer: true,
  });
  return updated;
}
