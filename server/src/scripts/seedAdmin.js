#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import User from '../models/User.js';
import { connectDatabase } from '../config/database.js';

/**
 * Seed the first administrator (ADMIN-6).
 *
 *   cd server && npm run seed:admin
 *
 * Administrator provisioning is deliberately outside the application. There is
 * no endpoint that creates an administrator and there must never be one: the
 * first privileged account has to come from somewhere the API cannot be talked
 * into reaching, so it comes from the instance's own environment, applied by
 * hand at deployment time.
 *
 * The credentials are read *only* from ADMIN_EMAIL, ADMIN_PASSWORD and
 * ADMIN_NAME. There is no default, no fallback and no example value anywhere in
 * this file, which is the whole point of the ticket (AC2): a credential that
 * does not exist in the source cannot be committed, cannot be read out of the
 * repository, and cannot be left in place by an operator who forgot to change
 * it. A missing variable stops the script rather than standing something in.
 *
 * Re-running is safe. Deployment re-runs it as a matter of course, so an
 * account that is already there is reported and left exactly as it is - no
 * duplicate, no password reset, no change of role or status.
 *
 * The password is never printed, logged, or included in an error message.
 */

/** The account this script provisions. Fixed: it is not an applicant. */
const ADMIN_ROLE = 'administrator';
const ADMIN_STATUS = 'approved';
const ADMIN_ASSOCIATION = 'current_lecturer';

/** The three variables, in the order they are reported as missing. */
const REQUIRED_VARIABLES = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME'];

/**
 * Raised when the environment does not carry a usable set of credentials.
 * Carries the variable names so the operator is told which to set, never the
 * values.
 */
export class MissingCredentialsError extends Error {
  constructor(missing) {
    super(
      `Cannot seed an administrator: ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} not set`
    );
    this.name = 'MissingCredentialsError';
    this.missing = missing;
  }
}

/**
 * Read the administrator's details out of the environment.
 *
 * A variable that is absent, blank, or only whitespace counts as not set: an
 * empty `ADMIN_PASSWORD=` in a `.env` is a variable someone meant to fill in,
 * and seeding an account with an empty password would be worse than failing.
 *
 * @param {Record<string, string|undefined>} [env] Defaults to `process.env`.
 * @returns {{ email: string, password: string, name: string }}
 * @throws {MissingCredentialsError} Listing every variable that is not set.
 */
export function readCredentialsFromEnv(env = process.env) {
  const missing = REQUIRED_VARIABLES.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new MissingCredentialsError(missing);
  }

  return {
    // Lower-cased and trimmed to match the schema, so the lookup below compares
    // like with like and a stray space in the .env cannot create a second
    // account that only looks the same.
    email: env.ADMIN_EMAIL.trim().toLowerCase(),
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME.trim(),
  };
}

/**
 * Raised when the email is already taken by an account that is not an
 * administrator. Creating would fail on the unique index, and promoting the
 * existing account is not this script's business.
 */
export class EmailNotAvailableError extends Error {
  constructor(email, role) {
    super(
      `Cannot seed an administrator: ${email} already belongs to an account ` +
        `with role "${role}". Set ADMIN_EMAIL to a different address, or ` +
        `change that account's role deliberately.`
    );
    this.name = 'EmailNotAvailableError';
  }
}

/**
 * Create the administrator, or report that it is already there.
 *
 * Expects an open Mongoose connection: the caller owns connecting and
 * disconnecting, which is what lets the tests drive this against an in-memory
 * database.
 *
 * Idempotent by lookup *and* by unique index. The lookup handles the ordinary
 * re-run; the index handles two runs racing each other, which the lookup alone
 * cannot, and a duplicate-key error is treated as the same "already there"
 * outcome rather than a failure.
 *
 * @param {{ email: string, password: string, name: string }} credentials
 * @returns {Promise<{ created: boolean, administrator: import('mongoose').Document }>}
 * @throws {EmailNotAvailableError} The email belongs to a non-administrator.
 */
export async function seedAdministrator({ email, password, name }) {
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== ADMIN_ROLE) {
      throw new EmailNotAvailableError(email, existing.role);
    }

    // Deliberately returned untouched: a deployment re-run must not reset the
    // password of a live administrator account, nor its status.
    return { created: false, administrator: existing };
  }

  const administrator = new User({
    name,
    email,
    // The model's pre-save hook replaces this plaintext with its bcrypt digest,
    // so the seeded account is hashed by exactly the same code path as a
    // registration and the plaintext is never written.
    passwordHash: password,
    role: ADMIN_ROLE,
    status: ADMIN_STATUS,
    association: ADMIN_ASSOCIATION,
  });

  try {
    await administrator.save();
  } catch (error) {
    // A concurrent run won the race. The account exists and is correct, which
    // is the outcome this script promises.
    if (error?.code === 11000) {
      const winner = await User.findOne({ email });

      if (winner?.role === ADMIN_ROLE) {
        return { created: false, administrator: winner };
      }
    }

    throw error;
  }

  return { created: true, administrator };
}

/**
 * The command-line entry point: read the environment, connect, seed, report.
 *
 * Sets `process.exitCode` rather than calling `process.exit`, so the disconnect
 * below always runs and the process ends only once the connection is closed.
 */
async function main() {
  let credentials;

  try {
    credentials = readCredentialsFromEnv();
  } catch (error) {
    if (!(error instanceof MissingCredentialsError)) throw error;

    console.error(error.message);
    console.error(
      `Set ${REQUIRED_VARIABLES.join(', ')} in the environment, or in server/.env. ` +
        'See .env.example for the key names.'
    );
    process.exitCode = 1;
    return;
  }

  // Exits the process itself if MONGODB_URI is unset or unreachable.
  await connectDatabase();

  try {
    const { created, administrator } = await seedAdministrator(credentials);

    // The email and the name are identifiers the operator supplied and can see
    // in their own .env. The password appears in neither branch.
    console.log(
      created
        ? `Administrator created: ${administrator.email} ("${administrator.name}")`
        : `Administrator already exists: ${administrator.email} - left unchanged`
    );
  } catch (error) {
    console.error(error instanceof EmailNotAvailableError ? error.message : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Run only when invoked as a script. Importing this module - which the tests do
// - must not connect to anything or seed anything.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
