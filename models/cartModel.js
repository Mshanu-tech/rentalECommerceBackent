import pool from '../config/database.js';

// Joins in everything a cart line needs to render and to be re-validated
// against current stock/price — the client never has to make a second
// request per line item.
const ITEM_COLUMNS = `
  ci.id, ci.product_id, ci.quantity, ci.created_at,
  p.name AS product_name, p.slug AS product_slug, p.price, p.compare_at_price,
  p.stock_quantity, p.is_active AS product_is_active,
  (SELECT image_path FROM product_images pi
     WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_path
`;

export async function findAllByUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${ITEM_COLUMNS}
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = :userId
     ORDER BY ci.created_at DESC`,
    { userId }
  );
  return rows;
}

export async function findItem(userId, productId) {
  const [rows] = await pool.query(
    'SELECT * FROM cart_items WHERE user_id = :userId AND product_id = :productId LIMIT 1',
    { userId, productId }
  );
  return rows[0] || null;
}

export async function upsert(userId, productId, quantity) {
  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES (:userId, :productId, :quantity)
     ON DUPLICATE KEY UPDATE quantity = :quantity`,
    { userId, productId, quantity }
  );
}

export async function remove(userId, productId) {
  await pool.query('DELETE FROM cart_items WHERE user_id = :userId AND product_id = :productId', {
    userId,
    productId,
  });
}

export async function clear(userId) {
  await pool.query('DELETE FROM cart_items WHERE user_id = :userId', { userId });
}
