import crypto from 'crypto';
import Razorpay from 'razorpay';
import env from '../config/env.js';

let client = null;

function getClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
}

/** Constant-time hex comparison — a plain `===` on signatures would leak timing info byte by byte. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** amount is in rupees; Razorpay's API wants the smallest currency unit (paise). */
export async function createOrder({ amount, receipt, notes }) {
  return getClient().orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt,
    notes,
  });
}

/**
 * Verifies the signature Razorpay's Checkout.js hands back after a successful payment.
 * This is the step that actually proves the payment happened — order_id, payment_id and
 * amount in the browser's success callback are just data the page could fabricate; only a
 * signature produced with our key_secret proves Razorpay itself generated it. Formula per
 * Razorpay's docs: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 */
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return safeEqualHex(expected, razorpaySignature);
}

/** Verifies the X-Razorpay-Signature header on an incoming webhook against the *raw* request body. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

/** amount is in rupees. Used when a payment was captured but we can't fulfill the order (e.g. stock ran out). */
export async function refundPayment(paymentId, amount) {
  return getClient().payments.refund(paymentId, { amount: Math.round(amount * 100) });
}
