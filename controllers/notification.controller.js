import { sendSuccess } from '../utils/apiResponse.js';
import * as notificationService from '../services/notificationService.js';

export async function list(req, res, next) {
  try {
    const { unread, page, limit } = req.query;
    const data = await notificationService.listNotifications(req.user.id, {
      unreadOnly: unread === '1' || unread === 'true',
      page,
      limit,
    });
    return sendSuccess(res, { message: 'Notifications fetched.', data });
  } catch (err) {
    next(err);
  }
}

export async function unreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    return sendSuccess(res, { message: 'Unread count fetched.', data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    await notificationService.markRead(Number(req.params.id), req.user.id);
    return sendSuccess(res, { message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await notificationService.markAllRead(req.user.id);
    return sendSuccess(res, { message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}
