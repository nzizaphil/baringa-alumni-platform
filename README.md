# Baringa University Alumni Platform

An alumni networking platform for Baringa University. Members register with their
institutional association, an administrator validates them, and approved members
publish professional updates.

IFN636 Software Life Cycle Management — Assessment 1.

## Setup

To be completed (DEVOPS-5).

## Seeding development data

`server/src/scripts/seedDevData.js` fills a development database with enough
accounts to make the administrator dashboard and the member feed worth looking
at by hand — a review queue with something in it, decided registrations either
way, and a moderator to point at the routes that must refuse one.

**It is a development tool and refuses to be anything else.** If `NODE_ENV` is
`production` it prints the refusal and exits non-zero *before opening a
connection*, so it cannot reach the deployed instance even if it is run there by
mistake.

### 1. Set the shared password

Every seeded account shares one password, read from `SEED_PASSWORD` with no
default and no fallback — there is no credential in the source to be committed.
Set it in the environment, or add it to `server/.env`:

```
SEED_PASSWORD=<choose any password>
```

If it is unset or blank the script says so and exits non-zero without touching
the database. The password is never printed: not in the summary, not in an error
message, not anywhere.

### 2. Run it

```bash
cd server && npm run seed:dev
```

### What it creates

18 accounts, all on `@seed.local` addresses so seeded data is distinguishable at
a glance from genuine test accounts:

| Group | Count | `status` | `role` |
|---|---|---|---|
| Pending registrations | 5 | `pending` | `member` |
| Approved members | 5 | `approved` | `member` |
| Rejected registrations | 5 | `rejected` | `member` |
| Moderators | 3 | `approved` | `moderator` |

They spread across all four association types, with student numbers where the
association calls for one and graduation years on former students only, so the
queue shows the same mix of applicants the registration form produces. Every
decided account carries `approvedBy` and `approvedAt`, pointing at the seeded
administrator when there is one.

The three moderators are created directly, because no application feature grants
that role until `ADMIN-5` (BAP-24, Sprint 2). They exist so `requireRole` can be
checked by hand to refuse a moderator on the administrator-only routes — a case
no other seeded account can produce.

It also creates **6 posts** once the Post model exists, authored by approved
members with `createdAt` spread across the past fortnight so feed ordering is
visible rather than inferred. Until that model lands the script reports posts as
skipped and carries on.

### Re-running replaces, it does not duplicate

Each run first deletes every `@seed.local` account and any posts they wrote,
reports how many records it removed, and then creates the set fresh. Running it
five times leaves the same 18 accounts, not 90.

**The seeded administrator is never affected.** Deletion is scoped to the
`@seed.local` domain rather than clearing the collection, and the account
`npm run seed:admin` creates does not carry that domain — deleting it would lock
you out of the dashboard this data exists to exercise. Genuine test accounts you
registered by hand survive for the same reason.

### Signing in

- **Administrator dashboard** — the address set as `ADMIN_EMAIL` in
  `server/.env`, created by `npm run seed:admin` (see
  [the deployment procedure](docs/deployment.md) §7.5). Its password is issued
  separately and is deliberately not recorded here.
- **Any seeded account** — an `@seed.local` address taken from the dashboard,
  with the password you set in `SEED_PASSWORD`.

## Documentation

- [API reference](docs/api.md) — every HTTP endpoint: its guards, request shape,
  success response and failures, with the response envelope and error codes they
  all share.
- [Authentication and account status](docs/auth.md) — why the guards are composed
  the way they are, the account status model, where the token lives, and the
  client routes that follow from them.
- [Deployment procedure](docs/deployment.md) — the manual deployment to AWS EC2.
