import { sendSuccess } from '../utils/apiResponse.js';
import * as categoryService from '../services/categoryService.js';

// Admin sees inactive categories too (management view); everyone else sees
// only what's active — same rule for the list and the single-category read.
function canSeeInactive(req) {
  return req.user?.role === 'admin';
}

export async function list(req, res, next) {
  try {
    const categories = await categoryService.listCategories({
      includeInactive: canSeeInactive(req),
    });
    return sendSuccess(res, { message: 'Categories fetched.', data: { categories } });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const category = await categoryService.getCategory(req.params.id, {
      includeInactive: canSeeInactive(req),
    });
    return sendSuccess(res, { message: 'Category fetched.', data: { category } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const category = await categoryService.createCategory(req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Category created.',
      data: { category },
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    return sendSuccess(res, { message: 'Category updated.', data: { category } });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await categoryService.deleteCategory(req.params.id);
    return sendSuccess(res, { message: 'Category deleted.' });
  } catch (err) {
    next(err);
  }
}
