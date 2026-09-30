import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addCartItemValidator, updateCartItemValidator } from '../validators/cart.validators.js';

const router = Router();

// Every cart route is per-logged-in-user — there's no guest cart.
router.use(protect);

// GET /api/cart
router.get('/', cartController.getCart);

// POST /api/cart/items  { productId, quantity? }
router.post('/items', addCartItemValidator, validate, cartController.addItem);

// PUT /api/cart/items/:productId  { quantity }
router.put('/items/:productId', updateCartItemValidator, validate, cartController.updateItem);

// DELETE /api/cart/items/:productId
router.delete('/items/:productId', cartController.removeItem);

// DELETE /api/cart
router.delete('/', cartController.clearCart);

export default router;
