import pool from '../config/database.js';

const ITEM_COLUMNS = `
  w.id, w.product_id, w.created_at,
  p.name AS product_name, p.slug AS product_slug, p.price, p.compare_at_price,
  p.stock_quantity, p.is_active AS product_is_active,
  (SELECT image_path FROM product_images pi
     WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_path
`;

export async function findAllByUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${ITEM_COLUMNS}
     FROM wishlist_items w
     JOIN products p ON p.id = w.product_id
     WHERE w.user_id = :userId
     ORDER BY w.created_at DESC`,
    { userId }
  );
  return rows;
}

/** Just the product IDs — cheap to fetch alongside a product list to mark hearts as filled. */
export async function findProductIdsByUser(userId) {
  const [rows] = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = :userId', {
    userId,
  });
  return rows.map((r) => r.product_id);
}

export async function exists(userId, productId) {
  const [rows] = await pool.query(
    'SELECT id FROM wishlist_items WHERE user_id = :userId AND product_id = :productId LIMIT 1',
    { userId, productId }
  );
  return Boolean(rows[0]);
}

export async function add(userId, productId) {
  await pool.query(
    `INSERT INTO wishlist_items (user_id, product_id)
     VALUES (:userId, :productId)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    { userId, productId }
  );
}

export async function remove(userId, productId) {
  await pool.query(
    'DELETE FROM wishlist_items WHERE user_id = :userId AND product_id = :productId',
    { userId, productId }
  );
}
