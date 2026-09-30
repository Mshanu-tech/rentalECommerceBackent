import pool from '../config/database.js';

export async function create({ userId, type, title, message, link = null }) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, link)
     VALUES (:userId, :type, :title, :message, :link)`,
    { userId, type, title, message, link }
  );
}

/** Same notification for many users in one statement (e.g. every admin). */
export async function createMany(userIds, { type, title, message, link = null }) {
  if (!userIds.length) return;
  const values = userIds.map((id) => [id, type, title, message, link]);
  await pool.query('INSERT INTO notifications (user_id, type, title, message, link) VALUES ?', [values]);
}

export async function findByUser(userId, { unreadOnly = false, limit = 20, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, type, title, message, link, is_read, created_at
     FROM notifications
     WHERE user_id = :userId ${unreadOnly ? 'AND is_read = 0' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    { userId }
  );
  return rows;
}

export async function countByUser(userId, { unreadOnly = false } = {}) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications
     WHERE user_id = :userId ${unreadOnly ? 'AND is_read = 0' : ''}`,
    { userId }
  );
  return rows[0].count;
}

/** Scoped to the owner so one user can never mark another's notification read. */
export async function markRead(id, userId) {
  const [result] = await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :userId',
    { id, userId }
  );
  return result.affectedRows > 0;
}

export async function markAllRead(userId) {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = :userId AND is_read = 0', { userId });
}
