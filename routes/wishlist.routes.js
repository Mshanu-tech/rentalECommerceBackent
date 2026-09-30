import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addWishlistItemValidator } from '../validators/wishlist.validators.js';

const router = Router();

router.use(protect);

// GET /api/wishlist
router.get('/', wishlistController.list);

// POST /api/wishlist/items  { productId }
router.post('/items', addWishlistItemValidator, validate, wishlistController.addItem);

// DELETE /api/wishlist/items/:productId
router.delete('/items/:productId', wishlistController.removeItem);

export default router;
