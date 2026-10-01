import mysql from 'mysql2/promise';
import env from './env.js';

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,

  ssl: env.db.sslCa
    ? {
        ca: env.db.sslCa,
        rejectUnauthorized: true,
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true,
});

export async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    return { connected: true };
  } catch (error) {
    console.error('❌ DATABASE CONNECTION ERROR:', error);

    return {
      connected: false,
      error: error.message || String(error) || 'Unknown database error',
      code: error.code || null,
      errno: error.errno || null,
    };
  }
}
export default pool;