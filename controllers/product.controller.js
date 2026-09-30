import { sendSuccess } from '../utils/apiResponse.js';
import * as productService from '../services/productService.js';

function canSeeInactive(req) {
  return req.user?.role === 'admin';
}

export async function list(req, res, next) {
  try {
    const { categoryId, search } = req.query;
    const products = await productService.listProducts({
      includeInactive: canSeeInactive(req),
      categoryId: categoryId ? Number(categoryId) : null,
      search: search || null,
    });
    return sendSuccess(res, { message: 'Products fetched.', data: { products } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const product = await productService.getProduct(req.params.id, {
      includeInactive: canSeeInactive(req),
    });
    return sendSuccess(res, { message: 'Product fetched.', data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const product = await productService.createProduct(req.body, req.files || []);
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Product created.',
      data: { product },
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body, req.files || []);
    return sendSuccess(res, { message: 'Product updated.', data: { product } });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await productService.deleteProduct(req.params.id);
    return sendSuccess(res, { message: 'Product deleted.' });
  } catch (err) {
    next(err);
  }
}

export async function removeImage(req, res, next) {
  try {
    await productService.deleteProductImage(Number(req.params.id), Number(req.params.imageId));
    return sendSuccess(res, { message: 'Image removed.' });
  } catch (err) {
    next(err);
  }
}

export async function replaceImage(req, res, next) {
  try {
    await productService.replaceProductImage(Number(req.params.id), Number(req.params.imageId), req.file);
    return sendSuccess(res, { message: 'Image updated.' });
  } catch (err) {
    next(err);
  }
}

export async function setPrimaryImage(req, res, next) {
  try {
    await productService.setPrimaryImage(Number(req.params.id), Number(req.params.imageId));
    return sendSuccess(res, { message: 'Primary image updated.' });
  } catch (err) {
    next(err);
  }
}

// --- Stock management (Phase 8) ------------------------------------------

export async function lowStock(req, res, next) {
  try {
    const products = await productService.getLowStockProducts();
    return sendSuccess(res, { message: 'Low-stock products fetched.', data: { products } });
  } catch (err) {
    next(err);
  }
}

export async function stockHistory(req, res, next) {
  try {
    const adjustments = await productService.getStockHistory(Number(req.params.id));
    return sendSuccess(res, { message: 'Stock history fetched.', data: { adjustments } });
  } catch (err) {
    next(err);
  }
}

export async function adjustStock(req, res, next) {
  try {
    const { type, quantity, reason, note } = req.body;
    const product = await productService.adjustStock(
      Number(req.params.id),
      { type, quantity, reason, note },
      req.user.id
    );
    return sendSuccess(res, { message: 'Stock updated.', data: { product } });
  } catch (err) {
    next(err);
  }
}
