import { Router } from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller.js';

const router = Router();

// No `protect` here — Razorpay's servers call this directly, not a logged-in user.
// Authenticity is established by verifying the X-Razorpay-Signature header instead (see the
// controller); the route requires the raw request body for that, which is why it's mounted
// with express.raw() ahead of the app-wide express.json() in server.js.
router.post('/razorpay', handleRazorpayWebhook);

export default router;
