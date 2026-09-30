import multer from 'multer';
import { ApiError } from './errorHandler.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_PRODUCT = 6;

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(422, 'Only JPEG, PNG, WEBP, or GIF images are allowed.'));
  }
  cb(null, true);
}

const productImagesUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_PRODUCT },
}).array('images', MAX_FILES_PER_PRODUCT);
const productImageUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
}).single('image');

/**
 * Wraps multer so its errors come back through the project's standard
 * { success: false, message } envelope instead of multer's own format.
 * Field is optional on both create and update, so a request with no
 * files at all is not an error — it just means "no new images this time".
 */
function handleUpload(upload, fieldName, req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(422, 'Each image must be 5MB or smaller.'));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new ApiError(422, `You can upload up to ${MAX_FILES_PER_PRODUCT} images per product.`));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(422, `Unexpected file field — use "${fieldName}".`));
      }
      return next(new ApiError(422, err.message));
    }
    return next(err);
  });
}

export function handleProductImagesUpload(req, res, next) {
  handleUpload(productImagesUpload, 'images', req, res, next);
}

export function handleProductImageUpload(req, res, next) {
  handleUpload(productImageUpload, 'image', req, res, next);
}
