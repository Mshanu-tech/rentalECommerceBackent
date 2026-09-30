import pool from '../config/database.js';

export async function createOtp({ userId, otpHash, purpose, expiresAt }) {
  const [result] = await pool.query(
    `INSERT INTO otp_verifications (user_id, otp_hash, purpose, expires_at)
     VALUES (:userId, :otpHash, :purpose, :expiresAt)`,
    { userId, otpHash, purpose, expiresAt }
  );
  return result.insertId;
}

/** Most recent unconsumed OTP for this user + purpose, regardless of expiry. */
export async function findLatestActiveOtp({ userId, purpose }) {
  const [rows] = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE user_id = :userId AND purpose = :purpose AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    { userId, purpose }
  );
  return rows[0] || null;
}

export async function incrementAttempts(id) {
  await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = :id', { id });
}

export async function consumeOtp(id) {
  await pool.query('UPDATE otp_verifications SET consumed_at = NOW() WHERE id = :id', { id });
}
