import { ApiError } from '../middleware/errorHandler.js';
import * as categoryModel from '../models/categoryModel.js';
import { slugify } from '../utils/slugify.js';

/** Appends -2, -3, ... to the base slug until it's free (or belongs to excludeId). */
async function uniqueSlug(base, excludeId = null) {
  const baseSlug = slugify(base);
  let slug = baseSlug;
  let suffix = 1;

  for (;;) {
    const existing = await categoryModel.findBySlug(slug);
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function listCategories({ includeInactive = false } = {}) {
  return categoryModel.findAll({ includeInactive });
}

export async function getCategory(id, { includeInactive = false } = {}) {
  const category = await categoryModel.findById(id);
  if (!category || (!category.is_active && !includeInactive)) {
    throw new ApiError(404, 'Category not found.');
  }
  return category;
}

export async function createCategory({ name, description }) {
  const slug = await uniqueSlug(name);
  return categoryModel.create({ name, slug, description: description || null });
}

export async function updateCategory(id, { name, description, isActive }) {
  const existing = await categoryModel.findById(id);
  if (!existing) throw new ApiError(404, 'Category not found.');

  const slug = name && name !== existing.name ? await uniqueSlug(name, existing.id) : existing.slug;

  return categoryModel.update(id, {
    name: name ?? existing.name,
    slug,
    description: description !== undefined ? description : existing.description,
    isActive: isActive !== undefined ? isActive : existing.is_active,
  });
}

export async function deleteCategory(id) {
  const existing = await categoryModel.findById(id);
  if (!existing) throw new ApiError(404, 'Category not found.');

  const productCount = await categoryModel.countProducts(id);
  if (productCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete "${existing.name}" — ${productCount} product(s) still use this category. Move or delete them first.`
    );
  }

  await categoryModel.remove(id);
}
