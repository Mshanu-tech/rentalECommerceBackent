import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Every route is the signed-in user's own notifications (customers and admins alike).
router.use(protect);

// GET /api/notifications?unread=1&page=&limit=
router.get('/', notificationController.list);

// GET /api/notifications/unread-count — cheap endpoint the header bell polls
router.get('/unread-count', notificationController.unreadCount);

// PATCH /api/notifications/read-all
router.patch('/read-all', notificationController.markAllRead);

// PATCH /api/notifications/:id/read
router.patch('/:id/read', notificationController.markRead);

export default router;
