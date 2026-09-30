import { Router } from 'express';
import * as addressController from '../controllers/address.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAddressValidator, updateAddressValidator } from '../validators/address.validators.js';

const router = Router();

router.use(protect);

// GET /api/addresses
router.get('/', addressController.list);

// POST /api/addresses
router.post('/', createAddressValidator, validate, addressController.create);

// PUT /api/addresses/:id
router.put('/:id', updateAddressValidator, validate, addressController.update);

// DELETE /api/addresses/:id
router.delete('/:id', addressController.remove);

// PATCH /api/addresses/:id/default
router.patch('/:id/default', addressController.setDefault);

export default router;
