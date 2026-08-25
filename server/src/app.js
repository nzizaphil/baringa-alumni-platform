import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.routes.js';
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
 *     "errors": [ { "field": "email", "message": "Email is required" } ]
 *   }
 *
 * `errors` is always present on failures and is an empty array when there are
 * no field-level details. Validation failures (express-validator) populate it;
 * everything else leaves it empty. Failures are produced by the centralised
 * error handler below, so controllers signal problems by throwing or calling
 * `next(err)` with `status` / `errors` attached rather than shaping JSON
 * themselves.
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

// Anything under /api that reached this point matched no route.
app.use('/api', notFoundHandler);

// Final handler: converts thrown/forwarded errors into the failure envelope.
app.use(errorHandler);

export default app;
