import { Router } from 'express';
import { checkDatabaseConnection } from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

// GET /api/health
router.get('/', async (req, res) => {
  const db = await checkDatabaseConnection();

  return sendSuccess(res, {
    message: 'API is running',
    data: {
      api: 'ok',
      database: db.connected ? 'connected' : 'disconnected',
      ...(db.connected ? {} : { databaseError: db.error }),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
