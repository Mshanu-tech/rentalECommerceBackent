import pool from '../config/database.js';

export async function findAllByUser(userId) {
  const [rows] = await pool.query(
    `SELECT * FROM user_addresses
     WHERE user_id = :userId
     ORDER BY is_default DESC, created_at DESC`,
    { userId }
  );
  return rows;
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM user_addresses WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

export async function create({
  userId,
  fullName,
  phone,
  line1,
  line2,
  city,
  state,
  postalCode,
  country,
  isDefault,
}) {
  const [result] = await pool.query(
    `INSERT INTO user_addresses
       (user_id, full_name, phone, line1, line2, city, state, postal_code, country, is_default)
     VALUES
       (:userId, :fullName, :phone, :line1, :line2, :city, :state, :postalCode, :country, :isDefault)`,
    { userId, fullName, phone, line1, line2: line2 || null, city, state, postalCode, country, isDefault }
  );
  return findById(result.insertId);
}

export async function update(
  id,
  { fullName, phone, line1, line2, city, state, postalCode, country }
) {
  await pool.query(
    `UPDATE user_addresses
     SET full_name = :fullName, phone = :phone, line1 = :line1, line2 = :line2,
         city = :city, state = :state, postal_code = :postalCode, country = :country
     WHERE id = :id`,
    { id, fullName, phone, line1, line2: line2 || null, city, state, postalCode, country }
  );
  return findById(id);
}

export async function remove(id) {
  await pool.query('DELETE FROM user_addresses WHERE id = :id', { id });
}

/** Clears is_default on every one of the user's addresses (call before setting a new one). */
export async function clearDefault(userId) {
  await pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = :userId', { userId });
}

export async function setDefault(id) {
  await pool.query('UPDATE user_addresses SET is_default = 1 WHERE id = :id', { id });
}

export async function countByUser(userId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM user_addresses WHERE user_id = :userId',
    { userId }
  );
  return rows[0].count;
}
