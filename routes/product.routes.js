import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { protect, authorize, attachUserIfPresent } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { handleProductImagesUpload, handleProductImageUpload } from '../middleware/upload.js';
import * as reviewController from '../controllers/review.controller.js';
import { reviewValidator } from '../validators/review.validators.js';
import {
  createProductValidator,
  updateProductValidator,
  adjustStockValidator,
} from '../validators/product.validators.js';

const router = Router();

// GET /api/products?categoryId=&search= — public; an admin token also returns inactive ones
router.get('/', attachUserIfPresent, productController.list);

// GET /api/products/low-stock — admin only. Must come before GET /:id so "low-stock" is
// never parsed as a product id.
router.get('/low-stock', protect, authorize('admin'), productController.lowStock);

// GET /api/products/:id
router.get('/:id', attachUserIfPresent, productController.getOne);

// --- Reviews (Phase 9) ---
// GET /api/products/:id/reviews?page=&limit= — public; a signed-in viewer also gets `me`
router.get('/:id/reviews', attachUserIfPresent, reviewController.listForProduct);

// POST /api/products/:id/reviews  { rating, title?, comment? } — any signed-in customer
router.post('/:id/reviews', protect, reviewValidator, validate, reviewController.create);

// PUT /api/products/:id/reviews/mine — edit your own review
router.put('/:id/reviews/mine', protect, reviewValidator, validate, reviewController.updateMine);

// DELETE /api/products/:id/reviews/mine — delete your own review
router.delete('/:id/reviews/mine', protect, reviewController.removeMine);

// GET /api/products/:id/stock-history — admin only (Phase 8)
router.get('/:id/stock-history', protect, authorize('admin'), productController.stockHistory);

// PATCH /api/products/:id/stock  { type, quantity, reason?, note? } — admin only (Phase 8)
router.patch(
  '/:id/stock',
  protect,
  authorize('admin'),
  adjustStockValidator,
  validate,
  productController.adjustStock
);

// POST /api/products — admin only. multipart/form-data, up to 6 images under "images".
router.post(
  '/',
  protect,
  authorize('admin'),
  handleProductImagesUpload,
  createProductValidator,
  validate,
  productController.create
);

// PUT /api/products/:id — admin only. Same shape; any new "images" files are appended.
router.put(
  '/:id',
  protect,
  authorize('admin'),
  handleProductImagesUpload,
  updateProductValidator,
  validate,
  productController.update
);

// DELETE /api/products/:id — admin only; also removes its images from disk
router.delete('/:id', protect, authorize('admin'), productController.remove);

// DELETE /api/products/:id/images/:imageId — admin only
router.delete('/:id/images/:imageId', protect, authorize('admin'), productController.removeImage);

// PUT /api/products/:id/images/:imageId — admin only; multipart image field replaces the image.
router.put(
  '/:id/images/:imageId',
  protect,
  authorize('admin'),
  handleProductImageUpload,
  productController.replaceImage
);

// PATCH /api/products/:id/images/:imageId/primary — admin only
router.patch(
  '/:id/images/:imageId/primary',
  protect,
  authorize('admin'),
  productController.setPrimaryImage
);

export default router;
