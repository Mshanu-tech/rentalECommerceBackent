import { ApiError } from '../middleware/errorHandler.js';
import * as reviewModel from '../models/reviewModel.js';
import * as productModel from '../models/productModel.js';
import { notifyAdmins } from './notificationService.js';

/** "Priya Sharma" -> "Priya S." — reviews are public, so customers' full names aren't shown. */
function publicName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function toPublicReview(row, viewerId = null) {
  const isMine = viewerId !== null && row.user_id === viewerId;
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    userName: publicName(row.user_name),
    createdAt: row.created_at,
    verifiedPurchase: Boolean(row.verified_purchase),
    isMine,
  };
}

function toOwnReview(row) {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    isHidden: Boolean(row.is_hidden),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildSummary(rows) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const row of rows) {
    distribution[row.rating] = Number(row.count);
    count += Number(row.count);
    sum += row.rating * Number(row.count);
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count, distribution };
}

async function getReviewableProduct(productId, { allowInactive = false } = {}) {
  const product = await productModel.findById(productId);
  if (!product || (!product.is_active && !allowInactive)) throw new ApiError(404, 'Product not found.');
  return product;
}

/**
 * Public review list + rating summary for a product page. When the viewer is signed in it
 * also says whether *they* may review (delivered purchase and no review yet) and returns
 * their own review, so the page can show the right form without extra round trips.
 */
export async function getProductReviews(productId, { page = 1, limit = 10 } = {}, viewer = null) {
  await getReviewableProduct(productId, { allowInactive: viewer?.role === 'admin' });

  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));

  const [rows, summaryRows] = await Promise.all([
    reviewModel.findVisibleByProduct(productId, { limit: safeLimit, offset: (safePage - 1) * safeLimit }),
    reviewModel.getSummary(productId),
  ]);
  const summary = buildSummary(summaryRows);

  const result = {
    summary,
    reviews: rows.map((r) => toPublicReview(r, viewer?.id ?? null)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: summary.count,
      totalPages: Math.max(1, Math.ceil(summary.count / safeLimit)),
    },
    me: null,
  };

  if (viewer) {
    const [mine, purchased] = await Promise.all([
      reviewModel.findByUserAndProduct(viewer.id, productId),
      reviewModel.hasDeliveredPurchase(viewer.id, productId),
    ]);
    result.me = {
      canReview: viewer.role !== 'admin' && !mine,
      hasPurchased: purchased,
      review: mine ? toOwnReview(mine) : null,
    };
  }
  return result;
}

export async function createReview(userId, productId, { rating, title, comment }, userName = 'A customer', role = 'customer') {
  if (role === 'admin') throw new ApiError(403, 'Admin accounts cannot review products.');
  const product = await getReviewableProduct(productId);

  if (await reviewModel.findByUserAndProduct(userId, productId)) {
    throw new ApiError(409, 'You have already reviewed this product. You can edit your review instead.');
  }

  let id;
  try {
    id = await reviewModel.create({ productId, userId, rating, title: title || null, comment: comment || null });
  } catch (err) {
    // Two simultaneous submissions both pass the check above; the UNIQUE key catches the second.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'You have already reviewed this product. You can edit your review instead.');
    }
    throw err;
  }

  void notifyAdmins({
    type: 'new_review',
    title: 'New review',
    message: `${publicName(userName)} gave ${product.name} ${rating}★.`,
    link: '/admin/reviews',
  });

  return toOwnReview(await reviewModel.findById(id));
}

export async function updateOwnReview(userId, productId, { rating, title, comment }) {
  const existing = await reviewModel.findByUserAndProduct(userId, productId);
  if (!existing) throw new ApiError(404, "You haven't reviewed this product yet.");
  await reviewModel.update(existing.id, { rating, title: title || null, comment: comment || null });
  return toOwnReview(await reviewModel.findById(existing.id));
}

export async function deleteOwnReview(userId, productId) {
  const existing = await reviewModel.findByUserAndProduct(userId, productId);
  if (!existing) throw new ApiError(404, "You haven't reviewed this product yet.");
  await reviewModel.remove(existing.id);
}

// --- Admin moderation ---------------------------------------------------------

export async function listReviewsAdmin({ hidden, rating, search, page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  const filters = {
    hidden: hidden === 'true' ? true : hidden === 'false' ? false : null,
    rating: Number(rating) >= 1 && Number(rating) <= 5 ? Number(rating) : null,
    search: search || null,
  };

  const [rows, total] = await Promise.all([
    reviewModel.findAllAdmin({ ...filters, limit: safeLimit, offset: (safePage - 1) * safeLimit }),
    reviewModel.countAdmin(filters),
  ]);

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      userName: r.user_name,
      userEmail: r.user_email,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      isHidden: Boolean(r.is_hidden),
      createdAt: r.created_at,
    })),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
}

export async function setReviewHidden(id, isHidden) {
  if (!(await reviewModel.findById(id))) throw new ApiError(404, 'Review not found.');
  await reviewModel.setHidden(id, isHidden);
}

export async function deleteReviewAdmin(id) {
  if (!(await reviewModel.findById(id))) throw new ApiError(404, 'Review not found.');
  await reviewModel.remove(id);
}
