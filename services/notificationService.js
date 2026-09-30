import * as notificationModel from '../models/notificationModel.js';
import * as userModel from '../models/userModel.js';
import { ApiError } from '../middleware/errorHandler.js';

function toPublicNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

export async function listNotifications(userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));

  const [rows, total, unreadCount] = await Promise.all([
    notificationModel.findByUser(userId, { unreadOnly, limit: safeLimit, offset: (safePage - 1) * safeLimit }),
    notificationModel.countByUser(userId, { unreadOnly }),
    notificationModel.countByUser(userId, { unreadOnly: true }),
  ]);

  return {
    notifications: rows.map(toPublicNotification),
    unreadCount,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
}

export async function getUnreadCount(userId) {
  return notificationModel.countByUser(userId, { unreadOnly: true });
}

export async function markRead(id, userId) {
  const ok = await notificationModel.markRead(id, userId);
  if (!ok) throw new ApiError(404, 'Notification not found.');
}

export async function markAllRead(userId) {
  await notificationModel.markAllRead(userId);
}

// --- Creating notifications (called from other services) -----------------
// These never throw: a failed notification must not fail the checkout, status change or
// review that triggered it, so errors are logged and swallowed.

export async function notifyUser(userId, payload) {
  try {
    await notificationModel.create({ userId, ...payload });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

export async function notifyAdmins(payload) {
  try {
    const admins = await userModel.findAdmins();
    await notificationModel.createMany(admins.map((a) => a.id), payload);
  } catch (err) {
    console.error('Failed to notify admins:', err.message);
  }
}
