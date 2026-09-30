import pool from '../config/database.js';

// Columns ever safe to send to the client — password is deliberately excluded.
const PUBLIC_COLUMNS = 'id, name, email, phone, role, is_verified, created_at';

export async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = :email LIMIT 1', {
    email,
  });
  return rows[0] || null;
}

export async function findById(id) {
  const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = :id LIMIT 1`, {
    id,
  });
  return rows[0] || null;
}

export async function createUser({ name, email, passwordHash, phone = null, role = 'customer' }) {
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, phone, role, is_verified)
     VALUES (:name, :email, :password, :phone, :role, 0)`,
    { name, email, password: passwordHash, phone, role }
  );
  return findById(result.insertId);
}

/**
 * Re-registration of an email that signed up but never verified: refresh
 * the pending user's details rather than failing on the UNIQUE(email).
 */
export async function updateUnverifiedUser(id, { name, passwordHash, phone = null }) {
  await pool.query(
    `UPDATE users SET name = :name, password = :password, phone = :phone WHERE id = :id`,
    { id, name, password: passwordHash, phone }
  );
  return findById(id);
}

export async function markVerified(id) {
  await pool.query('UPDATE users SET is_verified = 1 WHERE id = :id', { id });
}

/** Every admin account — recipients of admin-facing notifications (new order, low stock, new review). */
export async function findAdmins() {
  const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE role = 'admin' AND is_verified = 1`);
  return rows;
}

export async function updatePassword(id, passwordHash) {
  await pool.query('UPDATE users SET password = :password WHERE id = :id', { id, password: passwordHash });
}
