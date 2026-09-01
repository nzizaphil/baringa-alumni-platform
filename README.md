# Baringa University Alumni Platform

An alumni networking platform for Baringa University. Members register with
their institutional association — current student, former student, current
lecturer or former lecturer — an administrator validates that registration, and
approved members publish professional updates to a shared feed.

IFN636 Software Life Cycle Management — Assessment 1.
Jira: `DEVOPS-5` (repository documentation).

**Deployed at → http://3.106.192.200**

> The instance uses an **auto-assigned public IPv4 address**, because Elastic IP
> allocation is not available in the managed QUT AWS account. The address is
> held for the life of a *running* instance but is released if the instance is
> stopped, so the URL above can change. Identify the instance by its ID —
> **`i-0b915c1f99ca7ba2d`** (region `ap-southeast-2`) — rather than by its
> address, and read the current address from the EC2 console if the link does
> not answer.
>
> Inbound port 80 is permitted only from specific `/32` addresses on the shared
> security groups, so the URL answers from whitelisted networks only. See
> [`docs/deployment.md`](docs/deployment.md) §3 and §10.

---

## Contents

- [Quick start](#quick-start)
- [Overview](#overview)
- [Technology stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Development commands](#development-commands)
- [Testing](#testing)
- [Building](#building)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Running the deployed application after an instance restart](#running-the-deployed-application-after-an-instance-restart)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Known limitations](#known-limitations)

---

## Quick start

The complete path from a fresh clone to the application running in your browser.
Allow about fifteen minutes, most of it waiting for the Atlas cluster. Each step
links to the section with the full detail.

**You will need** Node.js 20.19+ or 22.12+, npm, Git, and a free MongoDB Atlas
account. Check the first three:

```bash
node --version && npm --version && git --version
```

### 1. Clone and install

```bash
git clone https://github.com/nzizaphil/baringa-alumni-platform.git
cd baringa-alumni-platform
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Create a database

At [cloud.mongodb.com](https://cloud.mongodb.com): create a free **M0** cluster,
add a database user under **Database Access**, and add your current IP under
**Network Access**. Then **Connect → Drivers → Node.js** and copy the connection
string, inserting `baringa` as the database name before the `?`:

```text
mongodb+srv://<user>:<password>@<cluster-host>/baringa?retryWrites=true&w=majority
```

Full detail in [Database setup](#database-setup).

### 3. Configure the server

```bash
cp .env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open `server/.env` and set these six values — the second command above prints a
value for `JWT_SECRET`:

```text
NODE_ENV=development
MONGODB_URI=<the connection string from step 2>
JWT_SECRET=<the generated hex string>
ADMIN_EMAIL=<an email address you will sign in with>
ADMIN_PASSWORD=<a password: 8+ characters, a letter and a digit>
ADMIN_NAME=<a display name>
```

Every variable is documented in [Environment variables](#environment-variables).
`server/.env` is gitignored and must never be committed.

### 4. Create the first administrator

Registration only ever produces a pending member, and only an administrator can
approve one. There is no API endpoint that creates an administrator, so the first
one is seeded from outside the application:

```bash
cd server && npm run seed:admin
```

Expect `Administrator created: <your email>`. If it reports missing variables,
step 3 is incomplete. Re-running is safe.

### 5. Optional — add demonstration data

Fills the review queue and the feed so there is something to look at. Set
`SEED_PASSWORD` to any value in `server/.env` first:

```bash
cd server && npm run seed:dev
```

### 6. Start both servers

Two terminals, from the repository root:

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Wait for the API to print its database connection line before using the client.

### 7. Open the application

Go to **http://localhost:5173**. Vite proxies `/api` to the API on port 5000, so
no client configuration is needed.

To walk the full workflow:

1. **Register** at `/register` as a former student. You are told the account is
   pending — this is correct.
2. **Sign in as that member.** You reach a pending-approval screen and cannot
   reach the feed. Also correct.
3. **Sign out, then sign in as the administrator** using `ADMIN_EMAIL` and
   `ADMIN_PASSWORD` from step 3. An **Administrator** link appears in the header.
4. **Approve** the registration from the dashboard at `/admin`.
5. **Sign back in as the member.** You now see the approval notification, reach
   the feed, and can publish a post.

That is the whole of Workflow 1: register, validate, participate.

### If something does not work

| Symptom | Cause |
|---|---|
| API exits on start | `MONGODB_URI` wrong, or your IP is not in Atlas **Network Access** |
| Vite says port 5173 is in use | An earlier dev server is still running; stop it, or the client will start on 5174 and the proxy assumptions in this guide still hold but the URL differs |
| Every API call returns 500 | `JWT_SECRET` is unset |
| `seed:admin` exits immediately | One of the three `ADMIN_*` variables is missing |
| Cannot sign in as administrator | The seed did not run, or the password differs from `ADMIN_PASSWORD` |

More in [`docs/deployment.md`](docs/deployment.md) §10, which covers orphaned
processes and other local failures.

---

## Overview

Baringa University's alumni community has no single place to stay in touch after
graduation. This platform gives it one, with membership that is verified rather
than open:

1. **Registration.** A visitor registers with their name, email, password and
   their institutional association with the university. Registration always
   produces an account with role `member` and status `pending` — nothing in the
   request can influence either.
2. **Validation.** An administrator reviews the pending registration from the
   administrator dashboard and either approves or rejects it. An approval
   raises an in-app notification for the applicant.
3. **Participation.** An approved member publishes professional updates and
   reads the member feed. A pending account can sign in, but is held on a
   "pending approval" screen and is refused by every member route.

---

## Technology stack

| Layer | Technology | Version |
|---|---|---|
| Client framework | React (with React Router) | 19.2 / router 7.18 |
| Client build tool | Vite | 8.2 |
| Client styling | Tailwind CSS, PostCSS, Autoprefixer | 3.4 |
| Server runtime | Node.js (ES modules, `"type": "module"`) | 22.x LTS |
| Server framework | Express | 5.2 |
| Database | MongoDB Atlas (free M0 tier) | — |
| ODM | Mongoose | 9.9 |
| Authentication | JSON Web Tokens (`jsonwebtoken`) + `bcryptjs` | 9.0 / 3.0 |
| Request validation | express-validator | 7.3 |
| Testing | Vitest, Supertest, `mongodb-memory-server` | 4.1 / 7.2 / 11.2 |
| Linting | ESLint | 10.9 |
| Process manager | PM2 | 7.0 |
| Reverse proxy | Nginx | 1.28 |
| Hosting | AWS EC2, Ubuntu Server 24.04 LTS (`t3.medium`) | — |

---

## Prerequisites

| Requirement | Minimum | Used here | Notes |
|---|---|---|---|
| Node.js | 20.19 | 22.23.2 | Vite 8 requires `^20.19` or `>=22.12`. Node 22 is used both locally and on the instance so the two environments match exactly. |
| npm | 10.0 | 10.9.8 | Ships with Node 22. |
| Git | 2.34 | — | Any recent version. |
| MongoDB Atlas account | — | free M0 tier | A free shared cluster is sufficient. |
| AWS account | — | managed QUT account | Only needed to deploy; the application runs locally against Atlas without one. |

Check what you have:

```bash
node --version && npm --version && git --version
```

---

## Local setup

### 1. Clone the repository

```bash
git clone https://github.com/nzizaphil/baringa-alumni-platform.git
cd baringa-alumni-platform
```

### 2. Install server dependencies

```bash
cd server
npm install
```

### 3. Install client dependencies

```bash
cd ../client
npm install
```

### 4. Create the server environment file

`.env.example` in the repository root lists every variable the server reads,
with no values. Copy it into `server/` and fill it in:

```bash
cd ..
cp .env.example server/.env
```

`server/.env` is excluded by `.gitignore` and must never be committed. Every
value below is a **placeholder** — real values are chosen locally or on the
instance and appear nowhere in this repository.

---

## Environment variables

All of these are read by the server from `server/.env` (loaded with
`import 'dotenv/config'`).

| Variable | Required | Purpose | Example placeholder |
|---|---|---|---|
| `NODE_ENV` | yes | Runtime mode. `production` enables serving the built client from Express and suppresses stack traces in error responses; anything else is treated as development. | `development` |
| `PORT` | no | Port the Express server listens on. Defaults to `5000`, which is what the Vite dev proxy targets. | `5000` |
| `MONGODB_URI` | yes | MongoDB Atlas connection string, with the database name `baringa` before the query parameters. Carries the database credentials — never log, print or commit it. | `mongodb+srv://<user>:<password>@<cluster-host>/baringa?retryWrites=true&w=majority` |
| `JWT_SECRET` | yes | Secret used to sign and verify access tokens. Generate a long random value; use a **different** one per environment so a compromise of one does not grant access to another. | `<64-character random hex string>` |
| `JWT_EXPIRES_IN` | no | Access-token lifetime, in `jsonwebtoken` duration format. Defaults to `1d` when unset. | `1d` |
| `CLIENT_URL` | yes | Origin permitted by CORS. Locally this is the Vite dev server; in production it is the deployed URL. Defaults to `http://localhost:5173` when unset. | `http://localhost:5173` |
| `ADMIN_EMAIL` | seed only | Email address of the first administrator, read by `npm run seed:admin`. The running application never reads it. | `<first administrator's email address>` |
| `ADMIN_PASSWORD` | seed only | Password for the first administrator, read by `npm run seed:admin`. It has no default in the source, is never printed, and is chosen here and nowhere else. | `<a strong password: 8+ chars, a letter and a digit>` |
| `ADMIN_NAME` | seed only | Display name of the first administrator, read by `npm run seed:admin`. | `<first administrator's display name>` |
| `SEED_PASSWORD` | dev seed only | Shared password for the demonstration accounts created by `npm run seed:dev`. No default and no fallback; the script refuses to run without it. | `<any password you choose>` |

Generate a signing secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **The client needs no environment file.** It calls the API at the relative
> base `/api` in both development and production (see
> [Development commands](#development-commands)). An optional `VITE_API_URL`
> override exists in `client/src/api/client.js` for pointing the client at an
> API on another origin; it is not needed for the standard setup.

---

## Database setup

### 1. Create a free Atlas cluster

1. Sign in at [cloud.mongodb.com](https://cloud.mongodb.com) and create a
   project.
2. **Build a Cluster → M0 (Free)**. Choose a region near you — this project uses
   `ap-southeast-2` (Sydney) to sit beside the EC2 instance.

### 2. Create a database user

**Database Access → Add New Database User**

- Authentication method: password, with an autogenerated password.
- Built-in role: *Read and write to any database*.
- Use a dedicated user for this application (this project uses `baringa_app`)
  rather than reusing an existing one, so its credentials can be rotated on
  their own.

Copy the password when it is shown — Atlas does not show it again.

### 3. Add a network access rule

**Network Access → Add IP Address**

- For local development, add your own current address.
- For the deployed application, add the EC2 instance's public IPv4 address.
  Without this the instance cannot reach the database.

### 4. Build the connection string

**Connect → Drivers → Node.js**, then insert the database name `baringa` before
the query parameters so this application's data is isolated from anything else
on the cluster:

```text
mongodb+srv://<user>:<password>@<cluster-host>/baringa?retryWrites=true&w=majority
```

Put it in `server/.env` as `MONGODB_URI`.

### 5. Seed the first administrator

**The platform is not usable until this runs.** Registration only ever produces
a `pending` member, and only an approved administrator can approve one — through
routes that are themselves closed to anyone who is not an approved
administrator. There is deliberately no API endpoint that creates an
administrator, so the first privileged account has to come from outside the API.

Set the three seed variables in `server/.env`:

```text
ADMIN_EMAIL=<first administrator's email address>
ADMIN_PASSWORD=<a strong password>
ADMIN_NAME=<first administrator's display name>
```

Then run:

```bash
cd server
npm run seed:admin
```

It creates one account with role `administrator`, status `approved` and
association `current_lecturer`, and prints:

```text
MongoDB connected: database "baringa"
Administrator created: <ADMIN_EMAIL> ("<ADMIN_NAME>")
```

If a variable is missing it names the missing variables and exits non-zero
*before connecting*. Re-running is safe: an existing administrator is reported
and left exactly as it is — no duplicate and no password reset. The password is
never printed, in success or in failure.

### 6. Optional — seed demonstration data

`npm run seed:dev` fills a development database with 18 accounts on
`@seed.local` addresses (5 pending, 5 approved, 5 rejected, 3 moderators) plus 6
posts, so the review queue and the feed have something in them. Every seeded
account shares the password read from `SEED_PASSWORD`, which has no default.

```bash
cd server
npm run seed:dev
```

It is a development tool and refuses to be anything else: if `NODE_ENV` is
`production` it exits non-zero before opening a connection. Each run first
deletes every `@seed.local` account and its posts, then recreates the set, so
re-running replaces rather than duplicates. The seeded administrator is never
touched — deletion is scoped to the `@seed.local` domain.

---

## Development commands

Run the two servers in separate terminals.

**API** — `http://localhost:5000`:

```bash
cd server
npm run dev
```

**Client** — `http://localhost:5173`:

```bash
cd client
npm run dev
```

The Vite dev server proxies every request beginning with `/api` to the API on
port 5000 (`client/vite.config.js`). That is why the client uses the
**same-origin relative base `/api`** rather than an absolute URL: in development
the proxy makes `/api` resolve to port 5000, and in production Express serves
both the built client and the API from the same origin. The client therefore
needs no per-environment configuration, and the browser never has to negotiate
CORS against the API.

Other commands:

```bash
cd server && npm start
```

```bash
cd client && npm run lint
```

---

## Testing

```bash
cd server
npm test
```

Vitest runs the suite once and exits. Every test runs against an in-memory
MongoDB instance (`mongodb-memory-server`), so no Atlas connection, no
`server/.env` and no network access are required, and the tests never touch a
real database. HTTP is exercised end to end through Supertest against the real
Express app.

Covered:

| Area | File | What it checks |
|---|---|---|
| Health and 404s | `tests/health.test.js` | The health endpoint, and that an unmatched `/api` path returns the JSON failure envelope |
| Registration | `tests/auth.register.test.js` | Field validation, that registration always yields `member` / `pending`, bcrypt password storage, and that a privileged email cannot be self-assigned |
| Sign-in | `tests/auth.login.test.js` | Credential exchange, token issue, `GET /api/auth/me`, and `requireRole` |
| Status gating | `tests/auth.approved.test.js` | That a pending or rejected account can sign in but is refused by `requireApproved` with `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` |
| Registration review | `tests/admin.approval.test.js` | The pending queue, approve and reject, the 409 on an already-decided registration, the self-review refusal, and who may reach the routes at all |
| Notifications | `tests/notification.test.js` | That approval raises a notification, listing and unread counts, marking one read, and the approved member's end-to-end path |
| Posts and feed | `tests/post.test.js` | Publishing a post, body validation, feed ordering, cursor paging and the exclusion of hidden posts |
| Administrator seed | `tests/seedAdmin.test.js` | Credential reading from the environment, creation, and the safe no-op on re-run |

---

## Building

Build the client's production bundle into `client/dist`:

```bash
cd client
npm run build
```

Preview the built bundle locally:

```bash
cd client
npm run preview
```

`client/dist` is build output and is **not** committed, so `git pull` never
creates or updates it. In production Express serves it, which means the build
must be run on the instance before PM2 is started or restarted.

---

## Architecture

### Request path

```text
Browser
  │  HTTP :80
  ▼
Nginx  (reverse proxy, the only exposed port)
  │  proxy_pass → localhost:5000
  ▼
Express / Node.js  (one process, managed by PM2 as "baringa-api")
  ├── /api/*  → router → guards → validator → controller
  │                  │
  │                  ▼
  │              Mongoose models  ──►  MongoDB Atlas (database "baringa")
  │
  └── everything else → the built React client in client/dist
                        (a real build file, otherwise index.html)
```

One process and one port. Nginx forwards everything to `localhost:5000` and does
not need to know where the build output lives. Any `GET` outside `/api` that
does not name a real build file is answered with `index.html`, so React Router
resolves the URL in the browser and a refresh on a client route such as `/feed`
returns the application rather than a 404. Unknown `/api` paths are untouched by
this and still return the JSON 404 envelope. Serving the client is gated on
`NODE_ENV=production`; in development Vite serves it on 5173 and proxies `/api`
to 5000, and the Express process serves the API only.

The application listens on `localhost:5000` and is not reachable from outside
the instance. Only ports 22 (SSH) and 80 (application) are open.

### Response envelope

Every endpoint answers with one of two shapes:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "message": "Your registration is still being reviewed by an administrator",
  "errors": [],
  "code": "ACCOUNT_PENDING"
}
```

`errors` is always present on a failure and holds `{ field, message }` pairs;
it is empty when the failure is not field-specific. `code` is a stable
SCREAMING_SNAKE identifier that appears only where the client must branch on
*which* failure this is — clients match on `code`, never on `message`.

### Authentication

Passwords are hashed with bcrypt (12 rounds) and the digest is `select: false`,
so it is excluded from query results unless explicitly requested and is stripped
again on serialisation. Signing in exchanges credentials for a **JWT access
token**, sent on subsequent requests as:

```text
Authorization: Bearer <token>
```

The token carries `sub`, `role` and `status`, but those claims are a snapshot
from issue time: the `requireAuth` guard reloads the account on every request
and treats the database as authoritative, so a decision made after a token was
issued takes effect immediately. There are no refresh tokens and no server-side
session. The client persists the token in `localStorage` under `baringa_token`.

### Roles

`role` gates **what an account may do**:

| Role | Meaning |
|---|---|
| `member` | The default. Every account registers as one. May publish posts and read the feed once approved. |
| `moderator` | A privilege laid on a member account, not a step towards administrator. No moderation behaviour is built on it in this phase, and no endpoint grants it. |
| `administrator` | May review the registration queue and approve or reject registrations. Created only by the out-of-band seed script. |

### Account status

`status` gates **whether an account may act at all**, and is a separate field
from `role`:

| Status | Meaning |
|---|---|
| `pending` | Registered, not yet reviewed. |
| `approved` | Validated by an administrator. |
| `rejected` | Reviewed and turned down. A decision is made once; a decided registration cannot be decided again. |

**A pending account can authenticate but cannot reach member functionality.**
Sign-in is deliberately not the gate: the credentials are correct, so the login
succeeds and a token is issued. The refusal happens one guard later — every
member route composes `requireAuth` then `requireApproved`, and the second guard
answers `403` with `ACCOUNT_PENDING` (or `ACCOUNT_REJECTED`). The client reads
that code and holds the account on the pending screen. Two routes stay open to a
pending account on purpose: `GET /api/auth/me`, which is how the pending screen
learns the account is still under review, and the notification routes, which
expose nothing but the caller's own records. Administrator routes place
`requireApproved` *before* `requireRole`, so a pending administrator is barred
like anyone else and cannot approve their own registration by approving
everybody's.

The full reasoning is in [`docs/auth.md`](docs/auth.md).

---

## Project structure

```text
baringa-alumni-platform/
├── client/                         React 19 single-page application (Vite)
│   ├── src/
│   │   ├── api/                    Fetch wrapper and one module per API area
│   │   │   ├── client.js           Envelope unwrapping, ApiError, auth header
│   │   │   ├── auth.js             Register, login, me
│   │   │   ├── admin.js            Registration queue, approve, reject
│   │   │   ├── posts.js            Feed and post creation
│   │   │   └── notifications.js    List and mark read
│   │   ├── auth/tokenStorage.js    TOKEN_STORAGE_KEY = "baringa_token"
│   │   ├── components/             Header, HeaderNav, RequireAuth,
│   │   │                           AdminRoute, PostCard, PostComposer, ...
│   │   ├── context/                AuthProvider, NotificationsProvider
│   │   ├── format/                 Display formatting for registrations
│   │   ├── hooks/                  useAuth, useNotifications, useFlashMessage
│   │   ├── pages/                  Register, Login, PendingApproval,
│   │   │                           MemberFeed, Notifications,
│   │   │                           AdminDashboard, RegistrationReview
│   │   ├── validation/             Client-side form rules
│   │   ├── routes.js               Path constants
│   │   ├── App.jsx                 Route table
│   │   └── main.jsx                Entry point
│   ├── index.html
│   ├── vite.config.js              Dev proxy: /api → localhost:5000
│   └── tailwind.config.js
│
├── server/                         Express 5 API (ES modules)
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js         Mongoose connection to Atlas
│   │   │   └── jwt.js              Token signing and verification
│   │   ├── models/                 User, Post, Notification
│   │   ├── controllers/            auth, admin, post, notification
│   │   ├── routes/                 health, auth, admin, post, notification
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js  requireAuth, requireApproved, requireRole
│   │   │   └── error.middleware.js Centralised failure envelope
│   │   ├── validators/             express-validator chains per area
│   │   ├── scripts/
│   │   │   ├── seedAdmin.js        Creates the first administrator
│   │   │   └── seedDevData.js      Demonstration accounts and posts
│   │   ├── app.js                  App assembly, envelope contract, static client
│   │   └── server.js               Connect, then listen
│   └── tests/                      Vitest + Supertest, in-memory MongoDB
│
├── docs/
│   ├── api.md                      Endpoint reference
│   ├── auth.md                     Authentication and status design
│   └── deployment.md               Manual AWS EC2 procedure
│
├── scripts/                        Small operational helpers
├── .env.example                    Variable names, no values
├── CONTRIBUTING.md
└── README.md
```

---

## Running the deployed application after an instance restart

The instance has no Elastic IP, so **stopping and starting it assigns a new public
IPv4 address**. Everything else survives: the code, the database, the environment
file, and the PM2 process registration. The application restarts by itself. Only
the address changes, and only four things reference it.

This takes about five minutes. **You do not redeploy** — no `git pull`, no
`npm install`, no `npm run build`, no re-seeding.

### 1. Start the instance and read the new address

AWS console → **EC2 → Instances** → select `i-0b915c1f99ca7ba2d` (region
`ap-southeast-2`) → **Instance state → Start instance**.

Wait until **Instance state** is `Running` and **Status check** passes — about a
minute. Then copy **Public IPv4 address** from the details pane. Everything below
calls it `<new-ip>`.

Identify the instance by its **ID**, never by its address. The ID does not change.

### 2. Allow the new address through MongoDB Atlas

**Do this first.** The access list still holds the old address, so until it is
updated the server starts normally, connects to nothing, and every request fails
with an error that does not mention the network rule.

At [cloud.mongodb.com](https://cloud.mongodb.com) → **Network Access → Add IP
Address** → enter `<new-ip>` → Confirm. Delete the old entry once the new one
shows **Active**.

### 3. Point the server at its own new address

`CLIENT_URL` is the origin the API accepts cross-origin requests from. It still
names the old address.

```bash
ssh -i ~/.ssh/baringa-key.pem ubuntu@<new-ip>
cd ~/baringa-alumni-platform/server
nano .env
```

Change the one line:

```text
CLIENT_URL=http://<new-ip>
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`. Every other value in the file is still
correct and must not be touched.

```bash
pm2 restart baringa-api --update-env
pm2 logs baringa-api --lines 20
```

`--update-env` is required. A plain `pm2 restart` reuses the environment PM2
captured when the process was first started, so the edit has no effect and the
symptom looks unrelated to the change you just made.

The logs should show a database connection line and no errors. Leave the SSH
session with `exit`.

### 4. Check it, from your own machine

Run these locally, not on the instance — they test the path a real visitor takes,
through the security group and Nginx:

```bash
curl -s -o /dev/null -w "api:  %{http_code}\n" http://<new-ip>/api/health
curl -s -o /dev/null -w "feed: %{http_code}\n" http://<new-ip>/feed
```

Both `200`. The second confirms the built client is being served and that a
client-side route survives a direct request.

Then open **`http://<new-ip>`** in a browser and sign in as the administrator.

### 5. Update the two records of the address

```bash
sed -i 's/HostName .*/HostName <new-ip>/' ~/.ssh/config
```

Without this, `ssh baringa` hangs on a timeout that gives no hint of the cause.

Then update the URL wherever it is published — this README, the report cover page,
and anything already submitted.

### If it does not come up

| Symptom | Cause and fix |
|---|---|
| `curl` times out, but SSH works | Port 80 in the security group is allowed only from specific `/32` addresses. If **your own** network address has also changed, add it in the AWS console. |
| `502 Bad Gateway` | Nginx is up but the app is not. `pm2 list`, then `pm2 logs baringa-api --lines 30`. Almost always step 2 was skipped. |
| Pages load, every action fails | The Atlas rule is missing or still propagating. Confirm the new address shows **Active**. |
| SSH times out | `~/.ssh/config` still names the old address, or your own address needs adding to the port 22 rule. |
| Browser shows the old site | Cached. Hard-refresh with `Ctrl+Shift+R`. |

Fuller detail, including the address-change recovery checklist, is in
[`docs/deployment.md`](docs/deployment.md) §3 and §10.

---

## Deployment

**Deployment is manual, and CI/CD is explicitly out of scope for this phase per
the assessment brief.** There is no pipeline, no workflow file and no automated
release step; the procedure below is documented so it is reproducible by hand.

Target: a single AWS EC2 instance (`i-0b915c1f99ca7ba2d`, `t3.medium`, Ubuntu
Server 24.04 LTS, `ap-southeast-2`) running Node 22, Nginx and PM2, against a
MongoDB Atlas M0 cluster.

[`docs/deployment.md`](docs/deployment.md) is the authoritative procedure, with
the exact commands, expected output and verification for each step. The steps in
outline:

1. **Prepare the instance** (§4) — reclaim disk space, install Node.js 22 from
   NodeSource, plus Nginx and Git, then install PM2 globally.
2. **Configure Nginx as a reverse proxy** (§5) — `proxy_pass` the default site
   to `http://localhost:5000`, validate with `nginx -t`, restart and enable on
   boot. A 502 at this point is the correct result: nothing is listening yet.
3. **Prepare the database** (§6) — create the Atlas cluster, a dedicated
   database user, and a network access rule for the instance's public IP.
4. **Clone and install** (§7.1–7.2) — clone the repository and run
   `npm install` in `server/`.
5. **Build the client on the instance** (§7.2b) — `npm install && npm run build`
   in `client/`. This is not optional: `client/dist` is build output, is not in
   the repository, and Express serves it. Without it the API works and every
   page route returns 404.
6. **Create the production `.env`** (§7.3) — written by hand on the instance
   only, with a production-specific `JWT_SECRET` generated there.
7. **Start under PM2** (§7.4) — `pm2 start src/server.js --name baringa-api`,
   then `pm2 save` and `pm2 startup`, running the `sudo env PATH=...` command it
   prints and saving again so the app returns after a reboot.
8. **Seed the first administrator** (§7.5) — `npm run seed:admin` on the
   instance. Without it nobody can approve the first member.
9. **Verify** (§8) — PM2 status, health through both `localhost:5000` and
   Nginx, the JSON 404 on an unknown `/api` path, `/` and `/feed` both returning
   the client, clean logs with no credentials, and a reboot persistence test.

Redeploying an update (§9):

```bash
cd ~/baringa-alumni-platform
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
cd ../server && pm2 restart baringa-api --update-env
```

The client build is required on every redeployment, before the restart. Skipping
it leaves the previous bundle in place and serves the old client against the new
API with no error to notice.

No credential, connection string or key is committed. `.gitignore` excludes
`.env`, `*.pem` and `*.key`; `.env.example` lists variable names with no values;
and the production `.env` exists only on the instance.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/api.md`](docs/api.md) | The single endpoint reference. Every route with its guards, request shape, success response and failures, plus the shared response envelope and the error-code index. |
| [`docs/auth.md`](docs/auth.md) | The authentication and authorisation design: why the guards are composed as they are, the role and status model, where the token lives, where the first administrator comes from, and the client-side route guards that follow. |
| [`docs/deployment.md`](docs/deployment.md) | The full manual AWS EC2 procedure, including security configuration, verification, redeployment, credential rotation and known constraints. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branching and commit conventions for the project. |

---

## Known limitations

This phase delivers registration, administrator validation, in-app approval
notifications, and posting to the member feed. The following are **designed and
specified but scheduled for Phase 2**, and are not implemented:

| Not implemented | Notes |
|---|---|
| **Editing a post** | No update endpoint and no edit affordance. A published post is final. |
| **Deleting a post** | No delete endpoint. |
| **Post visibility control** | `visibility` is persisted on every post and defaults to `members_only`, but nothing acts on it. `public` has no view of its own — the feed sits behind the approval guard, so everything it returns is members-only in effect. |
| **Sharing a post** | No share action and no shareable per-post URL. |
| **Reactions** | No likes, no reaction counts, no reaction storage. |
| **Public visitor access** | Nothing is readable without an approved account. There is no public landing feed and no public profile view. |
| **Reporting** | No report action and no report records. |
| **Moderation** | `hidden` is persisted on every post and every feed query filters on it, so a post hidden directly in the database disappears from the feed — but nothing in the application sets it. There is no moderation queue and no hide action. The `moderator` role exists and is refused by administrator-only routes, but no endpoint grants it and no behaviour is built on it. |
| **Profile management** | No profile view and no way to edit a name, association or password after registration. |
| **CV upload** | No file upload of any kind. There is no storage, no upload endpoint and no `uploads/` content. |

Two further points, stated plainly rather than implied:

- **Approval notifications are in-app only, not email.** Approving a
  registration writes a `MEMBERSHIP_APPROVED` notification the member reads in
  the application. No mail is sent, no mail transport is configured, and there
  are no other notification types. Email delivery is Phase 2.
- **Administrator provisioning is deliberately outside the application.** No
  endpoint creates an administrator and no endpoint writes `role`. The first
  administrator is created by `npm run seed:admin` reading credentials from the
  environment. This is a design decision, not an omission: the first privileged
  account must come from somewhere the API cannot be talked into reaching. It
  does mean an administrator cannot be added or a password changed through the
  interface.

Operational constraints of the deployment — no HTTPS, no Elastic IP, per-IP
inbound access and a single instance with no redundancy — are documented in
[`docs/deployment.md`](docs/deployment.md) §10.
