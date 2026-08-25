import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * Liveness probe. Confirms the API process is up and responding.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
