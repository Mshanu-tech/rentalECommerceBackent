import { ApiError } from '../middleware/errorHandler.js';
import * as cartModel from '../models/cartModel.js';
import * as productModel from '../models/productModel.js';
import { getPublicUrl } from './storageService.js';

function toPublicItem(row) {
  const price = Number(row.price);
  const stock = Number(row.stock_quantity);
  const quantity = Number(row.quantity);
  return {
    id: row.id,
    productId: row.product_id,
    name: row.product_name,
    slug: row.product_slug,
    image: getPublicUrl(row.image_path),
    price,
    compareAtPrice: row.compare_at_price !== null ? Number(row.compare_at_price) : null,
    quantity,
    lineTotal: Number((price * quantity).toFixed(2)),
    stockQuantity: stock,
    isActive: Boolean(row.product_is_active),
    // Set when the product went inactive or its stock dropped below what's in
    // the cart since it was added — the client shows this instead of silently
    // charging for something that can no longer be fulfilled as-is.
    unavailable: !row.product_is_active || stock <= 0,
    exceedsStock: stock > 0 && quantity > stock,
  };
}

function summarize(items) {
  const validItems = items.filter((i) => !i.unavailable && !i.exceedsStock);
  const subtotal = validItems.reduce((sum, i) => sum + i.lineTotal, 0);
  return {
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: Number(subtotal.toFixed(2)),
    hasIssues: items.some((i) => i.unavailable || i.exceedsStock),
  };
}

export async function getCart(userId) {
  const rows = await cartModel.findAllByUser(userId);
  return summarize(rows.map(toPublicItem));
}

async function assertPurchasable(productId, requestedQuantity) {
  const product = await productModel.findById(productId);
  if (!product || !product.is_active) {
    throw new ApiError(404, 'This product is no longer available.');
  }
  if (Number(product.stock_quantity) <= 0) {
    throw new ApiError(422, 'This product is out of stock.');
  }
  if (requestedQuantity > Number(product.stock_quantity)) {
    throw new ApiError(422, `Only ${product.stock_quantity} left in stock.`);
  }
  return product;
}

export async function addItem(userId, productId, quantity = 1) {
  if (quantity < 1) throw new ApiError(422, 'Quantity must be at least 1.');

  const existing = await cartModel.findItem(userId, productId);
  const nextQuantity = (existing?.quantity || 0) + quantity;

  await assertPurchasable(productId, nextQuantity);
  await cartModel.upsert(userId, productId, nextQuantity);
  return getCart(userId);
}

export async function updateItemQuantity(userId, productId, quantity) {
  if (quantity < 1) throw new ApiError(422, 'Quantity must be at least 1.');

  const existing = await cartModel.findItem(userId, productId);
  if (!existing) throw new ApiError(404, 'That item is not in your cart.');

  await assertPurchasable(productId, quantity);
  await cartModel.upsert(userId, productId, quantity);
  return getCart(userId);
}

export async function removeItem(userId, productId) {
  await cartModel.remove(userId, productId);
  return getCart(userId);
}

export async function clearCart(userId) {
  await cartModel.clear(userId);
  return getCart(userId);
}
