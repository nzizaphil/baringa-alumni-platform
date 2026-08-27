import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
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
 * `requireApproved` (see `middleware/auth.middleware.js`).
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

// Anything under /api that reached this point matched no route.
app.use('/api', notFoundHandler);

// Final handler: converts thrown/forwarded errors into the failure envelope.
app.use(errorHandler);

export default app;
