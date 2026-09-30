import { Router } from 'express';
import { body } from 'express-validator';
import * as messageController from '../controllers/message.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(protect);

const bodyValidator = [
  body('body').trim().isLength({ min: 1, max: 1000 }).withMessage('Messages must be 1–1000 characters.'),
];

// --- Customer: their own conversation with the shop -------------------------
router.get('/me', authorize('customer'), messageController.myThread);
router.post('/me', authorize('customer'), bodyValidator, validate, messageController.sendMine);

// --- Admin: every conversation ---------------------------------------------
const admin = Router();
admin.use(authorize('admin'));
admin.get('/conversations', messageController.conversations);
admin.get('/customers', messageController.customers);
admin.get('/unread-count', messageController.adminUnreadCount);
admin.get('/conversations/:customerId', messageController.adminThread);
admin.post('/conversations/:customerId', bodyValidator, validate, messageController.sendFromAdmin);
router.use('/admin', admin);

export default router;
