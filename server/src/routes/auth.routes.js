import { Router } from 'express';

import { register } from '../controllers/auth.controller.js';
import { registerValidator } from '../validators/auth.validator.js';

const router = Router();

/**
 * POST /api/auth/register
 * Public. Creates a pending member account.
 */
router.post('/register', registerValidator, register);

export default router;
