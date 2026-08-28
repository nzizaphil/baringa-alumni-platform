import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import User from '../src/models/User.js';
import {
  seedAdministrator,
  readCredentialsFromEnv,
  MissingCredentialsError,
  EmailNotAvailableError,
} from '../src/scripts/seedAdmin.js';
import {
  connectMemoryDatabase,
  clearMemoryDatabase,
  disconnectMemoryDatabase,
} from './helpers/memory-db.js';

/**
 * Credentials for the suite. Not a default the script could ever reach - it
 * reads the environment and nothing else - only what a test passes in.
 */
const CREDENTIALS = {
  email: 'registrar@baringa.edu',
  password: 'Baringa2026',
  name: 'Baringa Registrar',
};

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

const administrators = () => User.countDocuments({ role: 'administrator' });

describe('seedAdministrator', () => {
  it('creates the administrator on the first run', async () => {
    const { created, administrator } = await seedAdministrator(CREDENTIALS);

    expect(created).toBe(true);
    expect(await administrators()).toBe(1);
    expect(administrator.email).toBe(CREDENTIALS.email);
    expect(administrator.name).toBe(CREDENTIALS.name);
    expect(administrator.role).toBe('administrator');
    expect(administrator.status).toBe('approved');
    expect(administrator.association).toBe('current_lecturer');
  });

  it('leaves exactly one administrator after running twice', async () => {
    const first = await seedAdministrator(CREDENTIALS);
    const second = await seedAdministrator(CREDENTIALS);

    // The point of the ticket: deployment re-runs this and must not accumulate
    // accounts.
    expect(await administrators()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.administrator.id).toBe(first.administrator.id);
  });

  it('leaves exactly one administrator when two runs race each other', async () => {
    const [a, b] = await Promise.all([
      seedAdministrator(CREDENTIALS),
      seedAdministrator(CREDENTIALS),
    ]);

    // Both lookups can miss; the unique index on email is what settles it.
    expect(await administrators()).toBe(1);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
  });

  it('does not modify the existing account on a re-run', async () => {
    const { administrator } = await seedAdministrator(CREDENTIALS);
    const before = await User.findById(administrator.id).select('+passwordHash').lean();

    // A re-run carrying a different password must not reset the live account.
    await seedAdministrator({ ...CREDENTIALS, password: 'Different2026', name: 'Someone Else' });

    const after = await User.findById(administrator.id).select('+passwordHash').lean();

    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(CREDENTIALS.name);
    expect(after.role).toBe('administrator');
    expect(after.status).toBe('approved');
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('stores the password as a bcrypt digest, never the plaintext', async () => {
    await seedAdministrator(CREDENTIALS);

    const stored = await User.findOne({ email: CREDENTIALS.email }).select('+passwordHash');

    expect(stored.passwordHash).not.toBe(CREDENTIALS.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    // Hashed by the model's pre-save hook, so the seeded account signs in
    // through exactly the same comparison a registered one does.
    expect(await stored.comparePassword(CREDENTIALS.password)).toBe(true);
  });

  it('refuses when the email already belongs to a non-administrator', async () => {
    await new User({
      name: 'Amina Uwase',
      email: CREDENTIALS.email,
      passwordHash: 'Baringa2026',
      role: 'member',
      status: 'approved',
      association: 'former_student',
      studentNumber: 'n10428837',
      graduationYear: 2019,
    }).save();

    await expect(seedAdministrator(CREDENTIALS)).rejects.toThrow(EmailNotAvailableError);

    // Promoting someone else's account is not this script's decision to make.
    const untouched = await User.findOne({ email: CREDENTIALS.email });
    expect(untouched.role).toBe('member');
    expect(await administrators()).toBe(0);
  });
});

describe('readCredentialsFromEnv', () => {
  it('reads all three variables from the environment', () => {
    const credentials = readCredentialsFromEnv({
      ADMIN_EMAIL: '  Registrar@Baringa.edu ',
      ADMIN_PASSWORD: CREDENTIALS.password,
      ADMIN_NAME: '  Baringa Registrar  ',
    });

    expect(credentials).toEqual(CREDENTIALS);
  });

  it('has no default credential to fall back on (AC2)', () => {
    // The absence of a hardcoded default is the ticket. An empty environment
    // must produce an error naming all three variables, never a usable account.
    expect(() => readCredentialsFromEnv({})).toThrow(MissingCredentialsError);

    try {
      readCredentialsFromEnv({});
    } catch (error) {
      expect(error.missing).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME']);
    }
  });

  it('treats a blank variable as unset', () => {
    // `ADMIN_PASSWORD=` in a .env is a line someone meant to fill in.
    expect(() =>
      readCredentialsFromEnv({
        ADMIN_EMAIL: CREDENTIALS.email,
        ADMIN_PASSWORD: '   ',
        ADMIN_NAME: CREDENTIALS.name,
      })
    ).toThrow(MissingCredentialsError);
  });

  it('names only the variables that are missing', () => {
    try {
      readCredentialsFromEnv({ ADMIN_EMAIL: CREDENTIALS.email });
      throw new Error('expected readCredentialsFromEnv to throw');
    } catch (error) {
      expect(error.missing).toEqual(['ADMIN_PASSWORD', 'ADMIN_NAME']);
      // The message points at the variable, never at a value.
      expect(error.message).not.toContain(CREDENTIALS.password);
    }
  });
});
