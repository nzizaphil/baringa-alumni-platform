import { body, query } from 'express-validator';

import { MAX_POST_LENGTH } from '../models/Post.js';

/**
 * Validation chains for the post routes (`POST-1`, `POST-2`).
 *
 * As in the other validator modules, nothing here writes a response: the
 * controller reads the outcome with `validationResult(req)` and turns it into
 * the failure envelope.
 */

/** One screenful of posts. The feed pages from here. */
export const DEFAULT_FEED_PAGE_SIZE = 20;

/**
 * An upper bound, so a hand-written `?limit=100000` cannot ask the database for
 * every post ever written in one request. The same cap the registration queue
 * uses.
 */
export const MAX_FEED_PAGE_SIZE = 100;

/**
 * The body of a new post.
 *
 * `trim` runs before the emptiness and length checks, so a body of nothing but
 * whitespace is rejected as empty rather than accepted as 40 characters, and a
 * body that only exceeds the limit once its trailing newlines are counted is
 * accepted. The sanitiser mutates `req.body`, so the controller stores exactly
 * what was measured.
 *
 * Both failures name the field, so the compose box can put the message beside
 * the textarea rather than above the form.
 */
export const createPostValidator = [
  body('body')
    .isString()
    .withMessage('Post body is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Post body is required')
    .bail()
    .isLength({ max: MAX_POST_LENGTH })
    .withMessage(`Post body must be ${MAX_POST_LENGTH} characters or fewer`),
];

/**
 * `?limit=` and `?cursor=` on the feed.
 *
 * Both optional. Supplying either as something unusable is an error rather than
 * a silent reset, so a client paging with a bad cursor hears about it instead of
 * quietly being sent back to the top of the feed - the same reasoning as the
 * registration queue's page parameters.
 *
 * The cursor's *shape* is checked here; whether it decodes to a real position is
 * the controller's business, since only it knows the encoding.
 */
export const feedQueryValidator = [
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: MAX_FEED_PAGE_SIZE })
    .withMessage(`Limit must be a whole number between 1 and ${MAX_FEED_PAGE_SIZE}`),

  query('cursor')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Cursor must be a string')
    .bail()
    .isLength({ max: 200 })
    .withMessage('Cursor is not a valid feed position'),
];
