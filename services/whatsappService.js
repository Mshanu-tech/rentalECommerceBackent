import env from '../config/env.js';

function formatMoney(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

function buildOrderMessage(order) {
  const address = order.shippingAddress || {};
  const items = (order.items || []).map(
    (item) => `- ${item.name} x ${item.quantity}: ${formatMoney(item.lineTotal)}`
  );
  const shippingAddress = [
    address.fullName,
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ');
  const adminOrderUrl = `${env.CLIENT_URL.replace(/\/+$/, '')}/admin/orders/${order.id}`;
  const adminLink = `Admin order details: ${adminOrderUrl}`;
  const details = [
    `Order: ${order.orderNumber}`,
    `Customer: ${order.customerName || address.fullName || 'N/A'}`,
    `Phone: ${address.phone || 'N/A'}`,
    'Items:',
    ...items,
    `Subtotal: ${formatMoney(order.subtotal)}`,
    `Shipping: ${formatMoney(order.shippingFee)}`,
    `Total: ${formatMoney(order.total)}`,
    `Payment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod}`,
    `Ship to: ${shippingAddress || 'N/A'}`,
  ].join('\n');

  const maxDetailsLength = 900 - adminLink.length - 2;
  const shortenedDetails = details.length > maxDetailsLength
    ? `${details.slice(0, Math.max(0, maxDetailsLength - 3))}...`
    : details;

  return `${shortenedDetails}\n\n${adminLink}`;
}

export async function sendAdminOrderNotification(order) {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId || !env.whatsapp.adminPhoneNumber) {
    return { delivered: false, reason: 'not_configured' };
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsapp.graphApiVersion}/${env.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: env.whatsapp.adminPhoneNumber,
        type: 'template',
        template: {
          name: env.whatsapp.orderTemplateName,
          language: { code: env.whatsapp.orderTemplateLanguage },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: buildOrderMessage(order) }],
            },
          ],
        },
      }),
    }
  );

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error?.message || `WhatsApp API returned HTTP ${response.status}.`);
  }

  return { delivered: true, messageId: result?.messages?.[0]?.id };
}