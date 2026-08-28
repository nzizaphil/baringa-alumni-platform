import { validationResult } from 'express-validator';

import Post from '../models/Post.js';
import { DEFAULT_FEED_PAGE_SIZE } from '../validators/post.validator.js';

/**
 * Writing a post and reading the feed (`POST-1`, `POST-2`).
 *
 * Both routes sit behind `requireAuth` and `requireApproved`, so every caller
 * that reaches a handler here is an approved account. Nothing in this phase
 * edits, deletes, hides or reacts to a post - those are Phase 2 tickets - and
 * the two handlers below are the whole of the surface.
 */

/**
 * Machine-readable identity for "that is not a position in this feed".
 *
 * The client branches on it to restart the feed from the top rather than
 * reporting a failure: a cursor that no longer decodes is a stale page token,
 * not a broken request. Follows the same convention as `ACCOUNT_PENDING` -
 * match on the code, never on the wording beside it.
 */
export const INVALID_CURSOR_CODE = 'INVALID_CURSOR';

/**
 * Build an error for the centralised handler in `middleware/error.middleware.js`,
 * which turns `status` / `errors` / `errorCode` into the failure envelope.
 */
function httpError(status, message, { errors = [], errorCode } = {}) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors;

  if (errorCode) {
    error.errorCode = errorCode;
  }

  return error;
}

/**
 * Reduce express-validator results to the `{ field, message }` pairs the
 * envelope promises.
 *
 * express-validator also carries the offending `value` on each result; it is
 * dropped here, as in `auth.controller.js`, so a rejected body is not echoed
 * back into the response.
 */
function toFieldErrors(result) {
  return result.array().map((error) => ({
    field: error.path ?? error.type,
    message: error.msg,
  }));
}

/**
 * The author as a post carries them: enough to attribute the post, and nothing
 * more.
 *
 * `name` and `role` only. The email address is deliberately absent - the feed
 * is every approved member's view of every other member, and turning it into a
 * directory of addresses is a decision for whichever ticket introduces a
 * profile, not a side effect of showing who wrote something. The password
 * digest cannot appear whatever happens here: the populate below selects two
 * fields by name, and `select: false` on the field keeps it out regardless.
 */
function toPostAuthor(author) {
  if (!author) {
    // The author's account was removed after the post was written. The post is
    // still shown - a feed with holes in it is worse than one that says the
    // author is gone - but it must not crash the projection.
    return null;
  }

  return {
    id: String(author._id ?? author.id),
    name: author.name,
    role: author.role,
  };
}

/**
 * The public projection of a post.
 *
 * Every response that returns a post goes through this, so the shape is
 * single-sourced and a field added to the schema later cannot start appearing
 * in a response by accident.
 *
 * `hidden` is not returned. It is a moderation flag rather than something a
 * reader is told about, and the feed only ever contains posts for which it is
 * false, so echoing it would say the same thing on every row.
 */
function toSafePost(post, author) {
  return {
    id: String(post._id ?? post.id),
    body: post.body,
    visibility: post.visibility,
    author: toPostAuthor(author ?? post.authorId),
    createdAt: post.createdAt,
  };
}

/**
 * Feed positions, as an opaque string.
 *
 * A cursor rather than an offset, because a feed is written to while it is
 * being read: with `?page=2`, one post arriving between the two requests shifts
 * every row down and the reader sees the last post of page 1 again at the top
 * of page 2. A cursor names a *position* - "everything older than this exact
 * post" - so a new post at the top cannot disturb it.
 *
 * It carries `createdAt` as well as `_id` because the sort does. Ordering by
 * `_id` alone would be near enough in production, where ids are created in time
 * order, but not for a backdated post - the seed script writes several - and a
 * paging rule that quietly breaks on seeded data is not one to rely on.
 *
 * Base64url of `<iso>|<id>` keeps it URL-safe and, more usefully, makes it look
 * like what it is: an opaque token clients should pass back rather than parse.
 */
function encodeCursor(post) {
  return Buffer.from(`${post.createdAt.toISOString()}|${post._id}`, 'utf8').toString(
    'base64url'
  );
}

function decodeCursor(cursor) {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf('|');

  if (separator === -1) return null;

  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);

  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f]{24}$/i.test(id)) {
    return null;
  }

  return { createdAt, id };
}

/**
 * POST /api/posts
 *
 * Publishes a post by the authenticated member.
 *
 * The author is taken from `req.user` and never from the request body: a member
 * may write as themselves and as nobody else, and there is no field for them to
 * supply that would say otherwise. `visibility` is likewise not read from the
 * request - `members_only` is the only behaviour this phase implements, so
 * accepting a value for it would be accepting one the server does not honour.
 *
 * 201 - created; returns the post with its author
 * 401 - not signed in
 * 403 `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` - the account may not act yet
 * 422 - the body was missing, empty or too long
 */
export async function createPost(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return next(httpError(422, 'Validation failed', { errors: toFieldErrors(result) }));
  }

  // The validator trimmed it, so this is exactly the text that was measured.
  const { body } = req.body;

  const post = await Post.create({
    authorId: req.user._id,
    body,
  });

  /*
   * `req.user` is the author, already loaded by `requireAuth`, so the response
   * is assembled without a second read or a populate: the writer of a post is
   * by definition the caller.
   */
  return res.status(201).json({
    success: true,
    data: { post: toSafePost(post, req.user) },
  });
}

/**
 * GET /api/posts
 *
 * The member feed: every post that is not hidden, newest first.
 *
 * Paged with `?limit=` (default `DEFAULT_FEED_PAGE_SIZE`, capped at
 * `MAX_FEED_PAGE_SIZE`) and `?cursor=`, an opaque token taken from the previous
 * response's `nextCursor`. Omit the cursor for the top of the feed.
 *
 * `visibility` is not filtered on. Every caller here is an approved member -
 * the route carries `requireApproved` - so `members_only` and `public` are the
 * same audience in this phase, and a filter would be dead code pretending to be
 * a rule. `hidden` *is* filtered on, from the first release, so a post hidden
 * later leaves the feed with no change here.
 *
 * 200 - the page of posts and whether more exist
 * 400 - `limit` is unusable, or `cursor` is not a position in this feed
 * 401 - not signed in
 * 403 `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` - the account may not act yet
 */
export async function listFeed(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return next(httpError(400, 'Invalid request', { errors: toFieldErrors(result) }));
  }

  // Safe to parse rather than coerce: the validator has established that
  // anything present is a whole number in range.
  const limit = Number.parseInt(req.query.limit, 10) || DEFAULT_FEED_PAGE_SIZE;

  const filter = { hidden: false };

  if (req.query.cursor) {
    const position = decodeCursor(req.query.cursor);

    if (!position) {
      return next(
        httpError(400, 'Cursor is not a valid feed position', {
          errors: [{ field: 'cursor', message: 'Cursor is not a valid feed position' }],
          errorCode: INVALID_CURSOR_CODE,
        })
      );
    }

    /*
     * "Strictly older than the cursor", in the sort's own terms: an earlier
     * `createdAt`, or the same instant and a lower `_id`. The tiebreaker is
     * what stops two posts written in the same millisecond from hiding each
     * other - one would otherwise be skipped or repeated at every page
     * boundary.
     */
    filter.$or = [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: position.id } },
    ];
  }

  /*
   * One row more than asked for, then discarded. That is what answers "are
   * there more?" without a second `countDocuments` over the whole collection -
   * a count that would grow more expensive with every post written, to produce
   * a boolean.
   */
  const rows = await Post.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    // Named fields rather than an exclusion, so the digest has no route here
    // even if a later ticket selects it back in somewhere else.
    .populate('authorId', 'name role')
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;

  return res.status(200).json({
    success: true,
    data: {
      posts: posts.map((post) => toSafePost(post)),
      pagination: {
        limit,
        hasMore,
        // Null on the last page, so a client can loop until it is null rather
        // than having to compare lengths against the limit it asked for.
        nextCursor: hasMore ? encodeCursor(posts[posts.length - 1]) : null,
      },
    },
  });
}
