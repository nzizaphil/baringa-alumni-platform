#!/usr/bin/env node
/**
 * Baringa Alumni Platform — dev seed
 *
 * Creates two usable accounts:
 *   member@baringa.test  — approved member
 *   admin@baringa.test   — approved administrator
 *
 * Run from the server directory with the API running:
 *   cd server && node seed-dev.js
 *
 * It registers through POST /api/auth/register so the password is hashed by the
 * same code path the application uses, then promotes the records directly in
 * MongoDB. Writing the hash by hand here would risk double-hashing if the model
 * has a pre-save hook, and silently producing accounts that cannot log in.
 *
 * This is a throwaway development helper. The assessed seeding of the initial
 * administrator is ADMIN-6 and needs its own committed script.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const BASE = process.env.SEED_BASE_URL || 'http://localhost:5000';
const URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const ACCOUNTS = [
  {
    name: 'Test Member',
    email: 'member@baringa.test',
    password: 'Passw0rd123',
    association: 'former_student',
    studentNumber: '12345678',
    graduationYear: 2019,
    role: 'member',
  },
  {
    name: 'Test Administrator',
    email: 'admin@baringa.test',
    password: 'Passw0rd123',
    association: 'current_lecturer',
    role: 'administrator',
  },
];

const log = (m) => console.log(`   ${m}`);

async function register(account) {
  const { role, ...payload } = account;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 201) return 'created';
  if (res.status === 409) return 'exists';
  throw new Error(
    `register failed for ${account.email}: HTTP ${res.status} ${JSON.stringify(body)}`
  );
}

async function main() {
  if (!URI) {
    console.error('MONGODB_URI is not set. Run this from the server directory.');
    process.exit(1);
  }

  // Fail early with a clear message rather than a fetch stack trace.
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`The API is not responding on ${BASE}.`);
    console.error('Start it first:  cd server && npm run dev');
    process.exit(1);
  }

  console.log('\nRegistering accounts through the API');
  for (const account of ACCOUNTS) {
    const outcome = await register(account);
    log(`${account.email} — ${outcome}`);
  }

  console.log('\nPromoting records in MongoDB');
  await mongoose.connect(URI);
  const db = mongoose.connection;
  log(`connected to database "${db.name}"`);

  const users = db.collection('users');
  for (const account of ACCOUNTS) {
    const result = await users.updateOne(
      { email: account.email.toLowerCase() },
      { $set: { status: 'approved', role: account.role } }
    );
    if (result.matchedCount === 0) {
      log(`${account.email} — NOT FOUND, check the collection name`);
    } else {
      log(`${account.email} — status approved, role ${account.role}`);
    }
  }

  console.log('\nVerifying login');
  for (const account of ACCOUNTS) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    log(`${account.email} — HTTP ${res.status}${res.ok ? '' : '  <-- check this'}`);
  }

  await mongoose.disconnect();

  console.log('\nAccounts ready');
  for (const a of ACCOUNTS) log(`${a.email} / ${a.password}  (${a.role})`);
  console.log('');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
