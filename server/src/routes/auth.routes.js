import { Router } from 'express';

import { register, login, me } from '../controllers/auth.controller.js';
import { registerValidator, loginValidator } from '../validators/auth.validator.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/auth/register
 * Public. Creates a pending member account.
 */
router.post('/register', registerValidator, register);

/**
 * POST /api/auth/login
 * Public. Exchanges credentials for a JWT access token.
 */
router.post('/login', loginValidator, login);

/**
 * GET /api/auth/me
 * Authenticated. Returns the caller's own profile.
 */
router.get('/me', requireAuth, me);

export default router;
