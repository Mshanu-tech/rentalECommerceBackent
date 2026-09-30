import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import env from '../config/env.js';

const CLOUDINARY_PREFIX = 'cloudinary:';
const isMilesWebDriver = env.storage.driver === 'milesweb';

cloudinary.config({
  cloud_name: env.storage.cloudinary.cloudName,
  api_key: env.storage.cloudinary.apiKey,
  api_secret: env.storage.cloudinary.apiSecret,
  secure: true,
});

/**
 * Resolves the legacy local image directory for existing records only.
 */
export function getUploadDir() {
  const configuredPath = isMilesWebDriver
    ? env.storage.productionUploadPath
    : env.storage.localUploadPath;

  if (!configuredPath) {
    throw new Error(
      isMilesWebDriver
        ? 'PRODUCTION_UPLOAD_PATH is not set for STORAGE_DRIVER=milesweb.'
        : 'LOCAL_UPLOAD_PATH is not set.'
    );
  }

  const resolved = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function requireCloudinaryConfig() {
  const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to upload images.');
  }
}

function uploadBuffer(buffer) {
  requireCloudinaryConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: env.storage.cloudinary.folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(`${CLOUDINARY_PREFIX}${result.version}:${encodeURIComponent(result.public_id)}`);
      }
    );
    stream.end(buffer);
  });
}

/** Uploads a multer file to Cloudinary and returns its database path. */
export async function storeImage(file) {
  return uploadBuffer(file.buffer);
}

/** Builds the public-facing URL for a Cloudinary public ID or a local filename. */
export function getPublicUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith(CLOUDINARY_PREFIX)) {
    const asset = imagePath.slice(CLOUDINARY_PREFIX.length);
    const separator = asset.indexOf(':');
    const version = Number(asset.slice(0, separator));
    const publicId = decodeURIComponent(asset.slice(separator + 1));
    return cloudinary.url(publicId, { secure: true, version });
  }
  return `${env.storage.publicUploadUrl}/${imagePath}`.replace(/([^:]\/)\/+/g, '$1');
}

/** Removes a Cloudinary asset or best-effort deletes a legacy local image. */
export async function deleteFile(imagePath) {
  if (!imagePath) return;
  if (imagePath.startsWith(CLOUDINARY_PREFIX)) {
    requireCloudinaryConfig();
    const asset = imagePath.slice(CLOUDINARY_PREFIX.length);
    const publicId = decodeURIComponent(asset.slice(asset.indexOf(':') + 1));
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary image deletion failed: ${result.result}`);
    }
    return;
  }

  const filePath = path.join(getUploadDir(), imagePath);
  await fs.promises.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') console.error(`Failed to delete upload "${filePath}":`, error.message);
  });
}
