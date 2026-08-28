import { Router } from 'express';

import { createPost, listFeed } from '../controllers/post.controller.js';
import { createPostValidator, feedQueryValidator } from '../validators/post.validator.js';
import { requireAuth, requireApproved } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * Posts and the member feed (`POST-1`, `POST-2`), mounted at `/api/posts`.
 *
 * Both routes take `requireAuth` then `requireApproved`, in that order. These
 * are member-only in the strict sense the second guard defines: writing a post
 * and reading the feed are both *acting on the platform*, which is exactly what
 * an account awaiting review may not do. A pending account is therefore turned
 * away with 403 `ACCOUNT_PENDING` and a rejected one with `ACCOUNT_REJECTED`,
 * while an unauthenticated caller never gets past the first guard and receives
 * 401 - see `docs/auth.md` §2.
 *
 * No third guard: every approved account may post and may read, whatever its
 * role. Moderation - which is where a role would start to matter - is Phase 2.
 */
const approvedMembersOnly = [requireAuth, requireApproved];

/**
 * POST /api/posts
 * Publishes a post by the authenticated member. 422 on an empty or over-long
 * body.
 */
router.post('/', approvedMembersOnly, createPostValidator, createPost);

/**
 * GET /api/posts
 * The feed: every post that is not hidden, newest first. Paged with `?limit=`
 * and the opaque `?cursor=` from the previous response.
 */
router.get('/', approvedMembersOnly, feedQueryValidator, listFeed);

export default router;
