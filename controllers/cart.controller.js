import { sendSuccess } from '../utils/apiResponse.js';
import * as cartService from '../services/cartService.js';

export async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCart(req.user.id);
    return sendSuccess(res, { message: 'Cart fetched.', data: { cart } });
  } catch (err) {
    next(err);
  }
}

export async function addItem(req, res, next) {
  try {
    const cart = await cartService.addItem(req.user.id, req.body.productId, req.body.quantity || 1);
    return sendSuccess(res, { statusCode: 201, message: 'Added to cart.', data: { cart } });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req, res, next) {
  try {
    const cart = await cartService.updateItemQuantity(
      req.user.id,
      Number(req.params.productId),
      req.body.quantity
    );
    return sendSuccess(res, { message: 'Cart updated.', data: { cart } });
  } catch (err) {
    next(err);
  }
}

export async function removeItem(req, res, next) {
  try {
    const cart = await cartService.removeItem(req.user.id, Number(req.params.productId));
    return sendSuccess(res, { message: 'Item removed.', data: { cart } });
  } catch (err) {
    next(err);
  }
}

export async function clearCart(req, res, next) {
  try {
    const cart = await cartService.clearCart(req.user.id);
    return sendSuccess(res, { message: 'Cart cleared.', data: { cart } });
  } catch (err) {
    next(err);
  }
}
