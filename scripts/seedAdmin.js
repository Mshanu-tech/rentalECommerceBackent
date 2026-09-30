import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import pool from '../config/database.js';
import * as userModel from '../models/userModel.js';

/**
 * Creates (or promotes) the initial admin account from
 * ADMIN_EMAIL / ADMIN_PASSWORD in .env. Safe to re-run — it won't
 * overwrite an existing verified admin.
 *
 * Usage: npm run seed   (from server/)
 */
async function main() {
  const { email, password } = env.admin;

  if (!email || !password) {
    console.error('❌ Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env before seeding.');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const existing = await userModel.findByEmail(email);

  if (existing) {
    if (existing.role === 'admin' && existing.is_verified) {
      console.log(`ℹ️  Admin account already exists for ${email}. Nothing to do.`);
      return;
    }
    const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
    await pool.query(
      `UPDATE users SET password = :password, role = 'admin', is_verified = 1 WHERE id = :id`,
      { id: existing.id, password: passwordHash }
    );
    console.log(`✅ Promoted existing user ${email} to a verified admin.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const admin = await userModel.createUser({
    name: 'Admin',
    email,
    passwordHash,
    role: 'admin',
  });
  await pool.query('UPDATE users SET is_verified = 1 WHERE id = :id', { id: admin.id });
  console.log(`✅ Admin account created for ${email}.`);
}

main()
  .catch((err) => {
    console.error('❌ Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
