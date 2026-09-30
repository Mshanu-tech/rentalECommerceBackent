import pool from '../config/database.js';

const LIST_COLUMNS = `
  p.id, p.category_id, p.name, p.slug, p.description, p.price, p.compare_at_price,
  p.sku, p.stock_quantity, p.low_stock_threshold, p.is_active, p.is_featured, p.created_at, p.updated_at,
  c.name AS category_name, c.slug AS category_slug,
  (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id AND r.is_hidden = 0) AS rating_average,
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.is_hidden = 0) AS review_count
`;

export async function findAll({ includeInactive = false, categoryId = null, search = null } = {}) {
  const conditions = [];
  const params = {};

  if (!includeInactive) conditions.push('p.is_active = 1');
  if (categoryId) {
    conditions.push('p.category_id = :categoryId');
    params.categoryId = categoryId;
  }
  if (search) {
    conditions.push('p.name LIKE :search');
    params.search = `%${search}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );
  return rows;
}

export async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

export async function findBySlug(slug) {
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.slug = :slug LIMIT 1`,
    { slug }
  );
  return rows[0] || null;
}

export async function create({
  categoryId,
  name,
  slug,
  description,
  price,
  compareAtPrice,
  sku,
  stockQuantity,
  lowStockThreshold,
  isFeatured = false,
}) {
  const [result] = await pool.query(
    `INSERT INTO products
       (category_id, name, slug, description, price, compare_at_price, sku, stock_quantity, low_stock_threshold, is_featured)
     VALUES
       (:categoryId, :name, :slug, :description, :price, :compareAtPrice, :sku, :stockQuantity, :lowStockThreshold, :isFeatured)`,
    { categoryId, name, slug, description, price, compareAtPrice, sku, stockQuantity, lowStockThreshold, isFeatured: isFeatured ? 1 : 0 }
  );
  return findById(result.insertId);
}

export async function update(
  id,
  {
    categoryId,
    name,
    slug,
    description,
    price,
    compareAtPrice,
    sku,
    stockQuantity,
    lowStockThreshold,
    isActive,
    isFeatured,
  }
) {
  await pool.query(
    `UPDATE products
     SET category_id = :categoryId, name = :name, slug = :slug, description = :description,
         price = :price, compare_at_price = :compareAtPrice, sku = :sku,
         stock_quantity = :stockQuantity, low_stock_threshold = :lowStockThreshold, is_active = :isActive,
         is_featured = :isFeatured
     WHERE id = :id`,
    {
      id,
      categoryId,
      name,
      slug,
      description,
      price,
      compareAtPrice,
      sku,
      stockQuantity,
      lowStockThreshold,
      isActive,
      isFeatured: isFeatured ? 1 : 0,
    }
  );
  return findById(id);
}

/**
 * Atomically decrements stock, failing (0 affected rows) if there isn't
 * enough left — used by orderService inside a transaction so two
 * simultaneous checkouts can never both succeed against the same last unit.
 * Accepts an optional connection so the caller can run it as part of a
 * larger transaction; falls back to the shared pool otherwise.
 */
export async function decrementStock(productId, quantity, connection = pool) {
  const [result] = await connection.query(
    `UPDATE products
     SET stock_quantity = stock_quantity - :quantity
     WHERE id = :productId AND stock_quantity >= :quantity`,
    { productId, quantity }
  );
  return result.affectedRows > 0;
}

/**
 * Reverses `decrementStock` — used when an order is cancelled after stock was already taken
 * (COD orders past pending, or any paid order) so cancelling an order gives the stock back
 * instead of leaving it permanently reserved. Accepts an optional connection for the same
 * reason `decrementStock` does: cancellation runs as one transaction alongside the status
 * change.
 */
export async function incrementStock(productId, quantity, connection = pool) {
  await connection.query(
    `UPDATE products SET stock_quantity = stock_quantity + :quantity WHERE id = :productId`,
    { productId, quantity }
  );
}

/** Row-locking read used inside a checkout transaction to check current stock/price/active state. */
export async function findByIdForUpdate(id, connection) {
  const [rows] = await connection.query('SELECT * FROM products WHERE id = :id FOR UPDATE', { id });
  return rows[0] || null;
}

/**
 * Sets stock to an exact value — used by productService.adjustStock (Phase 8), always inside
 * the same transaction as the FOR UPDATE lock and the stock_adjustments log row, so the two
 * never drift apart. Unlike decrementStock/incrementStock (checkout/cancellation), this never
 * fails on affected-rows: the caller has already computed and validated newQuantity itself.
 */
export async function setStockQuantity(productId, newQuantity, connection) {
  await connection.query(
    'UPDATE products SET stock_quantity = :newQuantity WHERE id = :productId',
    { productId, newQuantity }
  );
}

/**
 * Products at or below their own low_stock_threshold (active ones only — a discontinued
 * product running low isn't something an admin needs paged about). Ordered worst-first so
 * out-of-stock items surface above merely-low ones.
 */
export async function findLowStock() {
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1 AND p.stock_quantity <= p.low_stock_threshold
     ORDER BY p.stock_quantity ASC, p.name ASC`
  );
  return rows;
}

/** Count of active products at/below their threshold — used by the admin dashboard stat card. */
export async function countLowStock() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND stock_quantity <= low_stock_threshold`
  );
  return rows[0].count;
}

// --- Stock adjustments (Phase 8) ---------------------------------------

export async function insertStockAdjustment(
  connection,
  { productId, previousQuantity, newQuantity, reason, note, changedBy }
) {
  await connection.query(
    `INSERT INTO stock_adjustments
       (product_id, previous_quantity, new_quantity, change_qty, reason, note, changed_by)
     VALUES
       (:productId, :previousQuantity, :newQuantity, :changeQty, :reason, :note, :changedBy)`,
    {
      productId,
      previousQuantity,
      newQuantity,
      changeQty: newQuantity - previousQuantity,
      reason,
      note,
      changedBy,
    }
  );
}

export async function findStockAdjustments(productId) {
  const [rows] = await pool.query(
    `SELECT a.*, u.name AS changed_by_name
     FROM stock_adjustments a
     LEFT JOIN users u ON u.id = a.changed_by
     WHERE a.product_id = :productId
     ORDER BY a.created_at DESC, a.id DESC`,
    { productId }
  );
  return rows;
}

export async function remove(id) {
  // ON DELETE CASCADE on product_images.product_id takes care of the rows;
  // the files themselves are removed by productService before this runs.
  await pool.query('DELETE FROM products WHERE id = :id', { id });
}

// --- Images -----------------------------------------------------------

export async function findImages(productId) {
  const [rows] = await pool.query(
    `SELECT * FROM product_images
     WHERE product_id = :productId
     ORDER BY is_primary DESC, display_order ASC, id ASC`,
    { productId }
  );
  return rows;
}

export async function findImageById(imageId) {
  const [rows] = await pool.query('SELECT * FROM product_images WHERE id = :id LIMIT 1', {
    id: imageId,
  });
  return rows[0] || null;
}

export async function addImage({ productId, imagePath, displayOrder = 0, isPrimary = false }) {
  const [result] = await pool.query(
    `INSERT INTO product_images (product_id, image_path, display_order, is_primary)
     VALUES (:productId, :imagePath, :displayOrder, :isPrimary)`,
    { productId, imagePath, displayOrder, isPrimary }
  );
  return findImageById(result.insertId);
}

export async function removeImage(imageId) {
  await pool.query('DELETE FROM product_images WHERE id = :id', { id: imageId });
}

export async function updateImagePath(imageId, imagePath) {
  await pool.query('UPDATE product_images SET image_path = :imagePath WHERE id = :imageId', {
    imageId,
    imagePath,
  });
}

export async function setPrimaryImage(productId, imageId) {
  await pool.query('UPDATE product_images SET is_primary = 0 WHERE product_id = :productId', {
    productId,
  });
  await pool.query('UPDATE product_images SET is_primary = 1 WHERE id = :imageId', { imageId });
}
