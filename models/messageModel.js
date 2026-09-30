import pool from '../config/database.js';

/** Adds one message to a customer's thread and returns it. */
export async function create({ customerId, senderRole, senderId, body }) {
  const [result] = await pool.query(
    `INSERT INTO messages (customer_id, sender_role, sender_id, body)
     VALUES (:customerId, :senderRole, :senderId, :body)`,
    { customerId, senderRole, senderId, body }
  );
  const [rows] = await pool.query('SELECT * FROM messages WHERE id = :id', { id: result.insertId });
  return rows[0];
}

/** The most recent `limit` messages of a thread, oldest first. */
export async function findThread(customerId, { limit = 200 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT id, sender_role, body, is_read, created_at
       FROM messages WHERE customer_id = :customerId
       ORDER BY id DESC LIMIT ${Number(limit)}
     ) recent ORDER BY id ASC`,
    { customerId }
  );
  return rows;
}

/** Marks everything `senderRole` wrote in this thread as read (i.e. the other side opened it). */
export async function markThreadRead(customerId, senderRole) {
  await pool.query(
    'UPDATE messages SET is_read = 1 WHERE customer_id = :customerId AND sender_role = :senderRole AND is_read = 0',
    { customerId, senderRole }
  );
}

export async function countUnreadForAdmin() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM messages WHERE sender_role = 'customer' AND is_read = 0"
  );
  return rows[0].count;
}

export async function countUnreadForCustomer(customerId) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS count FROM messages WHERE customer_id = :customerId AND sender_role = 'admin' AND is_read = 0",
    { customerId }
  );
  return rows[0].count;
}

/** One row per customer who has a thread: who they are, the latest message, and unread count. */
export async function listConversations({ search = '', limit = 100 } = {}) {
  const like = `%${search}%`;
  const [rows] = await pool.query(
    `SELECT u.id AS customer_id, u.name, u.email,
            m.body AS last_body, m.sender_role AS last_sender, m.created_at AS last_at,
            (SELECT COUNT(*) FROM messages x
              WHERE x.customer_id = u.id AND x.sender_role = 'customer' AND x.is_read = 0) AS unread
     FROM users u
     JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE customer_id = u.id)
     WHERE u.role = 'customer' ${search ? 'AND (u.name LIKE :like OR u.email LIKE :like)' : ''}
     ORDER BY m.id DESC
     LIMIT ${Number(limit)}`,
    { like }
  );
  return rows;
}

/** Verified customers to start a brand-new conversation with. */
export async function searchCustomers(search = '', limit = 8) {
  const like = `%${search}%`;
  const [rows] = await pool.query(
    `SELECT id, name, email FROM users
     WHERE role = 'customer' AND is_verified = 1 ${search ? 'AND (name LIKE :like OR email LIKE :like)' : ''}
     ORDER BY name ASC
     LIMIT ${Number(limit)}`,
    { like }
  );
  return rows;
}
