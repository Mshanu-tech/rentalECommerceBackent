import * as userModel from '../models/userModel.js';
import * as productModel from '../models/productModel.js';
import * as emailService from './emailService.js';
import * as whatsappService from './whatsappService.js';
import { notifyUser, notifyAdmins } from './notificationService.js';

/**
 * Everything that should happen *because* an order event occurred — the customer's email,
 * the customer's in-app notification, and the admins' in-app notifications — lives here, so
 * orderService only has to make one call per event. Every function is fire-and-forget safe:
 * nothing here throws, since the order itself has already been committed by the time it runs
 * and a mail-server hiccup must never turn a successful order into an error response.
 */

async function safeEmail(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`Could not send ${label} email:`, err.message);
  }
}

async function safeWhatsAppOrder(order) {
  try {
    await whatsappService.sendAdminOrderNotification(order);
  } catch (err) {
    console.error('Could not send admin WhatsApp order notification:', err.message);
  }
}

/** New order (COD checkout, or online payment confirmed). `order` is the public order shape. */
export async function orderPlaced(order, userId) {
  try {
    const user = await userModel.findById(userId);

    await notifyUser(userId, {
      type: 'order_placed',
      title: 'Order placed',
      message: `We've received your order ${order.orderNumber}.`,
      link: `/orders/${order.id}`,
    });
    await notifyAdmins({
      type: 'new_order',
      title: 'New order',
      message: `${order.orderNumber} — ₹${order.total.toFixed(2)} from ${user?.name || 'a customer'}.`,
      link: `/admin/orders/${order.id}`,
    });

    await safeWhatsAppOrder(order);

    if (user) {
      await safeEmail('order confirmation', () =>
        emailService.sendOrderConfirmationEmail({ to: user.email, name: user.name, order })
      );
    }

    await checkLowStock(order.items);
  } catch (err) {
    console.error('orderPlaced notifications failed:', err.message);
  }
}

const STATUS_NOTIFICATION = {
  processing: 'is being prepared',
  shipped: 'has shipped',
  delivered: 'was delivered',
  cancelled: 'was cancelled',
};

/**
 * Order moved to a new status (admin update or customer cancel). `cancelledByCustomer`
 * also alerts the admins, since nobody on the shop side triggered that change.
 */
export async function orderStatusChanged(order, userId, { note = null, cancelledByCustomer = false } = {}) {
  try {
    const phrase = STATUS_NOTIFICATION[order.status];
    if (!phrase) return; // 'pending' is only ever the initial state

    const user = await userModel.findById(userId);

    await notifyUser(userId, {
      type: 'order_status',
      title: `Order ${order.status}`,
      message: `Your order ${order.orderNumber} ${phrase}.`,
      link: `/orders/${order.id}`,
    });

    if (cancelledByCustomer) {
      await notifyAdmins({
        type: 'order_cancelled',
        title: 'Order cancelled by customer',
        message: `${order.orderNumber} was cancelled by ${user?.name || 'the customer'}.`,
        link: `/admin/orders/${order.id}`,
      });
    }

    if (user) {
      await safeEmail(`order ${order.status}`, () =>
        emailService.sendOrderStatusEmail({ to: user.email, name: user.name, order, note })
      );
    }
  } catch (err) {
    console.error('orderStatusChanged notifications failed:', err.message);
  }
}

/**
 * Alerts admins when an order's purchase is what pushed a product down to (or past) its
 * low-stock threshold. Only fires on the *crossing* — stock before the order was above the
 * threshold, stock after is at or below it — so a product already sitting low doesn't
 * re-alert on every subsequent sale.
 */
async function checkLowStock(items) {
  for (const item of items) {
    if (!item.productId) continue;
    const product = await productModel.findById(item.productId);
    if (!product) continue;

    const after = Number(product.stock_quantity);
    const before = after + Number(item.quantity);
    const threshold = Number(product.low_stock_threshold);

    if (before > threshold && after <= threshold) {
      await notifyAdmins({
        type: 'low_stock',
        title: after === 0 ? 'Out of stock' : 'Low stock',
        message: after === 0 ? `${product.name} just sold out.` : `${product.name} is down to ${after} (threshold ${threshold}).`,
        link: `/admin/products/${product.id}/stock`,
      });
    }
  }
}
