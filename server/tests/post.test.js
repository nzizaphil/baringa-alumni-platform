import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import User from '../src/models/User.js';
import Post, { MAX_POST_LENGTH } from '../src/models/Post.js';
import {
  ACCOUNT_PENDING_CODE,
  ACCOUNT_REJECTED_CODE,
} from '../src/middleware/auth.middleware.js';
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
const POSTS = '/api/posts';

/** Create an account directly, as the other suites do. */
async function createUser({
  name = 'Amina Uwase',
  email = 'amina.uwase@example.com',
  role = 'member',
  status = 'approved',
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

/**
 * Write a post directly, bypassing the endpoint.
 *
 * The feed tests are about what comes back, not about how a post came to
 * exist, and `createdAt` has to be pinned to test ordering - which the endpoint
 * offers no way to do.
 */
async function createPost({ author, body = 'A professional update.', hidden = false, createdAt }) {
  const post = new Post({ authorId: author._id, body, hidden });

  if (createdAt) {
    post.createdAt = new Date(createdAt);
  }

  // `timestamps: false` is what lets an explicit createdAt survive the save;
  // Mongoose would otherwise stamp it with the moment it was written.
  await post.save({ timestamps: !createdAt });

  return post;
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

describe('POST /api/posts', () => {
  it('lets an approved member publish a post and answers 201 with the author', async () => {
    const member = await createUser();
    const token = await tokenFor(member.email);

    const response = await authed(request(app).post(POSTS), token).send({
      body: 'Started a new role at the university teaching hospital.',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.post).toMatchObject({
      body: 'Started a new role at the university teaching hospital.',
      visibility: 'members_only',
      author: { id: member.id, name: 'Amina Uwase', role: 'member' },
    });
    expect(response.body.data.post.id).toEqual(expect.any(String));
    expect(response.body.data.post.createdAt).toEqual(expect.any(String));

    // Persisted, and attributed to the caller rather than to anything they sent.
    const stored = await Post.findById(response.body.data.post.id);

    expect(String(stored.authorId)).toBe(member.id);
    expect(stored.hidden).toBe(false);
  });

  it('records the caller as the author, ignoring any author sent in the body', async () => {
    const member = await createUser();
    const impostor = await createUser({
      name: 'Eric Habimana',
      email: 'eric.habimana@example.com',
    });

    const response = await authed(request(app).post(POSTS), await tokenFor(member.email)).send({
      body: 'Attributed to whoever is signed in.',
      authorId: impostor.id,
      hidden: true,
      visibility: 'public',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.post.author.id).toBe(member.id);

    const stored = await Post.findById(response.body.data.post.id);

    expect(String(stored.authorId)).toBe(member.id);
    // Neither flag is read from the request in this phase.
    expect(stored.hidden).toBe(false);
    expect(stored.visibility).toBe('members_only');
  });

  it('trims the body, so whitespace is not content', async () => {
    const member = await createUser();

    const response = await authed(request(app).post(POSTS), await tokenFor(member.email)).send({
      body: '   Spaced out.   ',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.post.body).toBe('Spaced out.');
  });

  it('answers 422 with a field-level message for an empty body', async () => {
    const member = await createUser();
    const token = await tokenFor(member.email);

    for (const body of ['', '   ']) {
      const response = await authed(request(app).post(POSTS), token).send({ body });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContainEqual({
        field: 'body',
        message: 'Post body is required',
      });
    }

    // Missing altogether, not merely blank.
    const missing = await authed(request(app).post(POSTS), token).send({});

    expect(missing.status).toBe(422);
    expect(missing.body.errors[0]).toMatchObject({ field: 'body' });

    await expect(Post.countDocuments({})).resolves.toBe(0);
  });

  it(`answers 422 for a body over ${MAX_POST_LENGTH} characters`, async () => {
    const member = await createUser();
    const token = await tokenFor(member.email);

    const tooLong = await authed(request(app).post(POSTS), token).send({
      body: 'a'.repeat(MAX_POST_LENGTH + 1),
    });

    expect(tooLong.status).toBe(422);
    expect(tooLong.body.errors).toContainEqual({
      field: 'body',
      message: `Post body must be ${MAX_POST_LENGTH} characters or fewer`,
    });

    // The limit itself is allowed: the message says "or fewer".
    const atLimit = await authed(request(app).post(POSTS), token).send({
      body: 'a'.repeat(MAX_POST_LENGTH),
    });

    expect(atLimit.status).toBe(201);
    await expect(Post.countDocuments({})).resolves.toBe(1);
  });

  it('answers 403 ACCOUNT_PENDING for a member awaiting review', async () => {
    const pending = await createUser({
      email: 'pending@example.com',
      status: 'pending',
    });

    const response = await authed(
      request(app).post(POSTS),
      await tokenFor(pending.email)
    ).send({ body: 'Not yet.' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
    await expect(Post.countDocuments({})).resolves.toBe(0);
  });

  it('answers 403 ACCOUNT_REJECTED for a member who was turned down', async () => {
    const rejected = await createUser({
      email: 'rejected@example.com',
      status: 'rejected',
    });

    const response = await authed(
      request(app).post(POSTS),
      await tokenFor(rejected.email)
    ).send({ body: 'Not ever.' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_REJECTED_CODE);
  });

  it('answers 401 for an unauthenticated request', async () => {
    const response = await request(app).post(POSTS).send({ body: 'Anonymous.' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    // The 401 is deliberately vague: no `code` distinguishes it.
    expect(response.body.code).toBeUndefined();
    await expect(Post.countDocuments({})).resolves.toBe(0);
  });
});

describe('GET /api/posts', () => {
  it('returns posts newest first', async () => {
    const member = await createUser();

    await createPost({ author: member, body: 'Oldest', createdAt: '2026-01-01T09:00:00.000Z' });
    await createPost({ author: member, body: 'Newest', createdAt: '2026-03-01T09:00:00.000Z' });
    await createPost({ author: member, body: 'Middle', createdAt: '2026-02-01T09:00:00.000Z' });

    const response = await authed(request(app).get(POSTS), await tokenFor(member.email));

    expect(response.status).toBe(200);
    expect(response.body.data.posts.map((post) => post.body)).toEqual([
      'Newest',
      'Middle',
      'Oldest',
    ]);
  });

  it('omits a hidden post from the feed', async () => {
    const member = await createUser();

    await createPost({ author: member, body: 'Visible' });
    const buried = await createPost({ author: member, body: 'Hidden', hidden: true });

    const response = await authed(request(app).get(POSTS), await tokenFor(member.email));

    expect(response.status).toBe(200);
    expect(response.body.data.posts.map((post) => post.body)).toEqual(['Visible']);
    // Still in the database - hiding is not deleting.
    await expect(Post.findById(buried._id)).resolves.not.toBeNull();
  });

  it("carries the author's name and role, and never their email or digest", async () => {
    const author = await createUser({
      name: 'Grace Mutesi',
      email: 'grace.mutesi@baringa.edu',
      role: 'moderator',
    });
    const reader = await createUser({
      name: 'Eric Habimana',
      email: 'eric.habimana@example.com',
    });

    await createPost({ author, body: 'Written by a moderator.' });

    const response = await authed(request(app).get(POSTS), await tokenFor(reader.email));

    expect(response.body.data.posts[0].author).toEqual({
      id: author.id,
      name: 'Grace Mutesi',
      role: 'moderator',
    });

    // Belt and braces: neither secret appears anywhere in the payload.
    const raw = JSON.stringify(response.body);

    expect(raw).not.toContain('grace.mutesi@baringa.edu');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('$2b$');
  });

  it('pages with a cursor, without repeating or skipping a post', async () => {
    const member = await createUser();

    for (let index = 0; index < 5; index += 1) {
      await createPost({
        author: member,
        body: `Post ${index}`,
        createdAt: `2026-01-0${index + 1}T09:00:00.000Z`,
      });
    }

    const token = await tokenFor(member.email);

    const first = await authed(request(app).get(`${POSTS}?limit=2`), token);

    expect(first.body.data.posts.map((post) => post.body)).toEqual(['Post 4', 'Post 3']);
    expect(first.body.data.pagination).toMatchObject({ limit: 2, hasMore: true });
    expect(first.body.data.pagination.nextCursor).toEqual(expect.any(String));

    const second = await authed(
      request(app).get(`${POSTS}?limit=2&cursor=${encodeURIComponent(first.body.data.pagination.nextCursor)}`),
      token
    );

    expect(second.body.data.posts.map((post) => post.body)).toEqual(['Post 2', 'Post 1']);
    expect(second.body.data.pagination.hasMore).toBe(true);

    const third = await authed(
      request(app).get(`${POSTS}?limit=2&cursor=${encodeURIComponent(second.body.data.pagination.nextCursor)}`),
      token
    );

    // The last page: one post, no more, and nothing to continue with.
    expect(third.body.data.posts.map((post) => post.body)).toEqual(['Post 0']);
    expect(third.body.data.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('answers 400 for an unusable limit or a cursor that is not a position', async () => {
    const member = await createUser();
    const token = await tokenFor(member.email);

    const badLimit = await authed(request(app).get(`${POSTS}?limit=0`), token);

    expect(badLimit.status).toBe(400);
    expect(badLimit.body.errors[0]).toMatchObject({ field: 'limit' });

    const badCursor = await authed(request(app).get(`${POSTS}?cursor=not-a-cursor`), token);

    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('answers 403 ACCOUNT_PENDING for a member awaiting review', async () => {
    const author = await createUser();
    await createPost({ author, body: 'Members only.' });

    const pending = await createUser({
      email: 'pending@example.com',
      status: 'pending',
    });

    const response = await authed(request(app).get(POSTS), await tokenFor(pending.email));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ACCOUNT_PENDING_CODE);
  });

  it('answers 401 for an unauthenticated request', async () => {
    const response = await request(app).get(POSTS);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('answers with an empty feed rather than an error when nobody has posted', async () => {
    const member = await createUser();

    const response = await authed(request(app).get(POSTS), await tokenFor(member.email));

    expect(response.status).toBe(200);
    expect(response.body.data.posts).toEqual([]);
    expect(response.body.data.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
