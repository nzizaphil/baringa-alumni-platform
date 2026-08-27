import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

import User from '../src/models/User.js';
import { errorHandler } from '../src/middleware/error.middleware.js';
import {
  requireAuth,
  requireApproved,
  requireRole,
  ACCOUNT_PENDING_CODE,
  ACCOUNT_REJECTED_CODE,
} from '../src/middleware/auth.middleware.js';
import {
  connectMemoryDatabase,
  clearMemoryDatabase,
  disconnectMemoryDatabase,
} from './helpers/memory-db.js';

// Same defaults as the other auth suites: keep the tests independent of any
// developer's local .env, and import `app` afterwards so it picks them up.
// Neither value is a real secret.
process.env.JWT_SECRET ||= 'test-only-signing-secret';
process.env.JWT_EXPIRES_IN ||= '1h';

const { default: app } = await import('../src/app.js');

const PASSWORD = 'Baringa2026';

const ACCOUNT = {
  name: 'Amina Uwase',
  email: 'amina.uwase@example.com',
  association: 'former_student',
  studentNumber: 'n10428837',
  graduationYear: 2019,
};

/** Creates an account at a chosen status and signs in as it. */
async function signInAs({ status = 'pending', role = 'member' } = {}) {
  const user = new User({
    ...ACCOUNT,
    role,
    status,
    // The pre-save hook replaces this plaintext with its bcrypt digest.
    passwordHash: PASSWORD,
  });

  await user.save();

  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: ACCOUNT.email, password: PASSWORD });

  return { user, login: response, token: response.body.data?.token };
}

/**
 * A throwaway app standing in for the member-only routes later tickets add -
 * posts, the feed - so this suite tests the composition those routes will use
 * rather than a middleware in isolation. Same guards, same centralised error
 * handler as the real app.
 */
const memberApp = express();

memberApp.get('/posts', requireAuth, requireApproved, (req, res) =>
  res.status(200).json({ success: true, data: { status: req.user.status } })
);

memberApp.get('/reports', requireAuth, requireApproved, requireRole('administrator'), (req, res) =>
  res.status(200).json({ success: true, data: { role: req.user.role } })
);

memberApp.use(errorHandler);

// Starting the in-memory MongoDB downloads a server binary on first run.
beforeAll(async () => {
  await connectMemoryDatabase();
}, 120_000);

afterAll(async () => {
  await disconnectMemoryDatabase();
});

beforeEach(async () => {
  await clearMemoryDatabase();
});

const memberRoute = (token, path = '/posts') => {
  const call = request(memberApp).get(path);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

describe('login with an account that may not act yet', () => {
  it('issues a token to a pending account and reports its status', async () => {
    const { login } = await signInAs({ status: 'pending' });

    expect(login.status).toBe(200);
    expect(typeof login.body.data.token).toBe('string');
    expect(login.body.data.user.status).toBe('pending');
  });

  it('issues a token to a rejected account and reports its status', async () => {
    const { login } = await signInAs({ status: 'rejected' });

    expect(login.status).toBe(200);
    expect(typeof login.body.data.token).toBe('string');
    expect(login.body.data.user.status).toBe('rejected');
  });

  it('keeps GET /api/auth/me open to a pending account', async () => {
    const { token } = await signInAs({ status: 'pending' });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    // Not member-only: this is how the pending screen learns where it stands.
    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe('pending');
  });
});

describe('requireApproved', () => {
  it('lets an approved account through', async () => {
    const { token } = await signInAs({ status: 'approved' });

    const response = await memberRoute(token);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('approved');
  });

  it('rejects a pending account with 403 ACCOUNT_PENDING', async () => {
    const { token } = await signInAs({ status: 'pending' });

    const response = await memberRoute(token);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
    expect(response.body.message).toMatch(/reviewed/i);
    expect(response.body.errors).toEqual([]);
  });

  it('rejects a rejected account with a distinct 403 ACCOUNT_REJECTED', async () => {
    const { token } = await signInAs({ status: 'rejected' });

    const response = await memberRoute(token);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_REJECTED_CODE);
    expect(response.body.code).not.toBe(ACCOUNT_PENDING_CODE);
  });

  it('rejects an unauthenticated caller with 401 before looking at status', async () => {
    const response = await memberRoute();

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('code');
  });

  it('reflects an approval granted since the token was issued', async () => {
    const { user, token } = await signInAs({ status: 'pending' });

    expect((await memberRoute(token)).status).toBe(403);

    await User.findByIdAndUpdate(user.id, { status: 'approved' });

    // The token still claims "pending"; the database is what counts, so the
    // member does not have to sign in again for an approval to take effect.
    expect((await memberRoute(token)).status).toBe(200);
  });

  it('reflects a rejection made since the token was issued', async () => {
    const { user, token } = await signInAs({ status: 'approved' });

    await User.findByIdAndUpdate(user.id, { status: 'rejected' });

    const response = await memberRoute(token);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_REJECTED_CODE);
  });

  it('runs before requireRole, so status is reported ahead of privilege', async () => {
    const { token } = await signInAs({ status: 'pending', role: 'administrator' });

    const response = await memberRoute(token, '/reports');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
  });

  it('still applies requireRole once the account is approved', async () => {
    const { token } = await signInAs({ status: 'approved', role: 'member' });

    const response = await memberRoute(token, '/reports');

    expect(response.status).toBe(403);
    // Turned away on privilege, not on status: no account code on this one.
    expect(response.body).not.toHaveProperty('code');
  });
});
