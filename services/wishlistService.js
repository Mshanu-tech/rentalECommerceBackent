import { ApiError } from '../middleware/errorHandler.js';
import * as wishlistModel from '../models/wishlistModel.js';
import * as productModel from '../models/productModel.js';
import { getPublicUrl } from './storageService.js';

function toPublicItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.product_name,
    slug: row.product_slug,
    image: getPublicUrl(row.image_path),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price !== null ? Number(row.compare_at_price) : null,
    stockQuantity: Number(row.stock_quantity),
    isActive: Boolean(row.product_is_active),
    addedAt: row.created_at,
  };
}

export async function getWishlist(userId) {
  const rows = await wishlistModel.findAllByUser(userId);
  return rows.map(toPublicItem);
}

export async function getWishlistProductIds(userId) {
  return wishlistModel.findProductIdsByUser(userId);
}

export async function addToWishlist(userId, productId) {
  const product = await productModel.findById(productId);
  if (!product || !product.is_active) {
    throw new ApiError(404, 'Product not found.');
  }
  await wishlistModel.add(userId, productId);
  return getWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  await wishlistModel.remove(userId, productId);
  return getWishlist(userId);
}
