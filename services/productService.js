import { ApiError } from '../middleware/errorHandler.js';
import pool from '../config/database.js';
import * as productModel from '../models/productModel.js';
import * as categoryModel from '../models/categoryModel.js';
import { slugify } from '../utils/slugify.js';
import { getPublicUrl, deleteFile, storeImage } from './storageService.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Appends -2, -3, ... to the base slug until it's free (or belongs to excludeId). */
async function uniqueSlug(base, excludeId = null) {
  const baseSlug = slugify(base);
  let slug = baseSlug;
  let suffix = 1;

  for (;;) {
    const existing = await productModel.findBySlug(slug);
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

function toPublicProduct(product, images = []) {
  return {
    ...product,
    price: Number(product.price),
    compare_at_price: product.compare_at_price !== null ? Number(product.compare_at_price) : null,
    ratingAverage: product.rating_average !== null && product.rating_average !== undefined ? Number(product.rating_average) : null,
    reviewCount: Number(product.review_count) || 0,
    low_stock_threshold: Number(product.low_stock_threshold),
    isFeatured: Boolean(product.is_featured),
    isLowStock: Number(product.stock_quantity) <= Number(product.low_stock_threshold),
    images: images.map((img) => ({
      id: img.id,
      url: getPublicUrl(img.image_path),
      isPrimary: Boolean(img.is_primary),
      displayOrder: img.display_order,
    })),
  };
}

async function assertCategoryExists(categoryId) {
  const category = await categoryModel.findById(categoryId);
  if (!category) throw new ApiError(422, 'Selected category does not exist.');
}

/** Saves newly-uploaded files as product_images rows; first upload ever becomes primary. */
async function attachImages(productId, files) {
  if (!files.length) return;

  const existingImages = await productModel.findImages(productId);
  let hasPrimary = existingImages.some((img) => img.is_primary);
  let order = existingImages.length;

  for (const file of files) {
    const imagePath = await storeImage(file);
    const isPrimary = !hasPrimary;
    try {
      await productModel.addImage({ productId, imagePath, displayOrder: order, isPrimary });
    } catch (error) {
      await deleteFile(imagePath);
      throw error;
    }
    order += 1;
    if (isPrimary) hasPrimary = true;
  }
}

export async function listProducts({
  includeInactive = false,
  categoryId = null,
  search = null,
} = {}) {
  const products = await productModel.findAll({ includeInactive, categoryId, search });
  return Promise.all(products.map(async (p) => toPublicProduct(p, await productModel.findImages(p.id))));
}

export async function getProduct(id, { includeInactive = false } = {}) {
  const product = await productModel.findById(id);
  if (!product || (!product.is_active && !includeInactive)) {
    throw new ApiError(404, 'Product not found.');
  }
  const images = await productModel.findImages(id);
  return toPublicProduct(product, images);
}

export async function createProduct(
  { categoryId, name, description, price, compareAtPrice, sku, stockQuantity, lowStockThreshold, isFeatured },
  files = []
) {
  await assertCategoryExists(categoryId);

  const slug = await uniqueSlug(name);
  const product = await productModel.create({
    categoryId,
    name,
    slug,
    description: description || null,
    price,
    compareAtPrice: compareAtPrice ?? null,
    sku: sku || null,
    stockQuantity: stockQuantity ?? 0,
    lowStockThreshold: lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    isFeatured: Boolean(isFeatured),
  });

  await attachImages(product.id, files);

  return getProduct(product.id, { includeInactive: true });
}

export async function updateProduct(
  id,
  {
    categoryId,
    name,
    description,
    price,
    compareAtPrice,
    sku,
    stockQuantity,
    lowStockThreshold,
    isActive,
    isFeatured,
  },
  files = []
) {
  const existing = await productModel.findById(id);
  if (!existing) throw new ApiError(404, 'Product not found.');

  if (categoryId) await assertCategoryExists(categoryId);

  const slug = name && name !== existing.name ? await uniqueSlug(name, existing.id) : existing.slug;

  await productModel.update(id, {
    categoryId: categoryId ?? existing.category_id,
    name: name ?? existing.name,
    slug,
    description: description !== undefined ? description : existing.description,
    price: price ?? existing.price,
    compareAtPrice: compareAtPrice !== undefined ? compareAtPrice : existing.compare_at_price,
    sku: sku !== undefined ? sku : existing.sku,
    // Note: this is the product form's own "stock quantity" field — a direct override, used
    // for the initial count or a full correction. Day-to-day changes (restocks, damage,
    // returns) should go through adjustStock() below instead, since only that path is logged.
    stockQuantity: stockQuantity ?? existing.stock_quantity,
    lowStockThreshold: lowStockThreshold ?? existing.low_stock_threshold,
    isActive: isActive !== undefined ? isActive : existing.is_active,
    isFeatured: isFeatured !== undefined ? isFeatured : existing.is_featured,
  });

  await attachImages(id, files);

  return getProduct(id, { includeInactive: true });
}

export async function deleteProduct(id) {
  const existing = await productModel.findById(id);
  if (!existing) throw new ApiError(404, 'Product not found.');

  const images = await productModel.findImages(id);
  await Promise.all(images.map((img) => deleteFile(img.image_path)));

  await productModel.remove(id); // cascades to product_images rows
}

export async function deleteProductImage(productId, imageId) {
  const image = await productModel.findImageById(imageId);
  if (!image || image.product_id !== productId) {
    throw new ApiError(404, 'Image not found.');
  }

  await deleteFile(image.image_path);
  await productModel.removeImage(imageId);

  if (image.is_primary) {
    const remaining = await productModel.findImages(productId);
    if (remaining.length) await productModel.setPrimaryImage(productId, remaining[0].id);
  }
}

export async function replaceProductImage(productId, imageId, file) {
  if (!file) throw new ApiError(422, 'An image file is required.');
  const product = await productModel.findById(productId);
  const existingImage = await productModel.findImageById(imageId);
  if (!product || !existingImage || existingImage.product_id !== productId) {
    throw new ApiError(404, 'Image not found.');
  }

  const newImagePath = await storeImage(file);
  try {
    await productModel.updateImagePath(imageId, newImagePath);
  } catch (error) {
    await deleteFile(newImagePath);
    throw error;
  }
  await deleteFile(existingImage.image_path);
}

export async function setPrimaryImage(productId, imageId) {
  const image = await productModel.findImageById(imageId);
  if (!image || image.product_id !== productId) {
    throw new ApiError(404, 'Image not found.');
  }
  await productModel.setPrimaryImage(productId, imageId);
}

// --- Stock management (Phase 8) -----------------------------------------

function toPublicStockAdjustment(row) {
  return {
    id: row.id,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    changeQty: row.change_qty,
    reason: row.reason,
    note: row.note,
    changedByName: row.changed_by_name,
    createdAt: row.created_at,
  };
}

/**
 * The one path that changes stock outside of an order (checkout/cancel go straight through
 * productModel's decrement/increment inside orderService). Every call here is logged to
 * `stock_adjustments`, which is what makes it different from just editing the product's
 * "stock quantity" field on the product form. `type` is one of:
 *   'increment' — add `quantity` (e.g. a restock delivery)
 *   'decrement' — subtract `quantity` (e.g. found damaged units)
 *   'set'       — replace stock with `quantity` outright (e.g. a physical recount)
 * Runs as a transaction: the product row is locked (FOR UPDATE) so a concurrent checkout
 * can't race an admin's adjustment, the new quantity is validated to never go negative, and
 * the update + log row are written together or not at all.
 */
export async function adjustStock(productId, { type, quantity, reason = 'other', note }, adminUserId = null) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const product = await productModel.findByIdForUpdate(productId, connection);
    if (!product) throw new ApiError(404, 'Product not found.');

    const previousQuantity = Number(product.stock_quantity);
    let newQuantity;
    if (type === 'increment') newQuantity = previousQuantity + quantity;
    else if (type === 'decrement') newQuantity = previousQuantity - quantity;
    else newQuantity = quantity; // 'set'

    if (newQuantity < 0) {
      throw new ApiError(
        422,
        `That would take "${product.name}"'s stock below zero (currently ${previousQuantity}).`
      );
    }

    await productModel.setStockQuantity(productId, newQuantity, connection);
    await productModel.insertStockAdjustment(connection, {
      productId,
      previousQuantity,
      newQuantity,
      reason,
      note: note || null,
      changedBy: adminUserId,
    });

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return getProduct(productId, { includeInactive: true });
}

/** Active products at or below their own low-stock threshold, worst-first. No image fetch — this list is for a quick admin scan, not the catalog UI. */
export async function getLowStockProducts() {
  const products = await productModel.findLowStock();
  return products.map((p) => toPublicProduct(p));
}

export async function getStockHistory(productId) {
  const product = await productModel.findById(productId);
  if (!product) throw new ApiError(404, 'Product not found.');
  const rows = await productModel.findStockAdjustments(productId);
  return rows.map(toPublicStockAdjustment);
}
