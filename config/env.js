import dotenv from 'dotenv';

dotenv.config();

/**
 * Single source of truth for every environment variable the app uses.
 * Importing from here (instead of reading process.env all over the codebase)
 * means Phase 2+ code never has to guess a variable name, and switching
 * from local development to MilesWeb production is purely a .env change.
 */
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || 'https://rental-e-commerce-xi.vercel.app',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'ecommerce',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  otp: {
    length: 6,
    expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 10,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '',
  },

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    adminPhoneNumber: (process.env.WHATSAPP_ADMIN_PHONE_NUMBER || '').replace(/\D/g, ''),
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0',
    orderTemplateName: process.env.WHATSAPP_ORDER_TEMPLATE_NAME || 'admin_new_order',
    orderTemplateLanguage: process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE || 'en_US',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'cloudinary', // 'cloudinary' | 'local' | 'milesweb'
    localUploadPath: process.env.LOCAL_UPLOAD_PATH || './uploads/products',
    productionUploadPath: process.env.PRODUCTION_UPLOAD_PATH || '',
    publicUploadUrl: process.env.PUBLIC_UPLOAD_URL || '/uploads/products',
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'ecommerce/products',
    },
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
};

export function assertRequiredEnv() {
  const missing = [];
  if (!env.jwt.secret) missing.push('JWT_SECRET');
  if (!env.smtp.host) {
    console.warn(
      '⚠️  SMTP_HOST is not set — OTP emails will be logged to the console instead of sent. ' +
        'Fine for local development, but set real SMTP_* values before production.'
    );
  }
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId || !env.whatsapp.adminPhoneNumber) {
    console.warn(
      'WhatsApp order alerts are disabled. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and ' +
        'WHATSAPP_ADMIN_PHONE_NUMBER to enable them.'
    );
  }
  if (!env.storage.cloudinary.cloudName || !env.storage.cloudinary.apiKey || !env.storage.cloudinary.apiSecret) {
    console.warn('Cloudinary uploads are disabled until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.');
  }
  if (env.NODE_ENV === 'production') {
    if (!env.db.password) missing.push('DB_PASSWORD');
    if (!env.razorpay.keyId) missing.push('RAZORPAY_KEY_ID');
    if (!env.razorpay.keySecret) missing.push('RAZORPAY_KEY_SECRET');
    if (!env.smtp.host) missing.push('SMTP_HOST');
  }
  if (missing.length) {
    console.warn(
      `⚠️  Missing environment variables: ${missing.join(', ')}. See .env.example.`
    );
  }
}

export default env;
