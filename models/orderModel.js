import pool from '../config/database.js';

/**
 * Every write here takes an explicit `connection` — orderService always runs order creation
 * as one transaction, for both the COD and Razorpay flows.
 * `paymentMethod`/`paymentStatus`/`razorpay*` default to plain COD so the COD checkout call
 * site doesn't need to know or care about Razorpay's fields.
 */
export async function create(
  connection,
  {
    userId,
    orderNumber,
    subtotal,
    shippingFee,
    total,
    address,
    paymentMethod = 'cod',
    paymentStatus = 'pending',
    razorpayOrderId = null,
    razorpayPaymentId = null,
  }
) {
  const [result] = await connection.query(
    `INSERT INTO orders
       (user_id, order_number, payment_method, payment_status, razorpay_order_id, razorpay_payment_id,
        subtotal, shipping_fee, total,
        shipping_full_name, shipping_phone, shipping_line1, shipping_line2,
        shipping_city, shipping_state, shipping_postal_code, shipping_country)
     VALUES
       (:userId, :orderNumber, :paymentMethod, :paymentStatus, :razorpayOrderId, :razorpayPaymentId,
        :subtotal, :shippingFee, :total,
        :fullName, :phone, :line1, :line2,
        :city, :state, :postalCode, :country)`,
    {
      userId,
      orderNumber,
      paymentMethod,
      paymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      subtotal,
      shippingFee,
      total,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    }
  );
  return result.insertId;
}

export async function addItem(connection, orderId, { productId, productName, productImage, unitPrice, quantity, lineTotal }) {
  await connection.query(
    `INSERT INTO order_items (order_id, product_id, product_name, product_image, unit_price, quantity, line_total)
     VALUES (:orderId, :productId, :productName, :productImage, :unitPrice, :quantity, :lineTotal)`,
    { orderId, productId, productName, productImage, unitPrice, quantity, lineTotal }
  );
}

export async function findAllByUser(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE user_id = :userId ORDER BY created_at DESC',
    { userId }
  );
  return rows;
}

/**
 * Builds the shared WHERE clause for the admin order list/count — kept in one place so the
 * rows query and the COUNT(*) query can never drift out of sync with each other.
 * `search` matches the order number or the customer's name/email; `dateFrom`/`dateTo` are
 * inclusive calendar-day bounds (YYYY-MM-DD) compared against `created_at`.
 */
function buildAdminFilter({ status, search, dateFrom, dateTo, paymentStatus, paymentMethod }) {
  const conditions = [];
  const params = {};

  if (status) {
    conditions.push('o.status = :status');
    params.status = status;
  }
  if (paymentStatus) {
    conditions.push('o.payment_status = :paymentStatus');
    params.paymentStatus = paymentStatus;
  }
  if (paymentMethod) {
    conditions.push('o.payment_method = :paymentMethod');
    params.paymentMethod = paymentMethod;
  }
  if (search) {
    conditions.push('(o.order_number LIKE :search OR u.name LIKE :search OR u.email LIKE :search)');
    params.search = `%${search}%`;
  }
  if (dateFrom) {
    conditions.push('o.created_at >= :dateFrom');
    params.dateFrom = `${dateFrom} 00:00:00`;
  }
  if (dateTo) {
    conditions.push('o.created_at <= :dateTo');
    params.dateTo = `${dateTo} 23:59:59`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

/**
 * Phase 8: search/date/payment filters (on top of Phase 5's status filter) plus pagination —
 * `page`/`limit` are trusted here as already-validated positive integers (orderService clamps
 * them), so they're interpolated directly rather than bound as query params, which mysql2
 * doesn't support for LIMIT/OFFSET with named placeholders.
 */
export async function findAllAdmin({
  status = null,
  search = null,
  dateFrom = null,
  dateTo = null,
  paymentStatus = null,
  paymentMethod = null,
  page = 1,
  limit = 20,
} = {}) {
  const { where, params } = buildAdminFilter({ status, search, dateFrom, dateTo, paymentStatus, paymentMethod });
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return rows;
}

/** Total row count for the same filter set findAllAdmin uses, for pagination metadata. */
export async function countAdmin({
  status = null,
  search = null,
  dateFrom = null,
  dateTo = null,
  paymentStatus = null,
  paymentMethod = null,
} = {}) {
  const { where, params } = buildAdminFilter({ status, search, dateFrom, dateTo, paymentStatus, paymentMethod });
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${where}`,
    params
  );
  return rows[0].count;
}

/**
 * Dashboard summary: how many orders sit in each status right now, how many came in today,
 * and total revenue collected (paid orders only — a pending COD order hasn't actually been
 * paid for yet, so it shouldn't count as revenue).
 */
export async function getAdminStats() {
  const [statusRows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM orders GROUP BY status`
  );
  const [[{ count: totalOrders }]] = await pool.query('SELECT COUNT(*) AS count FROM orders');
  const [[{ count: todayOrders }]] = await pool.query(
    'SELECT COUNT(*) AS count FROM orders WHERE created_at >= CURDATE()'
  );
  const [[{ revenue }]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE payment_status = 'paid'`
  );

  const byStatus = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  for (const row of statusRows) byStatus[row.status] = row.count;

  // Last 7 days (today included), zero-filled so the chart never has gaps.
  const [dailyRows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS orders,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS revenue
     FROM orders
     WHERE created_at >= CURDATE() - INTERVAL 6 DAY AND status <> 'cancelled'
     GROUP BY day`
  );
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = dailyMap.get(key);
    daily.push({ date: key, orders: row ? Number(row.orders) : 0, revenue: row ? Number(row.revenue) : 0 });
  }

  const [topProducts] = await pool.query(
    `SELECT oi.product_id AS productId, oi.product_name AS name, SUM(oi.quantity) AS units
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled'
     GROUP BY oi.product_id, oi.product_name
     ORDER BY units DESC
     LIMIT 5`
  );

  const [[{ count: customers }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'customer' AND is_verified = 1"
  );
  const [[{ count: reviews }]] = await pool.query('SELECT COUNT(*) AS count FROM reviews');

  return {
    totalOrders,
    todayOrders,
    revenue,
    byStatus,
    daily,
    topProducts: topProducts.map((p) => ({ ...p, units: Number(p.units) })),
    customers,
    reviews,
  };
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

export async function findItemsByOrder(orderId) {
  const [rows] = await pool.query('SELECT * FROM order_items WHERE order_id = :orderId ORDER BY id ASC', {
    orderId,
  });
  return rows;
}

/** Row-locking read used inside the status-change transaction, same idea as productModel's. */
export async function findByIdForUpdate(id, connection) {
  const [rows] = await connection.query('SELECT * FROM orders WHERE id = :id FOR UPDATE', { id });
  return rows[0] || null;
}

export async function updateStatus(id, status) {
  await pool.query('UPDATE orders SET status = :status WHERE id = :id', { id, status });
  return findById(id);
}

export async function updatePaymentStatus(connection, id, paymentStatus) {
  await connection.query(
    'UPDATE orders SET payment_status = :paymentStatus WHERE id = :id',
    { id, paymentStatus }
  );
}

/**
 * Phase 7 — used by orderService.updateOrderStatus. Always sets `status`; `trackingNumber`/
 * `carrier`/`cancelledReason` are only overwritten when explicitly passed (undefined leaves
 * the existing column value alone, via COALESCE-style "keep current" params) so, e.g.,
 * marking an order "delivered" doesn't blank out the tracking number set when it shipped.
 */
export async function updateStatusAndTracking(
  connection,
  id,
  { status, trackingNumber, carrier, cancelledReason }
) {
  await connection.query(
    `UPDATE orders
     SET status = :status,
         tracking_number = COALESCE(:trackingNumber, tracking_number),
         carrier = COALESCE(:carrier, carrier),
         cancelled_reason = COALESCE(:cancelledReason, cancelled_reason)
     WHERE id = :id`,
    {
      id,
      status,
      trackingNumber: trackingNumber ?? null,
      carrier: carrier ?? null,
      cancelledReason: cancelledReason ?? null,
    }
  );
}

/** Appends one row to the order's status timeline. `changedBy` is null for system-made changes. */
export async function addStatusHistory(connection, orderId, { status, note = null, changedBy = null }) {
  await connection.query(
    `INSERT INTO order_status_history (order_id, status, note, changed_by)
     VALUES (:orderId, :status, :note, :changedBy)`,
    { orderId, status, note, changedBy }
  );
}

export async function findStatusHistory(orderId) {
  const [rows] = await pool.query(
    `SELECT h.*, u.name AS changed_by_name
     FROM order_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.order_id = :orderId
     ORDER BY h.created_at ASC, h.id ASC`,
    { orderId }
  );
  return rows;
}
