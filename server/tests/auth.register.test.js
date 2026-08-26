import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import User from '../src/models/User.js';
import {
  connectMemoryDatabase,
  clearMemoryDatabase,
  disconnectMemoryDatabase,
} from './helpers/memory-db.js';

const VALID_REGISTRATION = {
  name: 'Amina Uwase',
  email: 'amina.uwase@example.com',
  password: 'Baringa2026',
  association: 'current_student',
  studentNumber: 'n10428837',
};

const registerRequest = (overrides = {}) =>
  request(app)
    .post('/api/auth/register')
    .send({ ...VALID_REGISTRATION, ...overrides });

const fieldsIn = (response) => response.body.errors.map((error) => error.field);

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

describe('POST /api/auth/register', () => {
  it('creates the account and returns 201 with a pending status', async () => {
    const response = await registerRequest();

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      name: VALID_REGISTRATION.name,
      email: VALID_REGISTRATION.email,
      association: VALID_REGISTRATION.association,
      status: 'pending',
    });
    expect(typeof response.body.data.id).toBe('string');
  });

  it('never returns the password or its hash', async () => {
    const response = await registerRequest();

    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.body.data).not.toHaveProperty('password');
    expect(JSON.stringify(response.body)).not.toContain(VALID_REGISTRATION.password);
  });

  it('stores the account as a pending member', async () => {
    await registerRequest();

    const user = await User.findOne({ email: VALID_REGISTRATION.email });

    expect(user.status).toBe('pending');
    expect(user.role).toBe('member');
  });

  it('rejects a duplicate email address with 409', async () => {
    await registerRequest();

    const response = await registerRequest({ name: 'Someone Else' });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/already exists/i);
    expect(await User.countDocuments()).toBe(1);
  });

  it('treats email addresses case-insensitively when detecting duplicates', async () => {
    await registerRequest();

    const response = await registerRequest({ email: 'Amina.Uwase@Example.com' });

    expect(response.status).toBe(409);
  });

  it('rejects an invalid email format with 422', async () => {
    const response = await registerRequest({ email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(fieldsIn(response)).toContain('email');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a weak password with 422', async () => {
    const response = await registerRequest({ password: 'short1' });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('password');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a password with no number with 422', async () => {
    const response = await registerRequest({ password: 'alphabetsonly' });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('password');
  });

  it('does not echo the rejected password back to the client', async () => {
    const password = 'short1';
    const response = await registerRequest({ password });

    expect(JSON.stringify(response.body)).not.toContain(password);
  });

  it('rejects an association outside the allowed values with 422', async () => {
    const response = await registerRequest({ association: 'visiting_professor' });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('association');
  });

  it('rejects a former student with no graduation year with 422', async () => {
    const response = await registerRequest({
      association: 'former_student',
      studentNumber: 'n10428837',
      graduationYear: undefined,
    });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('graduationYear');
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects a graduation year in the future with 422', async () => {
    const response = await registerRequest({
      association: 'former_student',
      studentNumber: 'n10428837',
      graduationYear: new Date().getFullYear() + 1,
    });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('graduationYear');
  });

  it('accepts a former student with a valid graduation year', async () => {
    const response = await registerRequest({
      association: 'former_student',
      studentNumber: 'n10428837',
      graduationYear: 2019,
    });

    expect(response.status).toBe(201);

    const user = await User.findOne({ email: VALID_REGISTRATION.email });
    expect(user.graduationYear).toBe(2019);
  });

  it('rejects a current student with no student number with 422', async () => {
    const response = await registerRequest({ studentNumber: undefined });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toContain('studentNumber');
  });

  it('accepts a lecturer with neither a student number nor a graduation year', async () => {
    const response = await registerRequest({
      association: 'current_lecturer',
      studentNumber: undefined,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.association).toBe('current_lecturer');
  });

  it('reports every invalid field at once', async () => {
    const response = await registerRequest({
      name: '   ',
      email: 'not-an-email',
      password: 'weak',
    });

    expect(response.status).toBe(422);
    expect(fieldsIn(response)).toEqual(
      expect.arrayContaining(['name', 'email', 'password'])
    );
  });
});

describe('password storage', () => {
  it('persists a bcrypt hash rather than the submitted plaintext', async () => {
    await registerRequest();

    const user = await User.findOne({ email: VALID_REGISTRATION.email }).select(
      '+passwordHash'
    );

    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toBe(VALID_REGISTRATION.password);
    // bcrypt digest at cost factor 12.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('excludes the hash from queries unless it is explicitly selected', async () => {
    await registerRequest();

    const user = await User.findOne({ email: VALID_REGISTRATION.email });

    expect(user.passwordHash).toBeUndefined();
  });

  it('comparePassword accepts the real password and rejects a wrong one', async () => {
    await registerRequest();

    const user = await User.findOne({ email: VALID_REGISTRATION.email }).select(
      '+passwordHash'
    );

    expect(await user.comparePassword(VALID_REGISTRATION.password)).toBe(true);
    expect(await user.comparePassword('WrongPassword1')).toBe(false);
  });
});
