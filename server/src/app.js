import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import postRoutes from './routes/post.routes.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

/**
 * JSON response envelope
 * ----------------------
 * Every endpoint in this API answers with one of two shapes. Later tickets
 * must follow this contract so the React client can parse responses uniformly.
 *
 * Success (2xx):
 *   {
 *     "success": true,
 *     "data": <object | array | null>
 *   }
 *
 * Failure (4xx / 5xx):
 *   {
 *     "success": false,
 *     "message": "Human-readable summary of what went wrong",
 *     "errors": [ { "field": "email", "message": "Email is required" } ],
 *     "code": "ACCOUNT_PENDING"
 *   }
 *
 * `errors` is always present on failures and is an empty array when there are
 * no field-level details. Validation failures (express-validator) populate it;
 * everything else leaves it empty.
 *
 * `code` is optional and appears only where the client is expected to branch on
 * *which* failure this is rather than merely report it. It is a stable
 * SCREAMING_SNAKE identifier; the `message` beside it is the wording shown to a
 * person and may be reworded without notice. The codes defined so far are
 * `ACCOUNT_PENDING` and `ACCOUNT_REJECTED`, both 403s raised by
 * `requireApproved` (see `middleware/auth.middleware.js`), and two from
 * `controllers/admin.controller.js`: `REGISTRATION_NOT_PENDING`, the 409 raised
 * when an administrator decides a registration that has already been decided,
 * and `SELF_REVIEW_FORBIDDEN`, the 403 raised when one points the approve or
 * reject route at their own account. `controllers/notification.controller.js`
 * adds `NOTIFICATION_NOT_FOUND`, the 404 raised when a caller marks a
 * notification that is not their own as read, and
 * `controllers/post.controller.js` adds `INVALID_CURSOR`, the 400 raised when a
 * feed cursor does not decode to a position.
 *
 * Failures are produced by the centralised error handler below, so controllers
 * signal problems by throwing or calling `next(err)` with `status` / `errors` /
 * `errorCode` attached rather than shaping JSON themselves.
 */

const app = express();

// Trust the first proxy hop so client IPs and protocol survive hosting.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Reject oversized payloads before they reach any handler.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Only the configured client origin may call this API from a browser.
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/posts', postRoutes);

/**
 * Built client
 * ------------
 * In production the same Express process that serves the API also serves the
 * compiled React bundle, so there is one origin, one port and one process to
 * keep alive on the instance. Nginx forwards everything to :5000 and does not
 * need to know where `dist` lives.
 *
 * Two handlers, in this order:
 *   1. `express.static` answers requests that name a real build file
 *      (`/assets/index-*.js`, `/favicon.svg`, ...).
 *   2. everything else that is a GET and is not an API path gets
 *      `index.html`, so React Router resolves the URL on the client and a
 *      refresh on `/feed` is no longer a 404.
 *
 * Both are registered after every `/api` router and before `notFoundHandler`,
 * so an unknown `/api` path still falls through to the JSON 404 envelope
 * rather than being answered with the HTML shell.
 *
 * The path is resolved from this module, not from `process.cwd()`: PM2 starts
 * the process from whatever directory `pm2 start` was invoked in, which is not
 * reliably `server/`.
 */
const serverSrcDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(serverSrcDir, '../../client/dist');
const clientIndexHtml = path.join(clientDistDir, 'index.html');

/**
 * Gated on NODE_ENV rather than on the existence of `client/dist`, because
 * `dist` is also present on a developer's machine after any local build. In
 * development the client is served by Vite on 5173, which proxies `/api` here,
 * and the Vitest suite exercises this same app object - in both cases a stale
 * bundle answering non-API GETs on 5000 would be misleading rather than
 * useful. The existence check below is only a guard against starting in
 * production with the build step forgotten.
 */
if (process.env.NODE_ENV === 'production') {
  if (existsSync(clientIndexHtml)) {
    app.use(express.static(clientDistDir));

    // Express 5 uses path-to-regexp v8, where a bare '*' is not a valid path.
    // The wildcard must be named: '/*splat' matches zero or more segments.
    app.get('/*splat', (req, res, next) => {
      // API paths are not the client's to answer; let the JSON 404 have them.
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(clientIndexHtml, (err) => (err ? next(err) : undefined));
    });
  } else {
    console.warn(
      `Client build not found at ${clientDistDir} - serving the API only. ` +
        'Run `npm run build` in client/ and restart.'
    );
  }
}

// Anything under /api that reached this point matched no route.
app.use('/api', notFoundHandler);

// Final handler: converts thrown/forwarded errors into the failure envelope.
app.use(errorHandler);

export default app;
