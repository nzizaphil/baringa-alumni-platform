import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../src/models/User.js';
import { errorHandler } from '../src/middleware/error.middleware.js';
import { requireAuth, requireRole } from '../src/middleware/auth.middleware.js';
import {
  connectMemoryDatabase,
  clearMemoryDatabase,
  disconnectMemoryDatabase,
} from './helpers/memory-db.js';

// Keep the suite independent of any developer's local .env. dotenv leaves a
// variable that is already set untouched, so these defaults apply only when
// the environment is bare - and `app` is imported afterwards so it picks them
// up. Neither value is a real secret.
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

/**
 * Create an account directly, bypassing registration: this ticket needs
 * approved and privileged accounts, which registration never produces.
 */
async function createAccount({ password = PASSWORD, ...overrides } = {}) {
  const user = new User({
    ...ACCOUNT,
    role: 'member',
    status: 'approved',
    ...overrides,
    // The pre-save hook replaces this plaintext with its bcrypt digest.
    passwordHash: password,
  });

  await user.save();
  return user;
}

const loginRequest = (body) => request(app).post('/api/auth/login').send(body);

const loginAs = async (overrides) => {
  const user = await createAccount(overrides);
  const response = await loginRequest({ email: user.email, password: PASSWORD });

  return { user, token: response.body.data.token };
};

/**
 * A throwaway app for `requireRole`, which no route mounts yet - the admin
 * endpoints that will use it are ADMIN-*. It wires the same middleware and the
 * same centralised error handler the real app uses.
 */
const roleApp = express();

roleApp.get(
  '/moderators-only',
  requireAuth,
  requireRole('moderator', 'administrator'),
  (req, res) => res.status(200).json({ success: true, data: { role: req.user.role } })
);

roleApp.use(errorHandler);

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

describe('POST /api/auth/login', () => {
  it('returns 200 with a token for correct credentials on an approved account', async () => {
    await createAccount();

    const response = await loginRequest({ email: ACCOUNT.email, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.split('.')).toHaveLength(3);
    expect(response.body.data.user).toEqual({
      id: expect.any(String),
      name: ACCOUNT.name,
      email: ACCOUNT.email,
      role: 'member',
      status: 'approved',
    });
  });

  it('signs the user id, role and status into the token', async () => {
    const user = await createAccount({ role: 'moderator' });

    const response = await loginRequest({ email: ACCOUNT.email, password: PASSWORD });
    const claims = jwt.verify(response.body.data.token, process.env.JWT_SECRET);

    expect(claims.sub).toBe(user.id);
    expect(claims.role).toBe('moderator');
    expect(claims.status).toBe('approved');
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('never returns the password or its hash', async () => {
    await createAccount();

    const response = await loginRequest({ email: ACCOUNT.email, password: PASSWORD });

    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.text).not.toContain(PASSWORD);
  });

  it('accepts an email in a different case', async () => {
    await createAccount();

    const response = await loginRequest({
      email: 'Amina.Uwase@Example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with 401 and the generic message', async () => {
    await createAccount();

    const response = await loginRequest({
      email: ACCOUNT.email,
      password: 'WrongPassword1',
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Email or password is incorrect');
    expect(response.body.errors).toEqual([]);
  });

  it('rejects an unknown email with 401 and the generic message', async () => {
    const response = await loginRequest({
      email: 'nobody@example.com',
      password: 'WrongPassword1',
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Email or password is incorrect');
  });

  it('answers a wrong password and an unknown email with byte-identical responses', async () => {
    await createAccount();

    const wrongPassword = await loginRequest({
      email: ACCOUNT.email,
      password: 'WrongPassword1',
    });

    const unknownEmail = await loginRequest({
      email: 'nobody@example.com',
      password: 'WrongPassword1',
    });

    // Compared as raw text, not field by field: anything the error handler
    // adds - a stack trace outside production included - has to match too, or
    // the response tells an attacker which accounts exist.
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.text).toBe(wrongPassword.text);
    expect(unknownEmail.headers['content-type']).toBe(
      wrongPassword.headers['content-type']
    );
    expect(unknownEmail.headers['content-length']).toBe(
      wrongPassword.headers['content-length']
    );
  });

  it('rejects a missing password with 422 before touching the database', async () => {
    const response = await loginRequest({ email: ACCOUNT.email });

    expect(response.status).toBe(422);
    expect(response.body.errors.map((error) => error.field)).toContain('password');
  });

  it('rejects a malformed email with 422', async () => {
    const response = await loginRequest({ email: 'not-an-email', password: PASSWORD });

    expect(response.status).toBe(422);
    expect(response.body.errors.map((error) => error.field)).toContain('email');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual([]);
  });

  it('returns 401 for a token altered by one character', async () => {
    const { token } = await loginAs();

    const lastCharacter = token.slice(-1);
    const tampered = token.slice(0, -1) + (lastCharacter === 'A' ? 'B' : 'A');

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns 401 for a header that is not a bearer token', async () => {
    const { token } = await loginAs();

    const noScheme = await request(app).get('/api/auth/me').set('Authorization', token);
    const wrongScheme = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Basic ${token}`);
    const schemeOnly = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer');

    expect(noScheme.status).toBe(401);
    expect(wrongScheme.status).toBe(401);
    expect(schemeOnly.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const user = await createAccount();

    const expired = jwt.sign(
      { sub: user.id, role: user.role, status: user.status },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/expired/i);
  });

  it('returns 401 for a token signed with a different secret', async () => {
    const user = await createAccount();

    const foreign = jwt.sign({ sub: user.id }, 'a-different-secret', {
      expiresIn: '1h',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${foreign}`);

    expect(response.status).toBe(401);
  });

  it('returns the safe user object for a valid token', async () => {
    const { user, token } = await loginAs();

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toEqual({
      id: user.id,
      name: ACCOUNT.name,
      email: ACCOUNT.email,
      role: 'member',
      status: 'approved',
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.text).not.toMatch(/\$2[aby]\$/);
  });

  it('reflects a status changed since the token was issued', async () => {
    const { user, token } = await loginAs();

    await User.findByIdAndUpdate(user.id, { status: 'rejected' });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    // The token still claims "approved"; the database is what counts.
    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe('rejected');
  });

  it('returns 401 when the account no longer exists', async () => {
    const { user, token } = await loginAs();

    await User.findByIdAndDelete(user.id);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});

describe('requireRole', () => {
  const moderatorRoute = (token) => {
    const call = request(roleApp).get('/moderators-only');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  it('allows a permitted role through', async () => {
    const { token } = await loginAs({ role: 'administrator' });

    const response = await moderatorRoute(token);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('administrator');
  });

  it('rejects an insufficient role with 403', async () => {
    const { token } = await loginAs({ role: 'member' });

    const response = await moderatorRoute(token);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual([]);
  });

  it('rejects an unauthenticated caller with 401 before checking the role', async () => {
    const response = await moderatorRoute();

    expect(response.status).toBe(401);
  });

  it('reflects a role changed since the token was issued', async () => {
    const { user, token } = await loginAs({ role: 'administrator' });

    await User.findByIdAndUpdate(user.id, { role: 'member' });

    const response = await moderatorRoute(token);

    // The token still claims "administrator"; the demotion takes effect now.
    expect(response.status).toBe(403);
  });
});
