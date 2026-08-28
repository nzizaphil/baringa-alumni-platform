import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import User from '../src/models/User.js';
import { ACCOUNT_PENDING_CODE } from '../src/middleware/auth.middleware.js';
import {
  REGISTRATION_NOT_PENDING_CODE,
  SELF_REVIEW_FORBIDDEN_CODE,
} from '../src/controllers/admin.controller.js';
import {
  connectMemoryDatabase,
  clearMemoryDatabase,
  disconnectMemoryDatabase,
} from './helpers/memory-db.js';

// Same defaults as the other suites: keep the tests independent of any
// developer's local .env, and import `app` afterwards so it picks them up.
// Neither value is a real secret.
process.env.JWT_SECRET ||= 'test-only-signing-secret';
process.env.JWT_EXPIRES_IN ||= '1h';

const { default: app } = await import('../src/app.js');

const PASSWORD = 'Baringa2026';

const PENDING = '/api/admin/registrations/pending';
const approvePath = (id) => `/api/admin/registrations/${id}/approve`;
const rejectPath = (id) => `/api/admin/registrations/${id}/reject`;

/**
 * Create an account directly, bypassing registration.
 *
 * These suites are about what an administrator may do with an account, not
 * about how it came to exist, and the registration endpoint cannot produce an
 * administrator or an approved member anyway.
 */
async function createUser({
  name = 'Amina Uwase',
  email = 'amina.uwase@example.com',
  role = 'member',
  status = 'pending',
  association = 'former_student',
  studentNumber = 'n10428837',
  graduationYear = 2019,
  createdAt,
} = {}) {
  const user = new User({
    name,
    email,
    role,
    status,
    association,
    studentNumber,
    graduationYear,
    // The pre-save hook replaces this plaintext with its bcrypt digest.
    passwordHash: PASSWORD,
  });

  await user.save();

  if (createdAt) {
    // `timestamps: true` sets createdAt on save, so an explicit registration
    // date has to be written afterwards. Used to pin the queue's ordering.
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { createdAt: new Date(createdAt) } }
    );
  }

  return user;
}

/** Signs in as an existing account and returns its access token. */
async function tokenFor(email) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });

  expect(response.status).toBe(200);

  return response.body.data.token;
}

/** The approved administrator every one of these tests acts as. */
async function signInAsAdministrator() {
  const admin = await createUser({
    name: 'Grace Mutesi',
    email: 'grace.mutesi@baringa.edu',
    role: 'administrator',
    status: 'approved',
    association: 'current_lecturer',
    studentNumber: undefined,
    graduationYear: undefined,
  });

  return { admin, token: await tokenFor(admin.email) };
}

const authed = (call, token) =>
  token ? call.set('Authorization', `Bearer ${token}`) : call;

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

describe('GET /api/admin/registrations/pending', () => {
  it('lists the pending registrations with the details needed to review them', async () => {
    const { token } = await signInAsAdministrator();
    await createUser();

    const response = await authed(request(app).get(PENDING), token);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.registrations).toHaveLength(1);

    const [registration] = response.body.data.registrations;

    expect(registration).toMatchObject({
      name: 'Amina Uwase',
      email: 'amina.uwase@example.com',
      association: 'former_student',
      studentNumber: 'n10428837',
      graduationYear: 2019,
    });
    expect(typeof registration.id).toBe('string');
    expect(typeof registration.registeredAt).toBe('string');

    // The digest must not reach a response by any route, including this one.
    expect(registration).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('$2');
  });

  it('leaves out accounts that have already been decided', async () => {
    const { token } = await signInAsAdministrator();

    await createUser({ email: 'waiting@example.com', status: 'pending' });
    await createUser({ email: 'approved@example.com', status: 'approved' });
    await createUser({ email: 'rejected@example.com', status: 'rejected' });

    const response = await authed(request(app).get(PENDING), token);

    expect(response.status).toBe(200);

    const emails = response.body.data.registrations.map((entry) => entry.email);

    expect(emails).toEqual(['waiting@example.com']);
    expect(response.body.data.pagination.total).toBe(1);
  });

  it('drops an account out of the queue once it is approved', async () => {
    const { token } = await signInAsAdministrator();
    const applicant = await createUser();

    expect((await authed(request(app).get(PENDING), token)).body.data.registrations).toHaveLength(1);

    await authed(request(app).patch(approvePath(applicant.id)), token);

    const after = await authed(request(app).get(PENDING), token);

    expect(after.body.data.registrations).toEqual([]);
    expect(after.body.data.pagination.total).toBe(0);
  });

  it('sorts oldest first so the longest wait is at the top', async () => {
    const { token } = await signInAsAdministrator();

    await createUser({ email: 'newest@example.com', createdAt: '2026-03-01T09:00:00Z' });
    await createUser({ email: 'oldest@example.com', createdAt: '2026-01-01T09:00:00Z' });
    await createUser({ email: 'middle@example.com', createdAt: '2026-02-01T09:00:00Z' });

    const response = await authed(request(app).get(PENDING), token);

    expect(response.body.data.registrations.map((entry) => entry.email)).toEqual([
      'oldest@example.com',
      'middle@example.com',
      'newest@example.com',
    ]);
  });

  it('pages the queue and reports the total alongside the page', async () => {
    const { token } = await signInAsAdministrator();

    for (let index = 0; index < 5; index += 1) {
      await createUser({
        email: `applicant${index}@example.com`,
        createdAt: `2026-01-0${index + 1}T09:00:00Z`,
      });
    }

    const first = await authed(request(app).get(`${PENDING}?page=1&limit=2`), token);

    expect(first.status).toBe(200);
    expect(first.body.data.registrations.map((entry) => entry.email)).toEqual([
      'applicant0@example.com',
      'applicant1@example.com',
    ]);
    // The total counts the whole queue, not the page.
    expect(first.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });

    const last = await authed(request(app).get(`${PENDING}?page=3&limit=2`), token);

    expect(last.body.data.registrations.map((entry) => entry.email)).toEqual([
      'applicant4@example.com',
    ]);
  });

  it('defaults to the first page when no paging is asked for', async () => {
    const { token } = await signInAsAdministrator();
    await createUser();

    const response = await authed(request(app).get(PENDING), token);

    expect(response.body.data.pagination).toMatchObject({ page: 1, total: 1 });
    expect(response.body.data.pagination.limit).toBeGreaterThan(0);
  });

  it('rejects paging parameters that are not usable numbers with 400', async () => {
    const { token } = await signInAsAdministrator();

    const response = await authed(request(app).get(`${PENDING}?page=nonsense`), token);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors[0]).toMatchObject({ field: 'page' });
  });
});

describe('PATCH /api/admin/registrations/:id/approve', () => {
  it('approves a pending registration and records who decided it and when', async () => {
    const { admin, token } = await signInAsAdministrator();
    const applicant = await createUser();

    const before = Date.now();
    const response = await authed(request(app).patch(approvePath(applicant.id)), token);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toMatchObject({
      id: applicant.id,
      status: 'approved',
      approvedBy: admin.id,
    });

    const stored = await User.findById(applicant.id);

    expect(stored.status).toBe('approved');
    expect(String(stored.approvedBy)).toBe(admin.id);
    expect(stored.approvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.approvedAt.getTime()).toBeLessThanOrEqual(Date.now());
    // Approving grants no privilege: only the status moves.
    expect(stored.role).toBe('member');
  });

  it('opens the member-only routes to the approved account without a new sign-in', async () => {
    const { token: adminToken } = await signInAsAdministrator();
    const applicant = await createUser();
    const applicantToken = await tokenFor(applicant.email);

    const pending = await authed(request(app).get('/api/auth/me'), applicantToken);

    expect(pending.body.data.user.status).toBe('pending');

    await authed(request(app).patch(approvePath(applicant.id)), adminToken);

    // The token still claims "pending"; `requireAuth` re-reads the account.
    const approved = await authed(request(app).get('/api/auth/me'), applicantToken);

    expect(approved.body.data.user.status).toBe('approved');
  });

  it('refuses to approve an already-approved registration with 409', async () => {
    const { token } = await signInAsAdministrator();
    const applicant = await createUser();

    expect((await authed(request(app).patch(approvePath(applicant.id)), token)).status).toBe(200);

    const second = await authed(request(app).patch(approvePath(applicant.id)), token);

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.code).toBe(REGISTRATION_NOT_PENDING_CODE);
    expect(second.body.message).toMatch(/already been approved/i);
  });

  it('refuses to approve a rejected registration with 409', async () => {
    const { token } = await signInAsAdministrator();
    const applicant = await createUser({ status: 'rejected' });

    const response = await authed(request(app).patch(approvePath(applicant.id)), token);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(REGISTRATION_NOT_PENDING_CODE);
  });

  it('leaves the first decision in place when a second one is refused', async () => {
    const { admin, token } = await signInAsAdministrator();
    const applicant = await createUser();

    await authed(request(app).patch(approvePath(applicant.id)), token);

    const decided = await User.findById(applicant.id);

    await authed(request(app).patch(rejectPath(applicant.id)), token);

    const afterwards = await User.findById(applicant.id);

    expect(afterwards.status).toBe('approved');
    expect(String(afterwards.approvedBy)).toBe(admin.id);
    expect(afterwards.approvedAt.getTime()).toBe(decided.approvedAt.getTime());
  });

  it('answers 404 when no account has that id', async () => {
    const { token } = await signInAsAdministrator();
    const missing = new mongoose.Types.ObjectId().toString();

    const response = await authed(request(app).patch(approvePath(missing)), token);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/no registration/i);
  });

  it('answers 400 for an id that is not a valid ObjectId', async () => {
    const { token } = await signInAsAdministrator();

    const response = await authed(request(app).patch(approvePath('not-an-object-id')), token);

    // A cast error would otherwise surface as a 500.
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors[0]).toMatchObject({ field: 'id' });
  });
});

describe('PATCH /api/admin/registrations/:id/reject', () => {
  it('rejects a pending registration and records who decided it and when', async () => {
    const { admin, token } = await signInAsAdministrator();
    const applicant = await createUser();

    const response = await authed(request(app).patch(rejectPath(applicant.id)), token);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      id: applicant.id,
      status: 'rejected',
      approvedBy: admin.id,
    });

    const stored = await User.findById(applicant.id);

    expect(stored.status).toBe('rejected');
    // The field records who reviewed the account, whichever way it went.
    expect(String(stored.approvedBy)).toBe(admin.id);
    expect(stored.approvedAt).toBeInstanceOf(Date);
  });

  it('refuses to reject an already-rejected registration with 409', async () => {
    const { token } = await signInAsAdministrator();
    const applicant = await createUser();

    await authed(request(app).patch(rejectPath(applicant.id)), token);

    const second = await authed(request(app).patch(rejectPath(applicant.id)), token);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe(REGISTRATION_NOT_PENDING_CODE);
  });

  it('answers 404 and 400 the same way approval does', async () => {
    const { token } = await signInAsAdministrator();
    const missing = new mongoose.Types.ObjectId().toString();

    expect((await authed(request(app).patch(rejectPath(missing)), token)).status).toBe(404);
    expect((await authed(request(app).patch(rejectPath('nope')), token)).status).toBe(400);
  });
});

describe('an administrator cannot decide their own registration', () => {
  it('refuses an approved administrator approving themselves with 403', async () => {
    const { admin, token } = await signInAsAdministrator();

    const response = await authed(request(app).patch(approvePath(admin.id)), token);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    // Not the 409 that an already-decided account would give: this is refused
    // for being self-review, not for the state the account happens to be in.
    expect(response.body.code).toBe(SELF_REVIEW_FORBIDDEN_CODE);
    expect(response.body.message).toMatch(/your own registration/i);
  });

  it('refuses an approved administrator rejecting themselves with 403', async () => {
    const { admin, token } = await signInAsAdministrator();

    const response = await authed(request(app).patch(rejectPath(admin.id)), token);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(SELF_REVIEW_FORBIDDEN_CODE);
    expect((await User.findById(admin.id)).status).toBe('approved');
  });

  it('refuses the same id in upper-case hex, which addresses the same account', async () => {
    const { admin, token } = await signInAsAdministrator();

    // MongoDB reads hex case-insensitively, so this is the caller's own id
    // wearing a different string. A string comparison would let it through.
    const shouted = admin.id.toUpperCase();

    expect(shouted).not.toBe(admin.id);

    const response = await authed(request(app).patch(approvePath(shouted)), token);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(SELF_REVIEW_FORBIDDEN_CODE);
  });

  it('holds even for an administrator whose own registration is still pending', async () => {
    const unvetted = await createUser({
      email: 'unvetted.admin@example.com',
      role: 'administrator',
      status: 'pending',
    });
    const token = await tokenFor(unvetted.email);

    const response = await authed(request(app).patch(approvePath(unvetted.id)), token);

    // Turned away by `requireApproved` before the controller is reached, so the
    // code here is ACCOUNT_PENDING rather than SELF_REVIEW_FORBIDDEN. The
    // controller check behind it is what keeps this shut if the guard chain is
    // ever reordered; either way the account does not approve itself.
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
    expect((await User.findById(unvetted.id)).status).toBe('pending');
  });

  it('still lets an administrator decide somebody else', async () => {
    const { admin, token } = await signInAsAdministrator();
    const applicant = await createUser();

    const response = await authed(request(app).patch(approvePath(applicant.id)), token);

    expect(response.status).toBe(200);
    expect(response.body.data.user.approvedBy).toBe(admin.id);
  });
});

describe('who may reach these routes', () => {
  /** Every administrator route, so each case can assert against all three. */
  const everyRoute = (id) => [
    () => request(app).get(PENDING),
    () => request(app).patch(approvePath(id)),
    () => request(app).patch(rejectPath(id)),
  ];

  it('turns an unauthenticated caller away with 401', async () => {
    const applicant = await createUser();

    for (const route of everyRoute(applicant.id)) {
      const response = await route();

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      // 401s are deliberately vague and carry no branching code.
      expect(response.body).not.toHaveProperty('code');
    }

    // Nothing was decided along the way.
    expect((await User.findById(applicant.id)).status).toBe('pending');
  });

  it('turns an approved member away with 403', async () => {
    const applicant = await createUser();
    await createUser({ email: 'member@example.com', role: 'member', status: 'approved' });
    const token = await tokenFor('member@example.com');

    for (const route of everyRoute(applicant.id)) {
      const response = await authed(route(), token);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      // Turned away on privilege, not on status: no account code on this one.
      expect(response.body).not.toHaveProperty('code');
    }

    expect((await User.findById(applicant.id)).status).toBe('pending');
  });

  it('turns an approved moderator away with 403', async () => {
    const applicant = await createUser();
    await createUser({ email: 'moderator@example.com', role: 'moderator', status: 'approved' });
    const token = await tokenFor('moderator@example.com');

    for (const route of everyRoute(applicant.id)) {
      expect((await authed(route(), token)).status).toBe(403);
    }

    expect((await User.findById(applicant.id)).status).toBe('pending');
  });

  it('turns an administrator who is not approved yet away with 403 ACCOUNT_PENDING', async () => {
    const applicant = await createUser();
    await createUser({
      email: 'unvetted.admin@example.com',
      role: 'administrator',
      status: 'pending',
    });
    const token = await tokenFor('unvetted.admin@example.com');

    for (const route of everyRoute(applicant.id)) {
      const response = await authed(route(), token);

      // Privilege does not exempt an account from being validated itself,
      // least of all on the routes that do the validating.
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
    }

    expect((await User.findById(applicant.id)).status).toBe('pending');
  });
});
