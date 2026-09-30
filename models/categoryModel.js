import pool from '../config/database.js';

export async function findAll({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = 1';
  const [rows] = await pool.query(`SELECT * FROM categories ${where} ORDER BY name ASC`);
  return rows;
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM categories WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

export async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM categories WHERE slug = :slug LIMIT 1', { slug });
  return rows[0] || null;
}

export async function create({ name, slug, description }) {
  const [result] = await pool.query(
    `INSERT INTO categories (name, slug, description) VALUES (:name, :slug, :description)`,
    { name, slug, description }
  );
  return findById(result.insertId);
}

export async function update(id, { name, slug, description, isActive }) {
  await pool.query(
    `UPDATE categories
     SET name = :name, slug = :slug, description = :description, is_active = :isActive
     WHERE id = :id`,
    { id, name, slug, description, isActive }
  );
  return findById(id);
}

export async function remove(id) {
  await pool.query('DELETE FROM categories WHERE id = :id', { id });
}

/** Used to block deletion of a category that still has products in it. */
export async function countProducts(id) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM products WHERE category_id = :id',
    { id }
  );
  return rows[0].count;
}
