import mysql from 'mysql2/promise';
import env from './env.js';

// A pooled connection is reused across requests instead of opening a new
// MySQL connection per query — this is what keeps the API fast under load
// and is exactly the same pattern that will run unchanged on MilesWeb.
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true,
});

/**
 * Quick connectivity check used by the /api/health route and on server boot.
 * Never throws — callers decide how to react to a failed connection.
 */
export async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return { connected: true };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

export default pool;
