# Authentication and account status

*Baringa University Alumni Platform — how an account proves who it is, and what it is allowed to do*
*Jira: `AUTH-1` (registration), `AUTH-4` (sign-in), `AUTH-7` (pending-registrant block),*
*`ADMIN-1` (registration queue), `ADMIN-2` (approve/reject)*

Registration is open to anyone. Acting on the platform is not: an administrator
validates each applicant against university records first. This document explains
the mechanism that enforces that gap and the reasoning behind it — on the server,
in the token, and in the client's routing.

**Endpoints are not documented here.** Paths, request shapes, response bodies and
status codes are in [the API reference](api.md), which is the single place they
live.

---

## 1. The two fields

Every account carries `role` and `status`, and they answer different questions.

| Field | Values | Question it answers |
|---|---|---|
| `status` | `pending`, `approved`, `rejected` | May this account act at all? |
| `role` | `member`, `moderator`, `administrator` | What is this account allowed to do? |

They are deliberately not collapsed into one field. A pending administrator is a
real state — the account is privileged but not yet validated — and it must be
barred like any other pending account.

### The transitions

Registration always produces `role: member` / `status: pending`. From there:

| From | To | By |
|---|---|---|
| `pending` | `approved` | An administrator, through the review endpoints |
| `pending` | `rejected` | An administrator, through the review endpoints |
| `approved` / `rejected` | anything | Nothing. A decision is final |

Nothing else in the API writes `status`, and nothing at all writes `role`. A
decided registration cannot be re-decided (§3), so the transitions form a
one-way step out of `pending` and stop.

The applicant is not notified of the outcome; there is no mail transport in this
release (F14 is a separate ticket). They see the decision the next time they load
the pending screen, and the copy on that screen says so rather than promising an
email.

### Where the first administrator comes from

Nothing in the API creates an administrator, and nothing in it ever should: an
endpoint that mints privilege is an endpoint that can be talked into minting it
for the wrong person. The first administrator is seeded out of band by
`server/src/scripts/seedAdmin.js` (`ADMIN-6`), run on the instance after
deployment:

```bash
cd server && npm run seed:admin
```

It reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` from the environment
and nothing else — no default, no fallback, so no administrator credential
exists in the repository to be committed — and creates one account with role
`administrator`, status `approved` and association `current_lecturer`. It is
idempotent: an administrator that is already there is reported and left
untouched, which is what makes it safe for deployment to run every time.

It also **refuses to promote an existing account**. If `ADMIN_EMAIL` names an
address already held by a member or a moderator, the script stops and says so
rather than raising that account's role. Promoting on the strength of a value in
a `.env` would be privilege escalation through a config file, and it would put a
member-to-administrator path back into the system by the back door.

This bootstraps the chain. Until it runs, every account on the platform is a
`pending` member and there is nobody who can approve one. The full procedure,
including where the three variables are set, is in
[the deployment procedure](deployment.md) §7.5.

---

## 2. The guards

Three middlewares in `server/src/middleware/auth.middleware.js`, composed left to
right on a route:

| Guard | Establishes |
|---|---|
| `requireAuth` | Who the caller is; loads the account onto `req.user` |
| `requireApproved` | That the account may act at all |
| `requireRole(...)` | That the account has the privilege |

```js
// Any member-only route
router.get('/posts', requireAuth, requireApproved, listPosts);

// An administrator-only route: status is still checked first
router.get('/registrations/pending', requireAuth, requireApproved,
           requireRole('administrator'), listPendingRegistrations);
```

What each one rejects with is in [api.md](api.md#guards).

**The order matters.** `requireApproved` stays in the middle on an administrator
route, and the review routes are no exception. A pending administrator is a real
state — privileged, but not itself validated — so leaving the guard out would let
one approve their own registration by approving everybody's.

**A route is member-only exactly when it carries `requireApproved`.** Adding a
member feature means adding those two guards and nothing else; there is no
allowlist to keep in step and no status check inside a controller.

`requireAuth` reloads the account from the database on every request rather than
trusting the token's `role` and `status` claims, and `requireApproved` reads the
status from that reloaded document. An approval or a rejection therefore takes
effect on the member's very next request, not when their token happens to
expire — and an administrator demoted mid-session loses access immediately.

### Routes that stay open to a pending account

Reading your own profile takes `requireAuth` alone, on purpose. It is how the
pending screen learns where the registration stands, so gating it on approval
would lock an applicant out of the one thing they are allowed to see.
Registration and sign-in are public and take no guard at all.

### Sign-in is not the gate

A pending or rejected account signs in normally: correct credentials return a
token and the account with its `status`. Refusing the sign-in instead would leave
an applicant with no way to see where their registration stands, and would make
"not approved yet" indistinguishable from "wrong password" — which the sign-in
failure is deliberately vague about (§4). The token is issued; `requireApproved`
is what the token cannot get past.

### A moderator is not a junior administrator

`requireRole('administrator')` turns a moderator away exactly as it turns a
member away. Moderator is a privilege laid on a member account, not a step on the
way to administrator, and reviewing registrations is not among the things it
grants. Nothing in this release gives a moderator a way into the review routes.

---

## 3. Deciding a registration

The administrator review routes are the only way an account leaves `pending`.
Three rules sit on top of the guards.

### Nobody decides their own registration

An administrator that points a decision at their own id is refused before the
database is touched.

The guards make self-approval unreachable already, twice over: `requireApproved`
runs before `requireRole`, so an administrator who is still `pending` never
reaches the controller, and one who is already `approved` has nothing left to
approve. Both of those are *consequences* of other rules rather than the rule
itself, and the first stops holding the moment somebody reorders the guard chain.
The check is therefore made inside the operation, where it holds regardless of
what sits above it.

Rejection is covered too. The escalation risk is all on the approve side, but
"no administrator decides their own registration" is worth being able to state
without an exception.

Ids are compared as ObjectIds, not as strings. MongoDB reads hex
case-insensitively, so an upper-cased id addresses the very same document while
comparing unequal as text — a string check would wave it straight through.

### A decision is made once

An account that is no longer `pending` is refused a second decision, whichever
way each one went. Repeating it silently would be worse than refusing: it would
overwrite the first administrator's `approvedBy` and `approvedAt`, erasing who
actually made the call, and it would tell the second administrator nothing about
why the applicant they were looking at had already gone from their queue.

The update is one conditional write — `{ _id, status: 'pending' }` — rather than
a read, a check and a write, so two administrators pressing Approve at the same
moment cannot both succeed. Exactly one matches; the other matches nothing, and
only then is a second read made to say whether the id is unknown or the
registration has already been decided.

### Approval confers no privilege

Approving moves `status` from `pending` to `approved` and nothing else, which is
what makes an applicant a member. It writes no `role`. No endpoint in the API
writes that field today, and no endpoint ever creates an administrator: that
account comes only from the seeding script in §1. `ADMIN-5` (BAP-24, Sprint 2)
adds the one thing that will write it — an administrator granting `moderator` to
an existing member — which is a privilege laid on a member account, not a new
kind of account, and still nothing an account can ask for on its own behalf.

`approvedBy` is written for a rejection too: the field records who reviewed the
account, whichever way the decision went.

---

## 4. The credential

### The token

Sign-in issues a stateless JWT (`server/src/config/jwt.js`), signed with
`JWT_SECRET` and carrying `sub`, `role` and `status`. The two account claims are
a convenience for the client, not an authority: `requireAuth` reloads the account
on every request and treats the database as the source of truth (§2).

Expiry comes from `JWT_EXPIRES_IN`, defaulting to `1d` when it is unset;
deployments set it explicitly. There is no refresh token and no server-side
session, so **sign-out is a client-side act** — the token is simply forgotten.
Nothing can revoke an outstanding one before it expires, which is the trade-off
accepted for statelessness, and it is survivable only because authorisation is
re-read per request: a revoked *account* stops working immediately even though
its token remains valid.

### Where it is stored

The token is persisted in `localStorage` under `baringa_token` (decision #43),
defined once as `TOKEN_STORAGE_KEY` in `client/src/auth/tokenStorage.js`. That
module is the only place in the client that touches the key.

Not `sessionStorage` — a refresh in a new tab would sign the member out. Not a
cookie — the API reads `Authorization`, not `Cookie`, and nothing here is
same-site protected. Not memory alone — a refresh would drop the session. The
trade-off accepted with that decision is XSS exposure: any script running on this
origin can read the token, which is why the key has exactly one accessor and why
the token is never logged or printed.

`localStorage` can be unavailable — private modes, blocked site data — so every
read and write is guarded and failure degrades to a session that lasts until the
tab closes rather than crashing the app.

On mount, `AuthProvider` (`client/src/context/AuthProvider.jsx`) offers a stored
token to the server before trusting it. An authentication failure clears storage
and drops to the signed-out state, so a token that was revoked, expired or
orphaned server-side cannot leave a signed-in shell on screen. Any other failure
keeps the token for the next attempt but shows no account, since a network fault
is not evidence the credential is bad.

### The sign-in failure says nothing about the account

Every rejected sign-in answers with one message, from a single `return` statement
in `login` (`server/src/controllers/auth.controller.js`). A wrong password and an
address the platform has never seen must be indistinguishable, or the sign-in
form becomes a way to test whether somebody holds an account here.

Three things hold that up, and all three are load-bearing:

- **One message, one exit.** `INVALID_CREDENTIALS_MESSAGE` is used from exactly
  one place and must never be specialised. Keeping it to a single statement is
  also what makes the two responses byte-identical: outside production the error
  handler echoes a stack trace, and a second `next(...)` site would record a
  different line number in it and leak which branch was taken.
- **Equal cost.** An unknown email is put through a bcrypt comparison against a
  decoy digest, so it costs about what a wrong password costs. Without it, a
  known address takes a hash and an unknown one returns immediately — a timing
  signal answering the very question the generic failure refuses to.
- **A thinner validator.** The sign-in chain checks only that something usable
  was submitted. Applying the registration password rules here would tell an
  attacker which of the two credentials they got wrong.

Registration cannot be made to keep the same secret — it must refuse a duplicate
address — so this protects the sign-in form only.

---

## 5. The client's guards

The client mirrors the server's three questions so a caller is turned away for
the same reason and at the same point the API would. **None of it is the
enforcement.** It runs in the browser, on a role and status the browser was told;
the server re-reads the account on every request and is what actually holds the
data shut.

| Path | Guard | Screen |
|---|---|---|
| `/register` | public | `RegisterPage` |
| `/login` | public | `LoginPage` |
| `/pending` | `RequireAuth` | `PendingApprovalPage` |
| `/feed` | `RequireAuth` | `MemberFeedPage` |
| `/admin` | `RequireAuth` → `AdminRoute` | `AdminDashboardPage` |
| `/admin/registrations/:id` | `RequireAuth` → `AdminRoute` | `RegistrationReviewPage` |
| `/` and anything unmatched | `RequireAuth` | redirect to `/feed` |

Only the two public paths skip the guard. Everything else — the root and every
unrecognised address included — goes through it, so one component decides where a
visitor belongs and the answer cannot differ by which URL they happened to arrive
at. Sending the root to `/login` unconditionally would bounce a member who is
*already* signed in back to a sign-in form.

### `RequireAuth`

`client/src/components/RequireAuth.jsx` answers two questions in order:

1. **Signed in?** No → `/login`, with the attempted location kept in history
   state.
2. **Approved?** No → `/pending`, whatever was asked for. Yes, and `/pending` was
   asked for → `/feed`.

The second rule runs in both directions on purpose. Holding a pending member at
`/pending` without also releasing an approved one from it would leave anyone
approved mid-session parked on a screen with no way forward. Every redirect uses
`replace`, so the bounced URL does not sit in history waiting for the Back
button.

While the stored token is still being checked against the server the guard
renders a waiting state instead of redirecting; redirecting during that window
would sign a member out every time they refreshed a guarded page.

### `AdminRoute`

`client/src/components/AdminRoute.jsx` nests inside `RequireAuth` on the two
administrator paths and asks the same three questions the server's middleware
asks, in the same order:

| Question | No → | Mirrors |
|---|---|---|
| Signed in? | `/login`, remembering the attempted location | `requireAuth` |
| Approved? | `/pending` | `requireApproved` |
| Administrator? | `/feed`, carrying an explanation | `requireRole('administrator')` |

The first two duplicate `RequireAuth`, which these routes already sit behind.
That is deliberate: a guard that only works in one arrangement is one bad merge
away from opening the area to everybody, so `AdminRoute` fails closed on its own.

### A refusal is always visible

A member who follows a link to `/admin` arrives at their feed with "That area is
for administrators" explaining the trip. A silent bounce would read as a broken
link and a blank screen as a broken app; making the authorisation boundary
visible is a requirement of the ticket rather than a nicety. `useFlashMessage`
(`client/src/hooks/useFlashMessage.js`) carries the message across the redirect
and then rewrites the history entry without it, so a refresh does not show it
twice.

The same rule governs what the header offers. `HeaderNav`
(`client/src/components/HeaderNav.jsx`) renders nothing at all unless the account
is *approved* — a pending one is held at `/pending`, so offering it links it
would be bounced off would be an invitation to a dead end — and adds
**Dashboard** for an administrator. Hiding that entry is presentation, not
protection: `AdminRoute` refuses the URL whether or not a link to it was shown,
and the server refuses the data regardless. An entry whose screen does not exist
yet is drawn `aria-disabled` rather than pointed at a path that would fall
through to the feed and look like a bug.

### The pending screen

`PendingApprovalPage` renders two states, keyed off `status`, because the guard
sends every non-approved account here and not only the ones still waiting:
`pending` ("Your registration is being reviewed") and `rejected` ("Your
registration was not approved", pointing the member at the alumni office).
Telling a rejected member their registration is "being reviewed" would be untrue
and would leave them refreshing forever.

Its summary panel shows the name and address the member is signed in as, not the
association, student number and graduation year the prototype lists. The account
projection returns five fields and no more, and widening it is a change to the
shape of *every* account response rather than an addition to one screen — the
two `toEqual` assertions in `server/tests/auth.login.test.js` pin those payloads
precisely so a field cannot appear in them by accident. Deciding what a member's
profile exposes, and to whom, is the job of whichever ticket introduces one. The
panel still does the work the prototype's panel was there for: it confirms
*which* registration is under review.

---

## 6. Automated coverage

```bash
cd server && npm test
```

`server/tests/auth.approved.test.js` covers the guards, mounted on a throwaway
route so the composition is tested rather than the middleware in isolation.
`server/tests/auth.login.test.js` pins the sign-in and profile payloads.
`server/tests/admin.approval.test.js` covers the review endpoints against the
real app: the queue's contents and ordering, its paging, approval recording the
approver and timestamp, the refusal of a second decision, a missing and a
malformed id, the refusal of self-review in both directions and in either hex
casing, and every caller who may not be there — including an administrator who
has not been approved themselves.

There is no client test runner in this release, so the guards and screens are
verified by hand; `npm run lint` and `npm run build` in `client/` are what CI
checks. `docs/SEEDING-GUIDE.md` §6 walks the same boundaries with `curl` against
seeded accounts.
