/**
 * Human-friendly, sortable order number — not used as a DB key (orders.id
 * still is), just what's shown to the customer and printed on invoices.
 * The random suffix makes same-day collisions astronomically unlikely
 * without a DB round-trip; `orders.order_number` still has a UNIQUE
 * constraint as a backstop.
 */
export function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${suffix}`;
}
