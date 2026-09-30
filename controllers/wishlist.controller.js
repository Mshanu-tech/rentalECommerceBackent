import { sendSuccess } from '../utils/apiResponse.js';
import * as wishlistService from '../services/wishlistService.js';

export async function list(req, res, next) {
  try {
    const items = await wishlistService.getWishlist(req.user.id);
    return sendSuccess(res, { message: 'Wishlist fetched.', data: { items } });
  } catch (err) {
    next(err);
  }
}

export async function addItem(req, res, next) {
  try {
    const items = await wishlistService.addToWishlist(req.user.id, req.body.productId);
    return sendSuccess(res, { statusCode: 201, message: 'Added to wishlist.', data: { items } });
  } catch (err) {
    next(err);
  }
}

export async function removeItem(req, res, next) {
  try {
    const items = await wishlistService.removeFromWishlist(req.user.id, Number(req.params.productId));
    return sendSuccess(res, { message: 'Removed from wishlist.', data: { items } });
  } catch (err) {
    next(err);
  }
}
