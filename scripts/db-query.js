#!/usr/bin/env node
/**
 * Baringa Alumni Platform — read-only database query helper
 *
 * Prints documents from a collection with the password hash excluded.
 * Read-only: it never writes, updates or deletes.
 *
 * Run from the repo root with the server's environment:
 *   node --env-file=server/.env scripts/db-query.js
 *   node --env-file=server/.env scripts/db-query.js '{"status":"pending"}'
 *   node --env-file=server/.env scripts/db-query.js '{}' posts
 *
 * If your Node version does not support --env-file, run it from server/ instead:
 *   cd server && node ../scripts/db-query.js
 */

import { createRequire } from 'node:module';
const mongoose = createRequire(import.meta.url)('../server/node_modules/mongoose');
const URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const COLLECTION = process.argv[3] || 'users';

let filter = {};
if (process.argv[2]) {
  try {
    filter = JSON.parse(process.argv[2]);
  } catch {
    console.error(`Filter is not valid JSON: ${process.argv[2]}`);
    console.error(`Remember the single quotes:  '{"status":"pending"}'`);
    process.exit(1);
  }
}

if (!URI) {
  console.error('MONGODB_URI is not set.');
  console.error('Run from server/, or pass --env-file=server/.env');
  process.exit(1);
}

await mongoose.connect(URI);

const db = mongoose.connection;
const names = (await db.db.listCollections().toArray()).map((c) => c.name);

if (!names.includes(COLLECTION)) {
  console.error(`\nCollection "${COLLECTION}" not found in database "${db.name}".`);
  console.error(`Collections present: ${names.join(', ') || '(none)'}`);
  await mongoose.disconnect();
  process.exit(1);
}

const docs = await db
  .collection(COLLECTION)
  // passwordHash is excluded so a hash never reaches the terminal or a screenshot
  .find(filter, { projection: { passwordHash: 0, password: 0 } })
  .sort({ createdAt: -1 })
  .toArray();

console.log(`\ndatabase:   ${db.name}`);
console.log(`collection: ${COLLECTION}`);
console.log(`filter:     ${JSON.stringify(filter)}`);
console.log(`matched:    ${docs.length}\n`);

if (COLLECTION === 'users') {
  console.table(
    docs.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      association: u.association,
      created: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 16) : '',
    }))
  );
  console.log('Pass a second argument for other collections, or use --full for raw documents.');
} else {
  console.dir(docs, { depth: null });
}

if (process.argv.includes('--full')) {
  console.log('\nRaw documents:');
  console.dir(docs, { depth: null });
}

await mongoose.disconnect();
