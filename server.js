import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import env, { assertRequiredEnv } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import cartRoutes from './routes/cart.routes.js';
import wishlistRoutes from './routes/wishlist.routes.js';
import addressRoutes from './routes/address.routes.js';
import orderRoutes from './routes/order.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import reviewRoutes from './routes/review.routes.js';
import contactRoutes from './routes/contact.routes.js';
import messageRoutes from './routes/message.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

assertRequiredEnv();

const app = express();

// --- Security & core middleware ---
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(compression());

// Mounted with a raw-body parser and *before* the app-wide express.json() below: Razorpay's
// webhook signature is computed over the exact raw request bytes, so parsing the body to JSON
// first (and Express re-serializing it) would break verification. Everything else in the app
// keeps using the parsed JSON body as normal.
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// --- Static file serving for legacy local image URLs ---
// New product uploads go to Cloudinary and are served from generated URLs.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API routes ---
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/messages', messageRoutes);
// /api/webhooks/razorpay is mounted above, ahead of express.json() — see the comment there.
// Phase 7+ routes (order tracking, reviews) will be mounted here.

app.get('/api', (req, res) => {
  res.json({ success: true, message: 'E-commerce API', version: '1.0.0' });
});

// --- Error handling (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, async () => {
  console.log(`🚀 API server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  const db = await checkDatabaseConnection();
  if (db.connected) {
    console.log('✅ MySQL connected');
  } else {
    console.warn(`⚠️  MySQL not connected: ${db.error}`);
    console.warn('   Check your .env DB_* settings and that MySQL is running.');
  }
});
