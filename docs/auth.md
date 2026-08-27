# Authentication and account status

*Baringa University Alumni Platform — how an account proves who it is, and what it is allowed to do*
*Jira: `AUTH-1` (registration), `AUTH-4` (sign-in), `AUTH-7` (pending-registrant block)*

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
administrator moves an account on from there (`ADMIN-*`).

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
router.get('/registrations', requireAuth, requireApproved,
           requireRole('administrator'), listRegistrations);
```

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

## 3. Response codes

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

Failures without a `code` — the 401s, `requireRole`'s 403, validation 422s — are
unchanged and still carry `message` and `errors`.

To emit one, attach `errorCode` to the error the centralised handler receives.
The property is `errorCode` rather than `code` because `code` is already taken on
errors thrown from outside this codebase: MongoDB's duplicate-key error uses
`11000` and Node's filesystem errors use `ENOENT` and friends, none of which are
part of this API's contract.

On the client, `ApiError` exposes the value as `error.code`
(`client/src/api/client.js`), and `client/src/api/auth.js` exports the two
constants as `AUTH_ERROR_CODE` together with `isAccountNotApproved(error)`. A
member-only call turned away for this reason is therefore recognisable as
exactly that, rather than surfacing as a generic "something went wrong".

---

## 4. Client routes

| Path | Guard | Screen |
|---|---|---|
| `/register` | public | `RegisterPage` (F04.1) |
| `/login` | public | `LoginPage` (F05.1) |
| `/pending` | `RequireAuth` | `PendingApprovalPage` (F06.1) |
| `/feed` | `RequireAuth` | `MemberFeedPage` (F07.2) |
| `/` and anything unmatched | `RequireAuth` | redirect to `/feed` |

Only `/register` and `/login` are public. Everything else — the root and every
unrecognised address included — goes through the guard, so one component decides
where a visitor belongs and the answer cannot differ by which URL they happened
to arrive at. Sending the root to `/login` unconditionally would bounce a member
who is *already* signed in back to a sign-in form; routing it through the guard
puts an anonymous visitor at `/login`, an account awaiting review at `/pending`,
and an approved member on the feed. The splat scores below every literal path,
so it is consulted only when nothing else matches.

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

## 5. Verifying the block

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

Setting the account to `approved` in the database opens the second call on the
next request with no new sign-in; setting it to `rejected` returns the same 403
with `"code":"ACCOUNT_REJECTED"`. `scripts/db-query.js` lists accounts and their
statuses read-only.

The same cases are covered by `server/tests/auth.approved.test.js`, which mounts
the guards on a throwaway route so the composition is tested rather than the
middleware in isolation:

```bash
cd server && npm test
```
