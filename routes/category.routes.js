import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { protect, authorize, attachUserIfPresent } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCategoryValidator, updateCategoryValidator } from '../validators/category.validators.js';

const router = Router();

// GET /api/categories — public; an admin token also returns inactive ones
router.get('/', attachUserIfPresent, categoryController.list);

// GET /api/categories/:id
router.get('/:id', attachUserIfPresent, categoryController.getOne);

// POST /api/categories — admin only
router.post('/', protect, authorize('admin'), createCategoryValidator, validate, categoryController.create);

// PUT /api/categories/:id — admin only
router.put(
  '/:id',
  protect,
  authorize('admin'),
  updateCategoryValidator,
  validate,
  categoryController.update
);

// DELETE /api/categories/:id — admin only; blocked if products still reference it
router.delete('/:id', protect, authorize('admin'), categoryController.remove);

export default router;
