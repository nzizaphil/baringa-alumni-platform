#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import User from '../models/User.js';
import { connectDatabase } from '../config/database.js';

/**
 * Seed a development database with enough accounts to exercise the
 * administrator dashboard and the member feed by hand.
 *
 *   cd server && SEED_PASSWORD='<something>' npm run seed:dev
 *
 * This is a development convenience, not part of the product. It refuses to run
 * when NODE_ENV is `production`, so it cannot be pointed at the deployed
 * instance even by accident - see `assertNotProduction` below.
 *
 * It is not `seedAdmin.js` and does not overlap with it. That script provisions
 * the one privileged account the platform cannot start without; this one
 * populates the queue that account reviews. The administrator it created is
 * never touched here: every deletion is scoped to the `@seed.local` domain.
 *
 * Accounts are created through the Mongoose model, never by writing to the
 * collection, so the pre-save hook hashes the password by the same code path a
 * real registration uses and every document is schema-valid.
 *
 * The password is never printed, logged, or included in an error message.
 */

/**
 * The domain that marks an account as disposable.
 *
 * Everything this script creates carries it, and everything this script deletes
 * is matched on it. That is the whole safety story for re-running: seeded data
 * is identifiable by address, so a re-run can clear its own previous set
 * without going near a genuine account.
 */
const SEED_EMAIL_DOMAIN = 'seed.local';
const SEED_EMAIL_PATTERN = `*@${SEED_EMAIL_DOMAIN}`;

/** Anchored so it matches the domain at the end of an address, not inside one. */
const SEED_EMAIL_MATCH = new RegExp(`@${SEED_EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');

/** Spread across the past fortnight so feed ordering is visibly testable. */
const POST_WINDOW_DAYS = 14;

/**
 * Raised when the script is asked to run against a production environment.
 * Carries no detail beyond the refusal: there is nothing to diagnose.
 */
export class ProductionRefusedError extends Error {
  constructor(nodeEnv) {
    super(
      `Refusing to seed development data: NODE_ENV is "${nodeEnv}". ` +
        'This script is for development databases only.'
    );
    this.name = 'ProductionRefusedError';
  }
}

/** Raised when SEED_PASSWORD is absent or blank. Never carries the value. */
export class MissingSeedPasswordError extends Error {
  constructor() {
    super(
      'Cannot seed development data: SEED_PASSWORD is not set. ' +
        'Set it in the environment, or in server/.env, and re-run.'
    );
    this.name = 'MissingSeedPasswordError';
  }
}

/**
 * Refuse to run in production.
 *
 * Checked before anything connects, so a production run cannot get as far as
 * opening a connection, let alone deleting a record. The comparison is
 * case-insensitive and trimmed: `NODE_ENV=Production ` is plainly a production
 * instance, and a guard that let it through on a technicality would be worse
 * than no guard, because it would be trusted.
 *
 * @throws {ProductionRefusedError}
 */
export function assertNotProduction(env = process.env) {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === 'production') {
    throw new ProductionRefusedError(env.NODE_ENV.trim());
  }
}

/**
 * Read the shared account password out of the environment.
 *
 * There is no default and no fallback, which is the point: a password that does
 * not exist in the source cannot be committed, and every seeded account is
 * therefore only as reachable as the developer's own `.env`.
 *
 * A variable that is present but blank counts as unset - an empty
 * `SEED_PASSWORD=` in a `.env` is a line somebody meant to fill in. The value is
 * returned exactly as given, never trimmed: trimming would quietly seed
 * accounts with a password that is not the one the developer set.
 *
 * @throws {MissingSeedPasswordError}
 */
export function readSeedPasswordFromEnv(env = process.env) {
  if (!env.SEED_PASSWORD?.trim()) {
    throw new MissingSeedPasswordError();
  }

  return env.SEED_PASSWORD;
}

/** `Chantal Ingabire` -> `chantal.ingabire@seed.local`. */
function seedEmail(name) {
  const local = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');

  return `${local}@${SEED_EMAIL_DOMAIN}`;
}

/**
 * The people this script invents.
 *
 * Each group spreads across all four association types so the dashboard shows a
 * realistic mix, and each carries exactly the fields its association calls for:
 * a student number for current and former students, and a graduation year for
 * former students only. That mirrors the conditional rules in
 * `validators/auth.validator.js`, so every seeded account is one that could
 * have come through the registration form.
 */
const PENDING_MEMBERS = [
  { name: 'Chantal Ingabire', association: 'current_student', studentNumber: 'n11204471' },
  { name: 'Eric Habimana', association: 'former_student', studentNumber: 'n09873321', graduationYear: 2018 },
  { name: 'Solange Mukamana', association: 'current_lecturer' },
  { name: 'Patrick Nsengimana', association: 'former_lecturer' },
  { name: 'Diane Umutoni', association: 'former_student', studentNumber: 'n10552208', graduationYear: 2021 },
];

const APPROVED_MEMBERS = [
  { name: 'Jean Bosco Rwema', association: 'current_student', studentNumber: 'n11337742' },
  { name: 'Aline Kayitesi', association: 'former_student', studentNumber: 'n08221190', graduationYear: 2015 },
  { name: 'Emmanuel Gatera', association: 'current_lecturer' },
  { name: 'Beatrice Nyirahabimana', association: 'former_lecturer' },
  { name: 'Olivier Mugisha', association: 'former_student', studentNumber: 'n10014499', graduationYear: 2020 },
];

const REJECTED_MEMBERS = [
  { name: 'Claude Bizimana', association: 'current_student', studentNumber: 'n11998801' },
  { name: 'Josiane Uwimana', association: 'former_student', studentNumber: 'n07443320', graduationYear: 2012 },
  { name: 'Theogene Ndayisaba', association: 'current_lecturer' },
  { name: 'Marie Claire Mukandayisenga', association: 'former_lecturer' },
  { name: 'Fabrice Twagirimana', association: 'former_student', studentNumber: 'n10778812', graduationYear: 2022 },
];

/**
 * Moderators are created directly because nothing in the application grants the
 * role: `ADMIN-5` (BAP-24) is Sprint 2 work. They exist so `requireRole` can be
 * verified by hand to refuse a moderator on the administrator-only routes -
 * which is a case no other seeded account can produce.
 */
const MODERATORS = [
  { name: 'Yvette Mukashema', association: 'former_student', studentNumber: 'n09110034', graduationYear: 2017 },
  { name: 'Innocent Rugamba', association: 'current_lecturer' },
  { name: 'Sandrine Ayinkamiye', association: 'former_lecturer' },
];

/**
 * Six updates for the feed, oldest first. `daysAgo` spreads them across the past
 * fortnight so ordering is something a developer can see rather than infer, and
 * `authorIndex` points into the approved members above - a post can only be
 * written by an account that is allowed to act.
 */
const POSTS = [
  { authorIndex: 1, daysAgo: 13, content: 'Wrapped up my first year leading the data engineering team at Kigali Analytics. Happy to talk to any recent graduates thinking about that path.' },
  { authorIndex: 2, daysAgo: 11, content: 'The Faculty of Computing is opening applications for the industry mentorship programme next month. Alumni willing to mentor, please get in touch.' },
  { authorIndex: 4, daysAgo: 8, content: 'Six years since graduation and I have just moved back to Kigali to start a civil engineering consultancy. Looking to hire two junior engineers.' },
  { authorIndex: 0, daysAgo: 5, content: 'Final year project accepted for the East African Software Symposium. Grateful to everyone in the alumni network who reviewed our draft.' },
  { authorIndex: 3, daysAgo: 2, content: 'Retired from lecturing last semester but still supervising two postgraduate students. Baringa has changed a great deal in twenty years.' },
  { authorIndex: 1, daysAgo: 0, content: 'Reminder: the alumni networking evening is this Friday at the main campus. Bring a colleague who did not study here.' },
];

/**
 * Load the Post model if the ticket that introduces it has landed.
 *
 * Posts are a later ticket, so this script has to work both before and after it
 * exists. A missing module is an expected outcome and returns null; anything
 * else - a Post model that exists but throws on import - is a real fault and is
 * rethrown rather than being silently read as "no posts yet".
 */
async function loadPostModel() {
  try {
    const module = await import('../models/Post.js');
    return module.default ?? null;
  } catch (error) {
    const moduleIsAbsent =
      error?.code === 'ERR_MODULE_NOT_FOUND' && /Post\.js/.test(error.message ?? '');

    if (moduleIsAbsent) {
      return null;
    }

    throw error;
  }
}

/**
 * Find the field on Post that references a User.
 *
 * The Post model does not exist yet, so its field names are not knowable here.
 * Reading the reference off the schema is what lets this script seed posts on
 * the day that model lands, whether it calls the field `author`, `member` or
 * `user`, without a change here and without guessing.
 */
function authorPathOf(Post) {
  const referencesUser = (name) => Post.schema.path(name)?.options?.ref === 'User';

  // `author` if that is what it is called, otherwise whatever does point at a
  // User. Null if nothing does, which this script treats as "not seedable".
  return referencesUser('author')
    ? 'author'
    : (Object.keys(Post.schema.paths).find(referencesUser) ?? null);
}

/** The same reasoning for the body of a post. */
function contentPathOf(Post) {
  return ['content', 'body', 'text', 'message'].find((name) => Post.schema.path(name)) ?? null;
}

/**
 * Delete the previous seeded set, and nothing else.
 *
 * Scoped to `@seed.local` on purpose rather than emptying the collection. The
 * administrator from `seedAdmin.js` does not carry that domain and so survives
 * every run - deleting it would lock the developer out of the very dashboard
 * this data exists to exercise - and so does any genuine test account somebody
 * registered by hand.
 *
 * Posts go first: their authors are about to stop existing, and a post whose
 * author has been deleted is worse than no post at all.
 *
 * @returns {Promise<{ users: number, posts: number }>} What was removed.
 */
export async function removeSeededData(Post = null) {
  const seeded = await User.find({ email: SEED_EMAIL_MATCH }).select('_id').lean();
  const seededIds = seeded.map((user) => user._id);

  let posts = 0;

  if (Post && seededIds.length > 0) {
    const authorPath = authorPathOf(Post);

    if (authorPath) {
      const removed = await Post.deleteMany({ [authorPath]: { $in: seededIds } });
      posts = removed.deletedCount ?? 0;
    }
  }

  const removedUsers = await User.deleteMany({ email: SEED_EMAIL_MATCH });

  return { users: removedUsers.deletedCount ?? 0, posts };
}

/**
 * The administrator whose review the seeded decisions are attributed to.
 *
 * Any `@seed.local` account has just been deleted, so whatever this finds is a
 * real administrator - in practice the one `seedAdmin.js` created. Null is a
 * normal outcome: the review fields are simply left unset, and the accounts are
 * still usable for everything except inspecting who approved them.
 */
async function findAdministrator() {
  return User.findOne({ role: 'administrator' }).sort({ createdAt: 1 });
}

/**
 * Build one account from its description.
 *
 * `passwordHash` receives the plaintext because the model's pre-save hook
 * replaces it with the bcrypt digest - the same path a registration takes, so a
 * seeded account logs in exactly like a registered one.
 *
 * Every account that is not `pending` gets `approvedBy` and `approvedAt`,
 * rejections included. That is what the application itself writes: the fields
 * record who reviewed an account and when, whichever way the decision went, so
 * seeding them only on approvals would produce rejected records that no real
 * review could have left behind.
 */
function buildUser({ person, status, role, password, administrator, reviewedAt }) {
  const decided = status !== 'pending';

  return new User({
    name: person.name,
    email: seedEmail(person.name),
    passwordHash: password,
    association: person.association,
    studentNumber: person.studentNumber,
    graduationYear: person.graduationYear,
    role,
    status,
    approvedBy: decided && administrator ? administrator._id : undefined,
    approvedAt: decided ? reviewedAt : undefined,
  });
}

/**
 * Create the accounts, one save at a time.
 *
 * Sequential rather than concurrent: each save costs a bcrypt hash at the
 * platform's work factor, and running twenty of those at once buys nothing on a
 * script that is already going to take a few seconds.
 *
 * @returns {Promise<import('mongoose').Document[]>} The approved members, in
 *   order, which are the accounts posts may be attributed to.
 */
export async function createSeededAccounts(password, administrator) {
  const reviewedAt = new Date();

  const groups = [
    { people: PENDING_MEMBERS, status: 'pending', role: 'member' },
    { people: APPROVED_MEMBERS, status: 'approved', role: 'member' },
    { people: REJECTED_MEMBERS, status: 'rejected', role: 'member' },
    { people: MODERATORS, status: 'approved', role: 'moderator' },
  ];

  const approvedMembers = [];

  for (const { people, status, role } of groups) {
    for (const person of people) {
      const user = buildUser({ person, status, role, password, administrator, reviewedAt });

      await user.save();

      if (status === 'approved' && role === 'member') {
        approvedMembers.push(user);
      }
    }
  }

  return approvedMembers;
}

/**
 * Create the feed posts, if there is a Post model to create them with.
 *
 * The model is a later ticket and its shape is not knowable here, so this asks
 * the schema what its fields are called and gives up cleanly if the answer does
 * not fit - a Post that turns out to need fields this script knows nothing
 * about is a reason to report that posts were skipped, not a reason to fail a
 * run whose twenty-odd accounts were created successfully.
 *
 * `save({ timestamps: false })` is what lets the spread-out `createdAt` values
 * survive: Mongoose would otherwise stamp every document with the moment it was
 * written, and a feed where everything was posted in the same second cannot
 * demonstrate ordering.
 *
 * @returns {Promise<{ created: number, skipped: string | null }>}
 */
export async function createSeededPosts(Post, approvedMembers) {
  if (!Post) {
    return { created: 0, skipped: 'the Post model does not exist yet' };
  }

  const authorPath = authorPathOf(Post);
  const contentPath = contentPathOf(Post);

  if (!authorPath || !contentPath) {
    return { created: 0, skipped: 'the Post model has no recognisable author or content field' };
  }

  const hasCreatedAt = Boolean(Post.schema.path('createdAt'));
  const dayInMs = 24 * 60 * 60 * 1000;
  let created = 0;

  for (const { authorIndex, daysAgo, content } of POSTS) {
    const author = approvedMembers[authorIndex % approvedMembers.length];
    const post = new Post({
      [authorPath]: author._id,
      [contentPath]: content,
    });

    if (hasCreatedAt) {
      post.createdAt = new Date(Date.now() - daysAgo * dayInMs);
    }

    try {
      await post.save({ timestamps: !hasCreatedAt });
    } catch (error) {
      return {
        created,
        skipped: `the Post model rejected a seeded document (${error.message})`,
      };
    }

    created += 1;
  }

  return { created, skipped: null };
}

/**
 * Count what is now in the database, by the two fields that matter.
 *
 * Counted rather than tallied while creating, so the summary reports what is
 * actually there instead of what this script believes it put there.
 */
async function summariseSeededAccounts() {
  const [pending, approved, rejected, members, moderators] = await Promise.all([
    User.countDocuments({ email: SEED_EMAIL_MATCH, status: 'pending' }),
    User.countDocuments({ email: SEED_EMAIL_MATCH, status: 'approved' }),
    User.countDocuments({ email: SEED_EMAIL_MATCH, status: 'rejected' }),
    User.countDocuments({ email: SEED_EMAIL_MATCH, role: 'member' }),
    User.countDocuments({ email: SEED_EMAIL_MATCH, role: 'moderator' }),
  ]);

  return { pending, approved, rejected, members, moderators };
}

/**
 * The command-line entry point: refuse, read, connect, clear, create, report.
 *
 * Sets `process.exitCode` rather than calling `process.exit`, so the disconnect
 * always runs and the process ends once the connection is closed.
 */
async function main() {
  let password;

  try {
    // Both refusals happen before anything connects: a run that must not
    // proceed must not reach the database at all, least of all the deletion.
    assertNotProduction();
    password = readSeedPasswordFromEnv();
  } catch (error) {
    if (
      !(error instanceof ProductionRefusedError) &&
      !(error instanceof MissingSeedPasswordError)
    ) {
      throw error;
    }

    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  // Exits the process itself if MONGODB_URI is unset or unreachable.
  await connectDatabase();

  try {
    const Post = await loadPostModel();

    const removed = await removeSeededData(Post);
    console.log(
      `Removed ${removed.users} seeded account(s) and ${removed.posts} seeded post(s) ` +
        `matching ${SEED_EMAIL_PATTERN}`
    );

    const administrator = await findAdministrator();

    if (!administrator) {
      console.log(
        'No administrator found: seeded decisions will have no reviewer recorded. ' +
          'Run `npm run seed:admin` first to populate approvedBy.'
      );
    }

    const approvedMembers = await createSeededAccounts(password, administrator);
    const posts = await createSeededPosts(Post, approvedMembers);
    const counts = await summariseSeededAccounts();

    console.log('\nSeeded accounts:');
    console.log(`  status  pending    ${counts.pending}`);
    console.log(`          approved   ${counts.approved}`);
    console.log(`          rejected   ${counts.rejected}`);
    console.log(`  role    member     ${counts.members}`);
    console.log(`          moderator  ${counts.moderators}`);
    console.log(`  posts              ${posts.created}${posts.skipped ? `  (skipped: ${posts.skipped})` : ''}`);

    // The address pattern is what a developer needs to sign in as any of these.
    // The password is not printed here or anywhere else: it is the value they
    // set in SEED_PASSWORD and already have.
    console.log(`\nEvery seeded account uses ${SEED_EMAIL_PATTERN} and the password from SEED_PASSWORD.`);

    if (administrator) {
      console.log(`Administrator (not seeded, untouched): ${administrator.email}`);
    }
  } catch (error) {
    console.error(`Seeding failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Run only when invoked as a script. Importing this module must not connect to
// anything or seed anything.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
