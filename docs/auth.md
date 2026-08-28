# Authentication and account status

*Baringa University Alumni Platform — how an account proves who it is, and what it is allowed to do*
*Jira: `AUTH-1` (registration), `AUTH-4` (sign-in), `AUTH-7` (pending-registrant block),*
*`ADMIN-1` (registration queue), `ADMIN-2` (approve/reject)*

Registration is open to anyone. Acting on the platform is not: an administrator
validates each applicant against university records first. This document is the
single reference for the mechanism that enforces that gap — on the server, in
the response contract, and in the client's routing.

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

Registration always produces `role: member` / `status: pending`. Only an
administrator moves an account on from there, through the three endpoints in
§3. Nothing else in the API writes `status`, and nothing at all writes `role`.

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

| Guard | Establishes | Rejects with |
|---|---|---|
| `requireAuth` | Who the caller is; loads the account onto `req.user` | 401 |
| `requireApproved` | That the account may act | 403 `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` |
| `requireRole(...)` | That the account has the privilege | 403 |

```js
// Any member-only route
router.get('/posts', requireAuth, requireApproved, listPosts);

// An administrator-only route: status is still checked first
router.get('/registrations/pending', requireAuth, requireApproved,
           requireRole('administrator'), listPendingRegistrations);
```

`requireApproved` stays in the middle on an administrator route, and the review
routes in §3 are no exception. A pending administrator is a real state — the
account is privileged but has not itself been validated — so leaving the guard
out would let one approve their own registration by approving everybody's.

**A route is member-only exactly when it carries `requireApproved`.** Adding a
member feature means adding those two guards and nothing else; there is no
allowlist to keep in step and no status check inside a controller.

`requireAuth` reloads the account from the database on every request rather than
trusting the token's `role` and `status` claims, and `requireApproved` reads the
status from that reloaded document. An approval or a rejection therefore takes
effect on the member's very next request, not when their token happens to
expire.

### Routes that stay open to a pending account

`GET /api/auth/me` takes `requireAuth` alone, on purpose. It is how the pending
screen learns where the registration stands, so gating it on approval would lock
an applicant out of the one thing they are allowed to see. `POST /api/auth/register`
and `POST /api/auth/login` are public and take no guard at all.

### Sign-in is not the gate

A pending or rejected account signs in normally: correct credentials return
`200`, a token, and the account with its `status`. Refusing the sign-in instead
would leave an applicant with no way to see where their registration stands, and
would make "not approved yet" indistinguishable from "wrong password" — which
the 401 is deliberately vague about. The token is issued; `requireApproved` is
what the token cannot get past.

---

## 3. The administrator review endpoints

Mounted at `/api/admin` (`server/src/routes/admin.routes.js`), handled by
`server/src/controllers/admin.controller.js`. These three are the only way an
account leaves `pending`.

| Endpoint | Ticket | Does |
|---|---|---|
| `GET /api/admin/registrations/pending` | `ADMIN-1` | The review queue, oldest first |
| `PATCH /api/admin/registrations/:id/approve` | `ADMIN-2` | Sets `status: approved` |
| `PATCH /api/admin/registrations/:id/reject` | `ADMIN-2` | Sets `status: rejected` |

`PATCH` rather than `POST` or `DELETE`: both decisions change one field on an
account that already exists, and neither creates or removes anything.

### Authorisation

All three carry the same guards in the same order — `requireAuth`,
`requireApproved`, `requireRole('administrator')` — so the failures stack in
that order too:

| Caller | Answer |
|---|---|
| No token, or one that is expired, malformed or no longer resolves | 401, no `code` |
| Signed in, account `pending` or `rejected` | 403 `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` |
| Signed in and approved, role `member` or `moderator` | 403, no `code` |
| Signed in, approved, role `administrator`, `:id` is their own account | 403 `SELF_REVIEW_FORBIDDEN` |
| Signed in, approved, role `administrator` | Through |

A moderator is turned away exactly like a member: moderation privileges are not
review privileges, and nothing in this release grants a moderator a way in here.
The presence or absence of `code` on the 403 is what separates "your account may
not act yet" from "your account may act, but not on this" — see §4.

### The queue

```
GET /api/admin/registrations/pending?page=1&limit=20
```

```json
{
  "success": true,
  "data": {
    "registrations": [
      {
        "id": "6870f1c2a4b39d0012ab34cd",
        "name": "Amina Uwase",
        "email": "amina.uwase@example.com",
        "association": "former_student",
        "studentNumber": "n10428837",
        "graduationYear": 2019,
        "registeredAt": "2026-01-14T09:12:44.310Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

Only `status: pending` accounts appear; an account drops out of the queue the
moment it is decided. **Ordering is `createdAt` ascending** — the longest wait is
at the top, so nobody is pushed down the list by a steady arrival of newer
registrations.

This projection is wider than `toSafeUser` on purpose. An administrator is
deciding whether this person is who they say they are, so the queue carries the
details the applicant declared at registration — association, student number,
graduation year — which `/api/auth/login` and `/api/auth/me` do not return. It is built
from a named field list rather than an exclusion, so a column added to the
schema later cannot start appearing here by accident, and the password digest
has no route into it at all.

`page` defaults to 1 and `limit` to 20, capped at 100 so a hand-written
`?limit=100000` cannot ask for the whole members collection in one request.
Both are optional; supplying one that is not a whole number in range is a 400
rather than a silent reset, so a client paging with a bad cursor hears about it.
`total` counts the entire queue rather than the page, which is what lets the
dashboard say "20 of 340 awaiting review" without a second request.

### A decision

```
PATCH /api/admin/registrations/6870f1c2a4b39d0012ab34cd/approve
```

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6870f1c2a4b39d0012ab34cd",
      "name": "Amina Uwase",
      "email": "amina.uwase@example.com",
      "role": "member",
      "status": "approved",
      "approvedBy": "6870e0aa1f2b4c0011990022",
      "approvedAt": "2026-01-15T22:03:07.881Z"
    }
  }
}
```

The account is `toSafeUser` plus the two fields that record the decision, so the
account contract stays single-sourced and the response still says who acted and
when. `approvedBy` is the acting administrator's id and is written **for a
rejection too**: the field records who reviewed the account, whichever way the
decision went.

Approving moves `status` and nothing else — `pending` to `approved`, which is
what makes an applicant a member. **It confers no role.** No endpoint in the API
writes `role` today, and no endpoint ever creates an administrator: that account
comes only from the seeding script in §1, run outside the application. `ADMIN-5`
(BAP-24, Sprint 2) adds the one thing that does write the field — an
administrator granting `moderator` to an existing member — which is a privilege
laid on a member account, not a new kind of account, and still nothing an
account can ask for on its own behalf.

The member does not have to sign in again. `requireAuth` reloads the account on
every request, so a decision takes effect on their very next one.

### Nobody decides their own registration

An administrator that points `approve` or `reject` at their own id is refused
with **403 `SELF_REVIEW_FORBIDDEN`**, before the database is touched.

The guards make self-approval unreachable already, twice over: `requireApproved`
runs before `requireRole`, so an administrator who is still `pending` never
reaches the controller, and one who is already `approved` has nothing left to
approve and would get the 409 below. Both of those are *consequences* of other
rules rather than the rule itself, and the first stops holding the moment
somebody reorders the guard chain. The check is therefore made inside the
operation, where it holds regardless of what sits above it.

Rejection is covered too. The escalation risk is all on the approve side, but
"no administrator decides their own registration" is worth being able to state
without an exception.

Ids are compared as ObjectIds, not as strings. MongoDB reads hex
case-insensitively, so an upper-cased `:id` addresses the very same document
while comparing unequal as text — a string check would wave it straight through.

This is the last of the layers keeping privilege out of the API's reach. Nothing
here creates an administrator (§1), nothing here writes `role`, and now nothing
here lets the one account that *can* decide registrations decide its own.

### Deciding twice is refused

An account that is no longer `pending` answers **409 `REGISTRATION_NOT_PENDING`**
— to a second approval, and to a rejection after an approval alike. Repeating
the decision silently would be worse than refusing it: it would overwrite the
first administrator's `approvedBy` and `approvedAt`, erasing who actually made
the call, and it would tell the second administrator nothing about why the
applicant they were looking at had already gone from their queue.

The update is one conditional write — `{ _id, status: 'pending' }` — rather than
a read, a check and a write, so two administrators pressing Approve at the same
moment cannot both succeed. Exactly one matches; the other matches nothing, and
only then is a second read made to say whether the id is unknown (404) or the
registration has already been decided (409).

### Response codes

| Status | When | `code` |
|---|---|---|
| 200 | Listed, approved or rejected | — |
| 400 | `:id` is not a valid ObjectId, or `page` / `limit` is not a usable number | — |
| 401 | Not signed in | — |
| 403 | Signed in, but not an approved administrator | `ACCOUNT_PENDING` / `ACCOUNT_REJECTED`, or none |
| 403 | An administrator pointing the route at their own account | `SELF_REVIEW_FORBIDDEN` |
| 404 | No account has that id | — |
| 409 | The registration has already been decided | `REGISTRATION_NOT_PENDING` |

`:id` is checked against `mongoose.isValidObjectId` before it reaches the
database (`server/src/validators/admin.validator.js`). Without that, a malformed
id raises a Mongoose `CastError` deep inside the update, which arrives at the
centralised handler with no `status` and is reported as a 500 — a server fault,
for what is the caller's malformed URL.

The 400 is deliberately not the 422 the registration and login forms answer
with. 422 says "the form you submitted was understood and its contents were
wrong", which is what puts field-level messages beside inputs; this is a request
the server could not make sense of in the first place, and there is no form
behind it to annotate. The `errors` array is still populated, so the offending
parameter is named either way.

### Not in these tickets

Two things these tickets deliberately stop short of:

- **Notifying the applicant** of the outcome (F14). The decision is visible when
  they next load the pending screen; nothing is sent to them. The dashboard's
  confirmation says so in as many words rather than repeating the prototype's
  "the member has been notified" — see §5.
- **Granting `moderator`** — `ADMIN-5` (BAP-24, Sprint 2), a separate endpoint on
  a separate ticket. Approving a registration is not a step towards it: an
  approved member has role `member` and stays there until an administrator
  grants the privilege.

The screens that consume these endpoints (F17, F18) are the client half of the
same two tickets and are described in §5.

---

## 4. Response codes

The failure envelope (see `server/src/app.js`) carries an optional `code`
alongside `message`:

```json
{
  "success": false,
  "message": "Your registration is still being reviewed by an administrator",
  "errors": [],
  "code": "ACCOUNT_PENDING"
}
```

`code` appears only where the client is expected to branch on *which* failure
this is rather than merely report it. It is a stable SCREAMING_SNAKE identifier;
the `message` beside it is wording for a person and may be reworded without
notice, so **client code matches on `code`, never on `message`**.

| Code | Status | Raised by | Meaning |
|---|---|---|---|
| `ACCOUNT_PENDING` | 403 | `requireApproved` | The registration has not been reviewed yet |
| `ACCOUNT_REJECTED` | 403 | `requireApproved` | The registration was reviewed and turned down |
| `REGISTRATION_NOT_PENDING` | 409 | `approveRegistration` / `rejectRegistration` | This registration has already been decided (§3) |
| `SELF_REVIEW_FORBIDDEN` | 403 | `approveRegistration` / `rejectRegistration` | An administrator may not decide their own registration (§3) |

On the client both are exported as `ADMIN_ERROR_CODE` from
`client/src/api/admin.js`, with `isAlreadyReviewed(error)` and
`isSelfReview(error)` beside them — the same shape `api/auth.js` uses for the
two account codes. The review screen branches on the first of those to tell "you
are looking at a stale queue" apart from "the request failed"; see §5.

Failures without a `code` — the 401s, `requireRole`'s 403, validation 422s, the
400s and 404s in §3 — carry `message` and `errors` only. Each of those is
unambiguous from its status and the route it came back from; a code earns its
place only where two failures share a status and the client has to tell them
apart, as `requireApproved`'s two 403s do, or where the client is expected to
act differently — a `REGISTRATION_NOT_PENDING` means "somebody else has already
handled this, refresh the queue" rather than "something went wrong".

To emit one, attach `errorCode` to the error the centralised handler receives.
The property is `errorCode` rather than `code` because `code` is already taken on
errors thrown from outside this codebase: MongoDB's duplicate-key error uses
`11000` and Node's filesystem errors use `ENOENT` and friends, none of which are
part of this API's contract.

On the client, `ApiError` exposes the value as `error.code`
(`client/src/api/client.js`), and `client/src/api/auth.js` exports the two
account constants as `AUTH_ERROR_CODE` together with `isAccountNotApproved(error)`.
A member-only call turned away for this reason is therefore recognisable as
exactly that, rather than surfacing as a generic "something went wrong".
`REGISTRATION_NOT_PENDING` has no client constant yet; it gets one with the
dashboard that consumes it (F18), which is the first screen able to act on it.

---

## 5. Client routes

| Path | Guard | Screen |
|---|---|---|
| `/register` | public | `RegisterPage` (F04.1) |
| `/login` | public | `LoginPage` (F05.1) |
| `/pending` | `RequireAuth` | `PendingApprovalPage` (F06.1) |
| `/feed` | `RequireAuth` | `MemberFeedPage` (F07.2) |
| `/admin` | `RequireAuth` → `AdminRoute` | `AdminDashboardPage` (F17.1 / F17.2) |
| `/admin/registrations/:id` | `RequireAuth` → `AdminRoute` | `RegistrationReviewPage` (F18.1 / F18.4) |
| `/` and anything unmatched | `RequireAuth` | redirect to `/feed` |

Only `/register` and `/login` are public. Everything else — the root and every
unrecognised address included — goes through the guard, so one component decides
where a visitor belongs and the answer cannot differ by which URL they happened
to arrive at. Sending the root to `/login` unconditionally would bounce a member
who is *already* signed in back to a sign-in form; routing it through the guard
puts an anonymous visitor at `/login`, an account awaiting review at `/pending`,
and an approved member on the feed. The splat scores below every literal path,
so it is consulted only when nothing else matches.


### The administrator area

`/admin` and `/admin/registrations/:id` nest a second guard inside the first.
`AdminRoute` (`client/src/components/AdminRoute.jsx`) asks the same three
questions the server's middleware asks, in the same order, so the client turns a
caller away for the same reason and at the same point the API would:

| Question | No → | Mirrors |
|---|---|---|
| Signed in? | `/login`, remembering the attempted location | `requireAuth` |
| Approved? | `/pending` | `requireApproved` |
| Administrator? | `/feed`, carrying an explanation | `requireRole('administrator')` |

The first two duplicate `RequireAuth`, which these routes already sit behind.
That is deliberate: a guard that only works in one arrangement is one bad merge
away from opening the area to everybody, so `AdminRoute` fails closed on its own.

**A refused member is told why.** The third answer carries a message in
`location.state` and `MemberFeedPage` renders it, so a member who follows a link
to `/admin` arrives at their feed with "That area is for administrators"
explaining the trip. A silent bounce would read as a broken link, and a blank
screen as a broken app; making the authorisation boundary visible is a
requirement of the ticket rather than a nicety. `useFlashMessage`
(`client/src/hooks/useFlashMessage.js`) is what carries such a message across a
redirect and then rewrites the history entry without it, so a refresh does not
show it a second time.

**The header navigation follows the same rule.** `HeaderNav`
(`client/src/components/HeaderNav.jsx`) draws the bar beside the wordmark and
renders nothing at all unless the account is *approved* — a pending one is held
at `/pending`, so offering it links it would be bounced off would be an
invitation to a dead end, and F06.1's header is the bare wordmark and Sign out.
For an approved account it renders **Feed** and **Profile** as F07.2 draws them,
and adds **Dashboard** for an administrator. Hiding that third entry is
presentation, not protection — `AdminRoute` refuses the URL whether or not a link
to it was ever shown, and the server refuses the data regardless.

Three details of that bar depart from the prototypes:

- **"Dashboard", not "Registrations".** F17.1 labels it for what the screen
  currently lists; it is named for the screen itself, which the queue is only the
  first thing on.
- **Every entry is purple.** The prototypes colour the current item purple and
  the rest grey, which reads as two kinds of control rather than one bar of
  them. All entries take the same `primary-text` as Sign out and the underline
  alone carries "you are here".
- **The bar is visible at every width**, where the prototypes hide it below
  `md`. The dashboard is meant to be usable on a phone, and hiding the only way
  to reach it there would undo that.

**Profile is drawn but not linked.** The screen behind it arrives with F07.2, so
the entry is marked `aria-disabled` rather than pointed at a `/profile` that does
not exist — an unmatched path falls through the router's splat and lands the
member back on the feed, which looks like a bug rather than an unbuilt screen.

As with `RequireAuth`, **this guard is a convenience, not the enforcement.** It
runs in the browser on a role the browser was told. `requireRole('administrator')`
re-reads the account on every request, so an administrator demoted mid-session
loses the data even while a stale tab still draws the screen.

### The dashboard and the review panel

`AdminDashboardPage` (F17) lists the queue oldest-first in a table that becomes
stacked cards below 640px, since the screen is plausibly used on a phone. It
renders exactly one of four states — loading, error with a retry, empty (F17.2),
or the table — because an administrator shown an empty table that is really a
failed request will close the tab believing the work is done.

`RegistrationReviewPage` (F18) shows the declared details and the two decisions.
Both open a confirmation first: the decisions are irreversible, the server
answers 409 to a second one, and neither should be a single misclick. On success
the screen returns to the dashboard, which reloads the queue, and the
confirmation arrives there as a toast (F18.4) — so the administrator *sees* the
applicant gone rather than being told they are.

Three departures from the prototypes, all deliberate:

- **The confirmation does not promise a notification.** F18.4 reads
  "Registration approved — the member has been notified". Nothing is sent; F14
  is a separate ticket. The copy says what actually happens instead, the same
  departure decision #39 makes on the pending screen.
- **No search or filter controls.** F17.1 draws both. The API takes `page` and
  `limit` and nothing else, and a search box that quietly filtered one page of
  results would be worse than none.
- **Graduation year is its own column.** F17.1 folds it under the association as
  "Class of 2023"; a lecturer has no class year to fold, and the ticket calls for
  it as a column.

Because there is no `GET /admin/registrations/:id` — the queue is the only read
the API offers — the review screen finds its applicant *in* the queue. That has a
useful consequence: an applicant who is not in the queue is one who is no longer
pending, which is exactly the state to report when another tab got there first.
The same reasoning covers the 409: it is shown as "this had already been
reviewed, the queue has been refreshed" rather than as a failure, because nothing
is broken and retrying would not help.

### The member screens

`/pending` sits behind the same guard as `/feed` rather than beside it, because
`RequireAuth` (`client/src/components/RequireAuth.jsx`) routes *between* the two
on account status. It answers two questions in order:

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

Sign-in navigates straight to the right screen by status
(`DESTINATION_BY_STATUS` in `LoginPage`), so the guard is a correction for later
navigations rather than something the member sees bounce on the way in.

**This guard is a convenience, not the enforcement.** It runs in the browser on a
status the browser was told; `requireApproved` on the server is what actually
holds member-only data shut, and it re-reads the account per request.

### The pending screen

`PendingApprovalPage` follows
`docs/prototype/05-BaringaAlumni - F06.1 Pending.html`, with two departures:

- **No email is promised (decision #39).** The prototype says "a confirmation
  email will be sent to you once your account is approved". There is no mail
  transport in this release, so the copy instead tells the member that the
  outcome appears on this screen the next time they sign in, and that an
  approved account is carried straight through to the member area.
- **The summary panel shows identity, not the declared details.** The prototype
  lists association type, student number and graduation year. The API does not
  return them: `toSafeUser` in `server/src/controllers/auth.controller.js` — the
  single projection every endpoint that returns an account goes through —
  answers with `id`, `name`, `email`, `role` and `status` and nothing else.

  Widening that contract was rejected for this ticket on two counts. It is a
  change to the shape of *every* account response, not an addition to the
  pending screen, and it would have broken the two `toEqual` assertions in
  `server/tests/auth.login.test.js` that pin the login and `/me` payloads to
  exactly those five fields — assertions that exist precisely to catch a field
  appearing in a response by accident. Deciding what a member's profile exposes,
  and to whom, is the job of whichever ticket introduces one.

  So the panel shows the name and address the member is signed in as. That still
  does the work the prototype's panel was there for: it confirms *which*
  registration is the one being reviewed. When a profile ticket widens
  `toSafeUser`, the three declared fields can be added as further `SummaryRow`s
  with no other change to this screen.

The screen renders two states, keyed off `status`, because the guard sends every
non-approved account here and not only the ones still waiting: `pending` (warning
tokens, "Your registration is being reviewed") and `rejected` (danger tokens,
"Your registration was not approved", pointing the member at the alumni office).
Telling a rejected member their registration is "being reviewed" would be untrue
and would leave them refreshing forever.

---

## 6. Verifying the block

With the API running (`cd server && npm run dev`) and a pending account
registered:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"applicant@example.com","password":"<password>"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# open to a pending account: 200, status "pending"
curl -s http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"

# any member-only route: 403 with "code":"ACCOUNT_PENDING"
curl -s http://localhost:5000/api/posts -H "Authorization: Bearer $TOKEN"
```

No member-only route ships yet — posts and the feed are later tickets — so
until one does, the second call is made against a throwaway route mounting
`requireAuth, requireApproved` against the same database.

### Deciding the registration

The quickest check is the dashboard itself: sign in as the seeded administrator
and go to **Administrator** in the header, or straight to `/admin`. The applicant
is in the queue; Review, then Approve, returns to the queue with them gone from
it. Signing in as an ordinary member and asking for `/admin` bounces to the feed
with an explanation, which is the client half of the same boundary.

The `curl` walkthrough below tests the API without the UI in the way — and is
still what to reach for when a screen and the server disagree, since it says
which of the two is wrong. Signed in as the seeded administrator (§1), the
endpoints in §3 move the account on. `ADMIN_TOKEN` below is that administrator's token, obtained exactly as
`TOKEN` was above:

```bash
# the queue, oldest first: the applicant is in it
curl -s http://localhost:5000/api/admin/registrations/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# approve them (take the id from the queue above)
curl -s -X PATCH http://localhost:5000/api/admin/registrations/<id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# again: 409 with "code":"REGISTRATION_NOT_PENDING"
curl -s -X PATCH http://localhost:5000/api/admin/registrations/<id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The approval opens the member-only call on the applicant's **next** request with
no new sign-in — their `$TOKEN` from above still works and still claims
"pending", and the account is re-read per request. Rejecting instead returns the
same 403 as before with `"code":"ACCOUNT_REJECTED"`. Repeating the queue call
shows the account gone from it either way. `scripts/db-query.js` lists accounts
and their statuses read-only.

Repeating any of the three calls with the applicant's `$TOKEN` rather than
`$ADMIN_TOKEN` answers 403, and with no token at all, 401.

The administrator pointing either decision at their **own** id answers 403 with
`"code":"SELF_REVIEW_FORBIDDEN"`, upper-cased hex included:

```bash
curl -s -X PATCH http://localhost:5000/api/admin/registrations/<own-id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Automated coverage

```bash
cd server && npm test
```

There is no client test runner in this release, so the administrator screens are
verified by hand against the four states above; `npm run lint` and `npm run build`
in `client/` are what CI checks.

`server/tests/auth.approved.test.js` covers the guards, mounted on a throwaway
route so the composition is tested rather than the middleware in isolation.
`server/tests/admin.approval.test.js` covers the review endpoints against the
real app: the queue's contents and ordering, its paging, approval recording the
approver and timestamp, the 409 on a second decision, the 404 and 400 on a
missing and a malformed id, the refusal of self-review in both directions and
in either hex casing, and the 401/403 for every caller who may not be there —
including an administrator who has not been approved themselves.
