import pool from '../config/database.js';

export async function findByUserAndProduct(userId, productId) {
  const [rows] = await pool.query(
    'SELECT * FROM reviews WHERE user_id = :userId AND product_id = :productId LIMIT 1',
    { userId, productId }
  );
  return rows[0] || null;
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM reviews WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

export async function create({ productId, userId, rating, title, comment }) {
  const [result] = await pool.query(
    `INSERT INTO reviews (product_id, user_id, rating, title, comment)
     VALUES (:productId, :userId, :rating, :title, :comment)`,
    { productId, userId, rating, title, comment }
  );
  return result.insertId;
}

export async function update(id, { rating, title, comment }) {
  await pool.query(
    'UPDATE reviews SET rating = :rating, title = :title, comment = :comment WHERE id = :id',
    { id, rating, title, comment }
  );
}

export async function remove(id) {
  await pool.query('DELETE FROM reviews WHERE id = :id', { id });
}

export async function setHidden(id, isHidden) {
  await pool.query('UPDATE reviews SET is_hidden = :isHidden WHERE id = :id', { id, isHidden: isHidden ? 1 : 0 });
}

/** Public list for a product page: visible reviews only, newest first. */
export async function findVisibleByProduct(productId, { limit, offset }) {
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id, r.rating, r.title, r.comment, r.created_at, u.name AS user_name,
            EXISTS(
              SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
              WHERE o.user_id = r.user_id AND o.status = 'delivered' AND oi.product_id = r.product_id
            ) AS verified_purchase
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = :productId AND r.is_hidden = 0
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    { productId }
  );
  return rows;
}

/** Average, total and per-star counts across visible reviews. */
export async function getSummary(productId) {
  const [rows] = await pool.query(
    `SELECT rating, COUNT(*) AS count
     FROM reviews WHERE product_id = :productId AND is_hidden = 0
     GROUP BY rating`,
    { productId }
  );
  return rows;
}

/**
 * Purchase check: has this customer received (order status `delivered`) at least one order
 * containing the product? Deliberately requires delivery, not just payment — a review of
 * something that hasn't arrived yet isn't a review of the product.
 */
export async function hasDeliveredPurchase(userId, productId) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = :userId AND o.status = 'delivered' AND oi.product_id = :productId
     LIMIT 1`,
    { userId, productId }
  );
  return rows.length > 0;
}

// --- Admin -------------------------------------------------------------------

function buildAdminFilter({ hidden, rating, search }) {
  const conditions = [];
  const params = {};
  if (hidden === true) conditions.push('r.is_hidden = 1');
  if (hidden === false) conditions.push('r.is_hidden = 0');
  if (rating) {
    conditions.push('r.rating = :rating');
    params.rating = rating;
  }
  if (search) {
    conditions.push('(p.name LIKE :search OR u.name LIKE :search OR r.comment LIKE :search OR r.title LIKE :search)');
    params.search = `%${search}%`;
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export async function findAllAdmin({ hidden = null, rating = null, search = null, limit, offset }) {
  const { where, params } = buildAdminFilter({ hidden, rating, search });
  const [rows] = await pool.query(
    `SELECT r.*, p.name AS product_name, u.name AS user_name, u.email AS user_email
     FROM reviews r
     JOIN products p ON p.id = r.product_id
     JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return rows;
}

export async function countAdmin({ hidden = null, rating = null, search = null }) {
  const { where, params } = buildAdminFilter({ hidden, rating, search });
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM reviews r
     JOIN products p ON p.id = r.product_id
     JOIN users u ON u.id = r.user_id
     ${where}`,
    params
  );
  return rows[0].count;
}
