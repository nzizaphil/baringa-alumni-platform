# API reference

*Baringa University Alumni Platform — every HTTP endpoint the server exposes*
*Sources: `server/src/routes/`, `server/src/controllers/`, `server/src/validators/`*

Every route is mounted under `/api` (`server/src/app.js`): `/api/health`,
`/api/auth`, `/api/admin`. Locally that is `http://localhost:5000/api`; on the
deployed instance it is the public URL in
[the deployment procedure](deployment.md) §1 followed by `/api`.

This file is the single reference for the HTTP contract. *Why* the guards are
composed the way they are, and what the status model means, is in
[Authentication and account status](auth.md).

---

## Conventions

Everything in this section applies to every endpoint and is not repeated below.

### Response envelope

Success (2xx):

```json
{ "success": true, "data": { } }
```

Failure (4xx / 5xx):

```json
{
  "success": false,
  "message": "Your registration is still being reviewed by an administrator",
  "errors": [],
  "code": "ACCOUNT_PENDING"
}
```

`errors` is always present on a failure and is an array of `{ field, message }`
pairs; it is empty when the failure is not field-specific. Only the validation
failures (400 and 422) populate it. Outside production the envelope also carries
`stack`; a 5xx in production reports `"Internal server error"` and nothing more.

### `code`, and why the internal property is `errorCode`

`code` is optional and appears only where the client must branch on *which*
failure this is rather than merely report it. It is a stable SCREAMING_SNAKE
identifier, so **clients match on `code`, never on `message`** — the message is
wording for a person and may be reworded without notice.

Internally a handler attaches `errorCode` to the error it throws, and the
centralised handler (`server/src/middleware/error.middleware.js`) emits it as
`code`. The internal property is deliberately not called `code`: that name is
already taken on errors thrown from outside this codebase — MongoDB's
duplicate-key error uses `11000`, Node's filesystem errors use `ENOENT` and
friends — and none of those are part of this API's contract.

### Authentication header

Guarded endpoints read the token issued by
[`POST /api/auth/login`](#post-apiauthlogin) from:

```
Authorization: Bearer <token>
```

Anything else — no header, another scheme, or a header that is not exactly two
whitespace-separated parts — is treated as no token at all.

### Guards

Composed left to right on a route (`server/src/middleware/auth.middleware.js`):

| Guard | Establishes | Rejects with |
|---|---|---|
| `requireAuth` | Who the caller is; loads the account onto `req.user` | `401`, no `code` |
| `requireApproved` | That the account may act at all | `403` `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` |
| `requireRole('administrator')` | That the account has the privilege | `403`, no `code` |

`ACCOUNT_PENDING` means the registration has not been reviewed yet;
`ACCOUNT_REJECTED` means it was reviewed and turned down. The presence or
absence of `code` on a 403 is what separates "your account may not act yet"
from "your account may act, but not on this".

### Failures common to every endpoint

| Status | `code` | When |
|---|---|---|
| `401` | — | `requireAuth`: token missing, malformed, expired, wrongly signed, or pointing at an account that no longer exists |
| `403` | `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` | `requireApproved`: the account is `pending` or `rejected` |
| `403` | — | `requireRole`: the account's role is not permitted here |
| `404` | — | No route matched. `message` is `Route not found: <METHOD> <URL>` |
| `413` | — | Request body over 100 kB |
| `500` | — | Unhandled server fault |

Only guarded endpoints can answer 401 or 403; each endpoint below names its
guards, and the per-endpoint error tables list only what is specific to it.

---

## Auth

Mounted at `/api/auth` (`server/src/routes/auth.routes.js`), handled by
`server/src/controllers/auth.controller.js`.

### `POST /api/auth/register`

Creates a member account awaiting administrator approval. Always `role: member`
and `status: pending`; nothing in the request can influence either.

**Guards** — none. Public.

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | Trimmed; 1–120 characters |
| `email` | string | yes | Valid email address; lower-cased before storage |
| `password` | string | yes | At least 8 characters, with at least one letter and one digit |
| `association` | string | yes | One of `current_student`, `former_student`, `current_lecturer`, `former_lecturer` |
| `studentNumber` | string | When `association` is `current_student` or `former_student` | Trimmed; 32 characters or fewer |
| `graduationYear` | integer | When `association` is `former_student` | 1900 to the current year |

**Success — `201`**

```json
{
  "success": true,
  "data": {
    "id": "6870f1c2a4b39d0012ab34cd",
    "name": "Amina Uwase",
    "email": "amina.uwase@example.com",
    "association": "former_student",
    "status": "pending"
  }
}
```

This is the one account response that is not the shared projection: it carries
`association` and omits `role`.

**Errors**

| Status | `code` | When |
|---|---|---|
| `409` | — | The email address is already registered |
| `422` | — | Validation failed; `errors` names each offending field |

### `POST /api/auth/login`

Exchanges credentials for a JWT access token. A `pending` or `rejected` account
signs in normally and receives a token — see [auth.md](auth.md#sign-in-is-not-the-gate).

**Guards** — none. Public.

**Body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | yes | Valid email address; lower-cased before lookup |
| `password` | string | yes | Non-empty. No strength rules apply here, deliberately |

**Success — `200`**

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "6870f1c2a4b39d0012ab34cd",
      "name": "Amina Uwase",
      "email": "amina.uwase@example.com",
      "role": "member",
      "status": "pending"
    }
  }
}
```

The `user` object is the shared projection (`toSafeUser`): exactly these five
fields, on this endpoint and on `/api/auth/me`.

**Errors**

| Status | `code` | When |
|---|---|---|
| `401` | — | The email is unknown *or* the password is wrong. The two are indistinguishable by design |
| `422` | — | `email` or `password` was missing or malformed |

### `GET /api/auth/me`

Returns the caller's own account, re-read from the database, so a role or status
change made since the token was issued is visible here.

**Guards** — `requireAuth` only. Deliberately not `requireApproved`: this is how
an applicant awaiting review learns where their registration stands.

**Request** — no body or parameters.

**Success — `200`**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6870f1c2a4b39d0012ab34cd",
      "name": "Amina Uwase",
      "email": "amina.uwase@example.com",
      "role": "member",
      "status": "pending"
    }
  }
}
```

**Errors** — the guard failure in Conventions only (`401`).

---

## Admin

Mounted at `/api/admin` (`server/src/routes/admin.routes.js`), handled by
`server/src/controllers/admin.controller.js`. These three are the only way an
account leaves `pending`. All three carry the same guards in the same order:
`requireAuth`, `requireApproved`, `requireRole('administrator')`.

`PATCH` rather than `POST` or `DELETE` on the two decisions: both change one
field on an account that already exists, and neither creates or removes
anything.

### `GET /api/admin/registrations/pending`

The review queue: every account still awaiting a decision, ordered by
`createdAt` ascending, so the longest wait is at the top. An account drops out
of the queue the moment it is decided.

**Guards** — `requireAuth`, `requireApproved`, `requireRole('administrator')`.

**Query parameters**

| Parameter | Type | Required | Rules |
|---|---|---|---|
| `page` | integer | no | 1 or more. Defaults to 1 |
| `limit` | integer | no | 1 to 100. Defaults to 20 |

Supplying either as something other than a whole number in range is a `400`
rather than a silent reset to the default.

**Success — `200`**

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

`studentNumber` and `graduationYear` are `null` where the applicant's
association did not call for them. This projection is wider than `toSafeUser`
because an administrator is deciding whether the applicant is who they say they
are. `total` counts the whole queue, not the page.

**Errors**

| Status | `code` | When |
|---|---|---|
| `400` | — | `page` or `limit` was supplied and is not a usable number; `errors` names it |

### `PATCH /api/admin/registrations/:id/approve`

Sets `status: approved`, and records who decided and when. The member may act
from their very next request; no new sign-in is needed.

**Guards** — `requireAuth`, `requireApproved`, `requireRole('administrator')`.

**Parameters**

| Parameter | Type | Required | Rules |
|---|---|---|---|
| `:id` | path | yes | A valid MongoDB ObjectId. Compared as an ObjectId, so hex casing does not matter |

**Body** — none.

**Success — `200`**

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

`toSafeUser` plus the two fields that record the decision. Approving moves
`status` and nothing else — it confers no role.

**Errors**

| Status | `code` | When |
|---|---|---|
| `400` | — | `:id` is not a valid identifier |
| `403` | `SELF_REVIEW_FORBIDDEN` | `:id` is the calling administrator's own account |
| `404` | — | No account has that id |
| `409` | `REGISTRATION_NOT_PENDING` | The registration has already been approved or rejected |

### `PATCH /api/admin/registrations/:id/reject`

Sets `status: rejected`. Identical to `approve` in guards, parameters, response
shape and errors, including the `409`: a rejection is a decision, so re-deciding
a decided registration is refused rather than quietly repeated.

`approvedBy` and `approvedAt` are written here too — they record who reviewed
the account and when, whichever way the decision went.

---

## Health

### `GET /api/health`

Liveness probe. Confirms the API process is up and responding; it touches
neither the database nor the account.

**Guards** — none. Public.

**Request** — no body or parameters.

**Success — `200`**

```json
{ "success": true, "data": { "status": "ok", "timestamp": "2026-01-15T22:03:07.881Z" } }
```

**Errors** — none of its own.

---

## Error code index

| Code | Status | Raised by | Meaning |
|---|---|---|---|
| `ACCOUNT_PENDING` | `403` | `requireApproved` | The registration has not been reviewed yet |
| `ACCOUNT_REJECTED` | `403` | `requireApproved` | The registration was reviewed and turned down |
| `SELF_REVIEW_FORBIDDEN` | `403` | `approveRegistration` / `rejectRegistration` | An administrator may not decide their own registration |
| `REGISTRATION_NOT_PENDING` | `409` | `approveRegistration` / `rejectRegistration` | This registration has already been decided |

Every other failure carries `message` and `errors` only. A code earns its place
where two failures share a status and the client has to tell them apart, as
`requireApproved`'s two 403s do, or where the client is expected to act
differently — `REGISTRATION_NOT_PENDING` means "somebody else has already
handled this, refresh the queue" rather than "something went wrong".

On the client the codes are mirrored as `AUTH_ERROR_CODE`
(`client/src/api/auth.js`, with `isAccountNotApproved`) and `ADMIN_ERROR_CODE`
(`client/src/api/admin.js`, with `isAlreadyReviewed` and `isSelfReview`).
`ApiError.code` (`client/src/api/client.js`) is where the value arrives.

---

## Not in this release

- **No `GET /api/admin/registrations/:id`.** The queue is the only read the API
  offers, so the review screen finds its applicant in it. An applicant missing
  from the queue is one who is no longer pending, which is exactly the state to
  report when another tab got there first.
- **No endpoint writes `role`, and none creates an administrator.** The first
  administrator is seeded out of band; see [auth.md](auth.md#where-the-first-administrator-comes-from).
- **No notification endpoint** (F14) and **no moderator-granting endpoint**
  (`ADMIN-5`, BAP-24, Sprint 2).
