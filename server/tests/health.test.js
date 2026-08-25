import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with a success envelope', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('reports a status and a current timestamp', async () => {
    const response = await request(app).get('/api/health');

    expect(response.body.data.status).toBe('ok');
    expect(Number.isNaN(Date.parse(response.body.data.timestamp))).toBe(false);
  });
});

describe('unmatched /api routes', () => {
  it('returns the 404 failure envelope', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, errors: [] });
    expect(typeof response.body.message).toBe('string');
  });
});
