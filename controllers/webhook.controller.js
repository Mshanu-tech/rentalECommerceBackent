import * as razorpayService from '../services/razorpayService.js';
import * as orderService from '../services/orderService.js';

/**
 * Razorpay calls this independently of the customer's browser, so a closed tab or dropped
 * connection right after a successful payment still results in a fulfilled order — the
 * client's own POST /api/orders/razorpay/verify call is the fast path, this is the safety net.
 *
 * Mounted with express.raw() (see server.js) rather than the app-wide express.json(), because
 * the signature is computed over the exact raw request bytes — parsing and re-serializing the
 * body first would change those bytes and break verification.
 */
export async function handleRazorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer — see the express.raw() mount in server.js

  if (!Buffer.isBuffer(rawBody) || !razorpayService.verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));

    // Every other event (order.paid, payment.authorized, refund.*, ...) is either redundant
    // with this one for our purposes or doesn't need any action taken here.
    if (payload.event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        await orderService.fulfillFromWebhook({
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
        });
      }
    }
  } catch (err) {
    // Logged, not thrown: Razorpay retries a non-2xx response on a schedule, which is useful
    // for a transient DB error but not for a bug on our side — and either way, the client's
    // own verify call remains the primary path, so a webhook hiccup here isn't order-critical.
    console.error('Razorpay webhook processing error:', err);
  }

  return res.status(200).json({ received: true });
}
