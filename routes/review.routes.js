import { Router } from 'express';
import * as reviewController from '../controllers/review.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewVisibilityValidator } from '../validators/review.validators.js';

// Admin moderation only, mounted at /api/reviews. The customer-facing, product-scoped review
// routes (GET/POST/PUT/DELETE /api/products/:id/reviews) live in product.routes.js.
const router = Router();

router.use(protect, authorize('admin'));

// GET /api/reviews/admin?hidden=&rating=&search=&page=&limit=
router.get('/admin', reviewController.listAdmin);

// PATCH /api/reviews/admin/:id/visibility  { isHidden }
router.patch('/admin/:id/visibility', reviewVisibilityValidator, validate, reviewController.setVisibility);

// DELETE /api/reviews/admin/:id
router.delete('/admin/:id', reviewController.removeAdmin);

export default router;
