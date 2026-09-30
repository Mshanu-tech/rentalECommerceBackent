import { sendSuccess } from '../utils/apiResponse.js';
import * as reviewService from '../services/reviewService.js';

export async function listForProduct(req, res, next) {
  try {
    const { page, limit } = req.query;
    const data = await reviewService.getProductReviews(Number(req.params.id), { page, limit }, req.user || null);
    return sendSuccess(res, { message: 'Reviews fetched.', data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { rating, title, comment } = req.body;
    const review = await reviewService.createReview(
      req.user.id,
      Number(req.params.id),
      { rating, title, comment },
      req.user.name,
      req.user.role
    );
    return sendSuccess(res, { message: 'Thanks for your review!', data: { review }, statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateMine(req, res, next) {
  try {
    const { rating, title, comment } = req.body;
    const review = await reviewService.updateOwnReview(req.user.id, Number(req.params.id), { rating, title, comment });
    return sendSuccess(res, { message: 'Review updated.', data: { review } });
  } catch (err) {
    next(err);
  }
}

export async function removeMine(req, res, next) {
  try {
    await reviewService.deleteOwnReview(req.user.id, Number(req.params.id));
    return sendSuccess(res, { message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
}

// --- Admin ---------------------------------------------------------------------

export async function listAdmin(req, res, next) {
  try {
    const data = await reviewService.listReviewsAdmin(req.query);
    return sendSuccess(res, { message: 'Reviews fetched.', data });
  } catch (err) {
    next(err);
  }
}

export async function setVisibility(req, res, next) {
  try {
    await reviewService.setReviewHidden(Number(req.params.id), req.body.isHidden);
    return sendSuccess(res, { message: req.body.isHidden ? 'Review hidden.' : 'Review is visible again.' });
  } catch (err) {
    next(err);
  }
}

export async function removeAdmin(req, res, next) {
  try {
    await reviewService.deleteReviewAdmin(Number(req.params.id));
    return sendSuccess(res, { message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
}
