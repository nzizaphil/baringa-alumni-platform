/**
 * 404 handler for unmatched /api routes.
 * Mounted after every API router so it only runs when nothing else matched.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
}

/**
 * Centralised error handler.
 *
 * Express 5 forwards rejected promises from async route handlers here
 * automatically, so controllers do not need try/catch wrappers.
 *
 * Errors may carry:
 *   - `status` or `statusCode` - HTTP status to send (defaults to 500)
 *   - `errors` - array of field-level details, e.g. from express-validator
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const status = err.status || err.statusCode || 500;

  // Internal failures must not expose their message in production.
  const message =
    status >= 500 && isProduction
      ? 'Internal server error'
      : err.message || 'Internal server error';

  const body = {
    success: false,
    message,
    errors: Array.isArray(err.errors) ? err.errors : [],
  };

  // Stack traces are a development aid only; never leak them in production.
  if (!isProduction && err.stack) {
    body.stack = err.stack;
  }

  if (status >= 500) {
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json(body);
}
