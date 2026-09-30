import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { notifyAdmins } from '../services/notificationService.js';
import { attachUserIfPresent } from '../middleware/auth.js';
import { sendFromCustomer } from '../services/messageService.js';

const router = Router();

const contactValidator = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Please enter your name.'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('message').trim().isLength({ min: 10, max: 1000 }).withMessage('Message must be 10–1000 characters.'),
];

// POST /api/contact  { name, email, message } — public. Lands in every admin's notification bell.
router.post('/', authLimiter, attachUserIfPresent, contactValidator, validate, async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    // A signed-in customer's message goes into their conversation, so the admin's reply
    // reaches them in-app. Guests (or anyone claiming an email they haven't logged in as)
    // still land in the admin notification bell only.
    if (req.user?.role === 'customer') {
      await sendFromCustomer(req.user, message);
      return sendSuccess(res, { message: "Thanks! We've received your message. Our reply will appear in your Messages." });
    }

    await notifyAdmins({
      type: 'contact_message',
      title: `Message from ${name}`.slice(0, 150),
      message: `${email}: ${message}`.slice(0, 500),
      link: null,
    });
    console.log(`📩 Contact message from ${name} <${email}>: ${message}`);
    return sendSuccess(res, { message: "Thanks! We've received your message and will get back to you soon." });
  } catch (err) {
    next(err);
  }
});

export default router;
