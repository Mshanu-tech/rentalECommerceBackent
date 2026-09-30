import nodemailer from 'nodemailer';
import env from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      // Nodemailer's key is `pass`, not `password` — passing the wrong name silently sends
      // no credentials, so authenticated SMTP providers reject every message.
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

/** Escapes text interpolated into email HTML (names, notes, tracking numbers, product names). */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

/**
 * Single delivery path for every email. With SMTP configured it sends for real; without it
 * (local development) it logs a short preview to the console so the flows can be exercised
 * without a mail account — same behaviour Phase 2 introduced for OTP emails.
 */
async function deliver({ to, subject, text, html, label }) {
  const client = getTransporter();

  if (!client) {
    // In production a missing SMTP config must fail loudly: silently "sending" an OTP to the
    // console would leave every customer stuck at the verification step.
    if (env.NODE_ENV === 'production') {
      throw new Error('Email is not configured on the server (SMTP_HOST is empty).');
    }
    console.log(`✉️  [DEV] ${label} email to ${to} — "${subject}"\n${text.split('\n').map((l) => `    ${l}`).join('\n')}`);
    return { delivered: false, mode: 'console' };
  }

  await client.sendMail({ from: env.smtp.from || env.smtp.user, to, subject, text, html });
  return { delivered: true, mode: 'smtp' };
}

/** Shared wrapper so every email looks like it came from the same shop. */
function layout(bodyHtml) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <p style="font-size:18px;font-weight:700;margin:0 0 16px">ShopEase</p>
      ${bodyHtml}
      <p style="color:#9ca3af;font-size:12px;margin-top:32px">
        You're receiving this because you have an account at ShopEase.
      </p>
    </div>`;
}

function button(href, label) {
  return `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">${escapeHtml(label)}</a></p>`;
}

// --- OTP ------------------------------------------------------------------

const PURPOSE_COPY = {
  registration: 'verify your email',
  login: 'sign in',
  password_reset: 'reset your password',
};

export async function sendOtpEmail({ to, name, otp, purpose = 'registration' }) {
  const action = PURPOSE_COPY[purpose] || 'continue';
  const text =
    `Hi ${name},\n\n` +
    `Use this code to ${action}: ${otp}\n\n` +
    `It expires in ${env.otp.expiryMinutes} minutes. Never share this code with anyone. ` +
    `If you didn't request it, you can ignore this email.`;
  const html = layout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Use this code to ${action}:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 0;text-align:center;margin:16px 0">${escapeHtml(otp)}</p>
    <p style="color:#6b7280;font-size:13px">
      Expires in ${env.otp.expiryMinutes} minutes. Never share this code with anyone.
      If you didn't request it, you can ignore this email.
    </p>`);

  return deliver({ to, subject: `Your ShopEase code: ${otp}`, text, html, label: `OTP (${purpose})` });
}

// --- Welcome --------------------------------------------------------------

export async function sendWelcomeEmail({ to, name }) {
  const text = `Hi ${name},\n\nWelcome to ShopEase — your email is verified and your account is ready.\n\nStart shopping: ${env.CLIENT_URL}/products`;
  const html = layout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Welcome to ShopEase — your email is verified and your account is ready.</p>
    ${button(`${env.CLIENT_URL}/products`, 'Start shopping')}`);
  return deliver({ to, subject: 'Welcome to ShopEase', text, html, label: 'Welcome' });
}

// --- Orders ---------------------------------------------------------------

function itemLinesText(order) {
  return order.items.map((i) => `  • ${i.name} × ${i.quantity} — ${formatMoney(i.lineTotal)}`).join('\n');
}

function itemRowsHtml(order) {
  return order.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.name)} × ${i.quantity}</td>` +
        `<td style="padding:6px 0;text-align:right">${formatMoney(i.lineTotal)}</td></tr>`
    )
    .join('');
}

export async function sendOrderConfirmationEmail({ to, name, order }) {
  const paid = order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid';
  const paymentLine = paid ? 'Paid online' : 'Cash on Delivery — pay when it arrives';
  const link = `${env.CLIENT_URL}/orders/${order.id}`;
  const a = order.shippingAddress || {};

  const text =
    `Hi ${name},\n\nThanks for your order! We've received it and will let you know as it moves along.\n\n` +
    `Order ${order.orderNumber}\n${itemLinesText(order)}\n\n` +
    `Subtotal: ${formatMoney(order.subtotal)}\nShipping: ${formatMoney(order.shippingFee)}\nTotal: ${formatMoney(order.total)}\n` +
    `Payment: ${paymentLine}\n\n` +
    `Shipping to: ${[a.fullName, a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(', ')}\n\n` +
    `View your order: ${link}`;

  const html = layout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for your order! We've received it and will let you know as it moves along.</p>
    <p style="font-weight:600;margin-bottom:4px">Order ${escapeHtml(order.orderNumber)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemRowsHtml(order)}
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb;color:#6b7280">Subtotal</td><td style="padding:6px 0;border-top:1px solid #e5e7eb;text-align:right">${formatMoney(order.subtotal)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Shipping</td><td style="padding:6px 0;text-align:right">${formatMoney(order.shippingFee)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Total</td><td style="padding:6px 0;text-align:right;font-weight:600">${formatMoney(order.total)}</td></tr>
    </table>
    <p style="font-size:14px;color:#374151">Payment: ${escapeHtml(paymentLine)}</p>
    <p style="font-size:14px;color:#374151">Shipping to: ${escapeHtml([a.fullName, a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(', '))}</p>
    ${button(link, 'View your order')}`);

  return deliver({ to, subject: `Order confirmed — ${order.orderNumber}`, text, html, label: 'Order confirmation' });
}

const STATUS_COPY = {
  processing: { subject: 'is being prepared', line: "We're getting your order ready." },
  shipped: { subject: 'has shipped', line: 'Your order is on its way.' },
  delivered: { subject: 'was delivered', line: 'Your order has been delivered. We hope you love it!' },
  cancelled: { subject: 'was cancelled', line: 'Your order has been cancelled.' },
};

/**
 * `note` is the admin's optional message for this update (or the cancellation reason);
 * tracking number/carrier come from the order itself so a "shipped" email always carries them.
 */
export async function sendOrderStatusEmail({ to, name, order, note }) {
  const copy = STATUS_COPY[order.status];
  if (!copy) return { delivered: false, mode: 'skipped' };

  const link = `${env.CLIENT_URL}/orders/${order.id}`;
  const tracking =
    order.status === 'shipped' && order.trackingNumber
      ? `Tracking: ${order.trackingNumber}${order.carrier ? ` (${order.carrier})` : ''}`
      : null;
  const refund =
    order.status === 'cancelled' && order.paymentMethod === 'razorpay' && order.paymentStatus !== 'pending'
      ? 'Because you paid online, your payment will be refunded to your original payment method.'
      : null;
  const review = order.status === 'delivered' ? 'Enjoying your purchase? You can now leave a review on each product page.' : null;

  const text = [
    `Hi ${name},`,
    '',
    `Your order ${order.orderNumber} ${copy.subject}. ${copy.line}`,
    note ? `Note: ${note}` : null,
    tracking,
    refund,
    review,
    '',
    `View your order: ${link}`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const html = layout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> ${copy.subject}. ${copy.line}</p>
    ${note ? `<p style="font-size:14px;color:#374151">Note: ${escapeHtml(note)}</p>` : ''}
    ${tracking ? `<p style="font-size:14px;color:#374151">${escapeHtml(tracking)}</p>` : ''}
    ${refund ? `<p style="font-size:14px;color:#374151">${escapeHtml(refund)}</p>` : ''}
    ${review ? `<p style="font-size:14px;color:#374151">${escapeHtml(review)}</p>` : ''}
    ${button(link, 'View your order')}`);

  return deliver({
    to,
    subject: `Your order ${order.orderNumber} ${copy.subject}`,
    text,
    html,
    label: `Order ${order.status}`,
  });
}
