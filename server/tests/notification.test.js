import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import User from '../src/models/User.js';
import Notification, { NOTIFICATION_TYPES } from '../src/models/Notification.js';
import { NOTIFICATION_NOT_FOUND_CODE } from '../src/controllers/notification.controller.js';
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

const NOTIFICATIONS = '/api/notifications';
const readPath = (id) => `/api/notifications/${id}/read`;
const approvePath = (id) => `/api/admin/registrations/${id}/approve`;
const rejectPath = (id) => `/api/admin/registrations/${id}/reject`;

/** Create an account directly, as `admin.approval.test.js` does. */
async function createUser({
  name = 'Amina Uwase',
  email = 'amina.uwase@example.com',
  role = 'member',
  status = 'pending',
  association = 'former_student',
  studentNumber = 'n10428837',
  graduationYear = 2019,
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

/** The approved administrator whose approvals raise the notifications. */
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

describe('approving a registration raises a notification', () => {
  it('creates exactly one MEMBERSHIP_APPROVED notification for the approved member', async () => {
    const { token: adminToken } = await signInAsAdministrator();
    const applicant = await createUser();

    const response = await authed(
      request(app).patch(approvePath(applicant.id)),
      adminToken
    );

    expect(response.status).toBe(200);

    const notifications = await Notification.find({});

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      readAt: null,
    });
    // Addressed to the applicant, not to the administrator who acted.
    expect(String(notifications[0].recipientId)).toBe(applicant.id);
    expect(notifications[0].message).toBeTruthy();
  });

  it('does not raise a second notification when the approval is retried', async () => {
    const { token: adminToken } = await signInAsAdministrator();
    const applicant = await createUser();

    const first = await authed(request(app).patch(approvePath(applicant.id)), adminToken);
    const second = await authed(request(app).patch(approvePath(applicant.id)), adminToken);

    expect(first.status).toBe(200);
    // The account is no longer pending, so the second decision is refused and
    // never reaches the notification.
    expect(second.status).toBe(409);

    await expect(Notification.countDocuments({})).resolves.toBe(1);
  });

  it('raises no notification for a rejection', async () => {
    const { token: adminToken } = await signInAsAdministrator();
    const applicant = await createUser();

    const response = await authed(
      request(app).patch(rejectPath(applicant.id)),
      adminToken
    );

    expect(response.status).toBe(200);
    await expect(Notification.countDocuments({})).resolves.toBe(0);
  });
});

describe('GET /api/notifications', () => {
  it('returns the caller\'s own notifications newest first, with the unread count', async () => {
    const member = await createUser({ status: 'approved' });
    const token = await tokenFor(member.email);

    const older = await Notification.create({
      recipientId: member._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: 'Older',
    });
    const newer = await Notification.create({
      recipientId: member._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: 'Newer',
      readAt: new Date(),
    });

    // `timestamps: true` sets createdAt on insert, so an explicit order has to
    // be written afterwards.
    await Notification.collection.updateOne(
      { _id: older._id },
      { $set: { createdAt: new Date('2026-01-01T00:00:00.000Z') } }
    );
    await Notification.collection.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date('2026-02-01T00:00:00.000Z') } }
    );

    const response = await authed(request(app).get(NOTIFICATIONS), token);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.notifications.map((n) => n.message)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(response.body.data.unreadCount).toBe(1);
    // The recipient is always the caller, so it is not echoed back.
    expect(response.body.data.notifications[0]).not.toHaveProperty('recipientId');
  });

  it('never returns another user\'s notifications', async () => {
    const member = await createUser({ status: 'approved' });
    const other = await createUser({
      name: 'Eric Habimana',
      email: 'eric.habimana@example.com',
      status: 'approved',
    });

    await Notification.create({
      recipientId: other._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: "Somebody else's notification",
    });

    const response = await authed(
      request(app).get(NOTIFICATIONS),
      await tokenFor(member.email)
    );

    expect(response.status).toBe(200);
    expect(response.body.data.notifications).toEqual([]);
    expect(response.body.data.unreadCount).toBe(0);
  });

  it('refuses a caller with no token', async () => {
    const response = await request(app).get(NOTIFICATIONS);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  it('sets readAt on the caller\'s own notification', async () => {
    const member = await createUser({ status: 'approved' });
    const token = await tokenFor(member.email);

    const notification = await Notification.create({
      recipientId: member._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: 'You can now post and connect with the community.',
    });

    expect(notification.readAt).toBeNull();

    const response = await authed(request(app).patch(readPath(notification.id)), token);

    expect(response.status).toBe(200);
    expect(response.body.data.notification.readAt).toEqual(expect.any(String));

    const stored = await Notification.findById(notification._id);

    expect(stored.readAt).toBeInstanceOf(Date);
    // And the count the header reads follows it down.
    const list = await authed(request(app).get(NOTIFICATIONS), token);
    expect(list.body.data.unreadCount).toBe(0);
  });

  it('is idempotent: a second call keeps the first timestamp', async () => {
    const member = await createUser({ status: 'approved' });
    const token = await tokenFor(member.email);

    const notification = await Notification.create({
      recipientId: member._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: 'You can now post and connect with the community.',
    });

    const first = await authed(request(app).patch(readPath(notification.id)), token);
    const second = await authed(request(app).patch(readPath(notification.id)), token);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.notification.readAt).toBe(first.body.data.notification.readAt);
  });

  it("answers 404, not 403, for another user's notification, and leaves it unread", async () => {
    const member = await createUser({ status: 'approved' });
    const other = await createUser({
      name: 'Eric Habimana',
      email: 'eric.habimana@example.com',
      status: 'approved',
    });

    const theirs = await Notification.create({
      recipientId: other._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: "Somebody else's notification",
    });

    const response = await authed(
      request(app).patch(readPath(theirs.id)),
      await tokenFor(member.email)
    );

    // 404 rather than 403: a 403 would confirm the id names a real record.
    expect(response.status).toBe(404);
    expect(response.body.code).toBe(NOTIFICATION_NOT_FOUND_CODE);

    const stored = await Notification.findById(theirs._id);

    expect(stored.readAt).toBeNull();
  });

  it('answers 404 for an id that belongs to nobody', async () => {
    const member = await createUser({ status: 'approved' });

    const response = await authed(
      request(app).patch(readPath(new mongoose.Types.ObjectId().toString())),
      await tokenFor(member.email)
    );

    // Byte-identical to the answer above, which is the point of the 404.
    expect(response.status).toBe(404);
    expect(response.body.code).toBe(NOTIFICATION_NOT_FOUND_CODE);
  });

  it('answers 400 for a malformed id rather than letting a cast error reach the handler', async () => {
    const member = await createUser({ status: 'approved' });

    const response = await authed(
      request(app).patch(readPath('not-an-object-id')),
      await tokenFor(member.email)
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors[0]).toMatchObject({ field: 'id' });
  });

  it('refuses a caller with no token', async () => {
    const member = await createUser({ status: 'approved' });

    const notification = await Notification.create({
      recipientId: member._id,
      type: NOTIFICATION_TYPES.MEMBERSHIP_APPROVED,
      message: 'You can now post and connect with the community.',
    });

    const response = await request(app).patch(readPath(notification.id));

    expect(response.status).toBe(401);
    await expect(
      Notification.findById(notification._id).then((n) => n.readAt)
    ).resolves.toBeNull();
  });
});

describe('the approved member reads their own approval end to end', () => {
  it('sees one unread notification after approval and none once it is read', async () => {
    const { token: adminToken } = await signInAsAdministrator();
    const applicant = await createUser();

    await authed(request(app).patch(approvePath(applicant.id)), adminToken);

    // The member's token predates the approval; the account is re-read per
    // request, so no new sign-in is needed.
    const memberToken = await tokenFor(applicant.email);

    const before = await authed(request(app).get(NOTIFICATIONS), memberToken);

    expect(before.body.data.unreadCount).toBe(1);
    expect(before.body.data.notifications[0].type).toBe(
      NOTIFICATION_TYPES.MEMBERSHIP_APPROVED
    );

    await authed(
      request(app).patch(readPath(before.body.data.notifications[0].id)),
      memberToken
    );

    const after = await authed(request(app).get(NOTIFICATIONS), memberToken);

    expect(after.body.data.unreadCount).toBe(0);
    expect(after.body.data.notifications).toHaveLength(1);
  });
});
