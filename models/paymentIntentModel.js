import pool from '../config/database.js';

export async function create({ userId, addressId, razorpayOrderId, subtotal, shippingFee, amount, items }) {
  const [result] = await pool.query(
    `INSERT INTO payment_intents
       (user_id, address_id, razorpay_order_id, subtotal, shipping_fee, amount, items_json)
     VALUES
       (:userId, :addressId, :razorpayOrderId, :subtotal, :shippingFee, :amount, :itemsJson)`,
    { userId, addressId, razorpayOrderId, subtotal, shippingFee, amount, itemsJson: JSON.stringify(items) }
  );
  return findById(result.insertId);
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM payment_intents WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

export async function findByRazorpayOrderId(razorpayOrderId) {
  const [rows] = await pool.query(
    'SELECT * FROM payment_intents WHERE razorpay_order_id = :razorpayOrderId LIMIT 1',
    { razorpayOrderId }
  );
  return rows[0] || null;
}

/**
 * Row-locking read used inside the verification transaction — this is what makes fulfillment
 * idempotent under concurrent calls (the client's own confirmation call racing the webhook, or
 * a double-submit): whichever gets here first holds the lock until it commits, and by the time
 * the second call acquires the lock, `status` has already moved off 'created'.
 */
export async function findByRazorpayOrderIdForUpdate(razorpayOrderId, connection) {
  const [rows] = await connection.query(
    'SELECT * FROM payment_intents WHERE razorpay_order_id = :razorpayOrderId FOR UPDATE',
    { razorpayOrderId }
  );
  return rows[0] || null;
}

export async function markPaid(connection, id, { razorpayPaymentId, orderId }) {
  await connection.query(
    `UPDATE payment_intents
     SET status = 'paid', razorpay_payment_id = :razorpayPaymentId, order_id = :orderId
     WHERE id = :id`,
    { id, razorpayPaymentId, orderId }
  );
}

export async function markFailed(id, razorpayPaymentId = null) {
  await pool.query(
    `UPDATE payment_intents SET status = 'failed', razorpay_payment_id = :razorpayPaymentId WHERE id = :id`,
    { id, razorpayPaymentId }
  );
}

export async function markRefunded(id) {
  await pool.query(`UPDATE payment_intents SET status = 'refunded' WHERE id = :id`, { id });
}
