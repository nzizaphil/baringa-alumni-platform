# Deployment Procedure

*Baringa University Alumni Platform — manual deployment to AWS EC2*
*Jira: `DEVOPS-3` (instance configuration), `DEVOPS-4` (deployment)*

CI/CD is out of scope for this phase per the assessment brief. Deployment is manual and documented here so it is repeatable.

---

## 1. Target environment

| | |
|---|---|
| Provider | AWS EC2 |
| Instance ID | `i-0b915c1f99ca7ba2d` |
| Instance name | Interface_Phil |
| Region | ap-southeast-2 (Sydney) |
| Instance type | t3.medium |
| Operating system | Ubuntu Server 24.04 LTS |
| Public IPv4 | `3.106.192.200` |
| Public URL | `http://3.106.192.200` |
| Storage | 23 GB root volume |
| Subnet | `subnet-01b6baa7effb222fc` (aws-controltower-PublicSubnet1) |
| Instance profile | `IFN636-EC2-Role` |

### Runtime versions

| Component | Version |
|---|---|
| Node.js | v22.23.2 |
| npm | 10.9.8 |
| Nginx | 1.28.3 |
| PM2 | 7.0.4 |
| MongoDB | Atlas M0, cluster `IFN636Taskmgr`, database `baringa` |

Node 22 was chosen on the server to match the local development version exactly, so that behaviour differences between environments are not a possible cause of failure.

---

## 2. Architecture

```
Browser
  │  HTTP :80
  ▼
Nginx (reverse proxy)
  │  proxy_pass → localhost:5000
  ▼
Node.js / Express (managed by PM2, process name "baringa-api")
  ├── /api/*  → routers → Mongoose → MongoDB Atlas (database "baringa")
  └── everything else → the built React client in client/dist
```

**Express serves the built client as well as the API.** There is one process and
one port: Nginx forwards everything to `localhost:5000` and does not need to know
where the build output lives. In `client/dist`, requests naming a real build file
are answered with that file, and every other `GET` outside `/api` is answered with
`client/dist/index.html`, so React Router resolves the URL in the browser and a
refresh on a client route such as `/feed` returns the application rather than a
404. Unknown `/api` paths are untouched by this and still return the JSON 404
envelope.

This behaviour is gated on `NODE_ENV=production` (see §7.3). In development the
client is served by Vite on port 5173, which proxies `/api` to port 5000, so the
Express process serves the API only.

> **Consequence for deployment: `client/dist` must exist on the instance.** It is
> build output and is not in the repository, so `git pull` never creates or
> updates it — `npm run build` in `client/` does, and it must be run before PM2
> is started or restarted (§7.4, §9). If the build is missing, the application
> still starts and the API still works, but every client route returns 404 and
> the log carries `Client build not found at ... - serving the API only.`

Only port 80 is exposed. The application listens on `localhost:5000` and is not directly reachable from outside the instance. This keeps the inbound surface to two ports (22 for administration, 80 for the application), satisfying NFR4.

---

## 3. Security configuration

### Inbound rules

The instance sits behind five shared `student-allowed-sg-*` security groups provided by the managed QUT account. Rules relevant to this application:

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| 22 | TCP | Single `/32` address | SSH administration |
| 80 | TCP | Single `/32` address | Application access |

Both are scoped to specific single IP addresses rather than `0.0.0.0/0`. No wildcard inbound rule was added.

### Secrets handling

- No credential, connection string or key is committed to the repository. `.gitignore` excludes `.env`, `*.pem` and `*.key`.
- `.env.example` in the repository root lists the required variable names with no values.
- The production `.env` exists only on the instance, created by hand at deployment time.
- The production `JWT_SECRET` is different from the development one, so that a compromise of one environment does not grant access to the other.
- The first administrator's credential is supplied the same way, through `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` in the instance's `.env`. The seeding script (§7.5) has no default and no fallback value in its source, so there is no administrator password to commit and none to forget to change. `ADMIN_PASSWORD` is never printed by the script, in success or in failure.
- The application logs a database connection confirmation but never logs the connection string, credentials or tokens.

### SSH access

The instance key is issued by AWS in PuTTY `.ppk` format. OpenSSH clients, including the WSL terminal and the VS Code Remote-SSH extension, cannot read that format and must be given a converted copy.

```bash
sudo apt install -y putty-tools
mkdir -p ~/.ssh
puttygen /path/to/Interface_key.ppk -O private-openssh -o ~/.ssh/baringa-key.pem
chmod 400 ~/.ssh/baringa-key.pem
```

`chmod 400` is required — OpenSSH refuses a key readable by any other account.

Add a host entry to `~/.ssh/config` so the address is recorded in one place and connecting does not require retyping it:

```text
Host baringa
    HostName 3.106.192.200
    User ubuntu
    IdentityFile ~/.ssh/baringa-key.pem
    ServerAliveInterval 60
```

Then `ssh baringa` connects. `ServerAliveInterval` prevents the session dropping while output is being read.

For editing files on the instance directly, the VS Code **Remote - SSH** extension uses this same configuration. If VS Code runs on Windows rather than inside WSL it reads `C:\Users\<user>\.ssh\config` instead, needs its own copy of the `.pem`, and requires the file's inherited permissions to be removed:

```powershell
icacls C:\Users\<user>\.ssh\baringa-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

**When the instance address changes, `~/.ssh/config` must be updated too**, or every connection attempt times out with no indication of the cause.

### Credential rotation

Any credential that has been exposed — pasted into a chat, captured in a screenshot, or committed in error — is treated as compromised and rotated, even where the exposure appears low risk.

**MongoDB application user.** Atlas → **Database Access** → edit `baringa_app` → **Edit Password** → **Autogenerate**. Update `MONGODB_URI` in the local `server/.env`, then on the instance:

```bash
ssh baringa
cd ~/baringa-alumni-platform/server
nano .env
pm2 restart baringa-api --update-env
pm2 logs baringa-api --lines 20
```

Both environments must be updated. A running application holds its existing connection, so rotating the password without updating the instance appears to work — and then fails at the next restart, when the cause is no longer obvious.

Verify a connection string before restarting, so a wrong value does not take the application down:

```bash
cd ~/baringa-alumni-platform/server
node --env-file=.env -e "
const m=require('mongoose');
m.connect(process.env.MONGODB_URI).then(async()=>{
  console.log('connected to', m.connection.name); await m.disconnect();
}).catch(e=>{console.error('FAILED:', e.message); process.exit(1);});"
```

**JWT secret.** Regenerate on the instance and restart as above. Every issued token is invalidated and all users are signed out — expected, and acceptable outside a live demonstration.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Development and production secrets are generated separately and never shared between environments.

**Administrator password.** `npm run seed:admin` is idempotent and will not modify an existing account, so changing `ADMIN_PASSWORD` in `.env` after seeding has no effect. Rotating it requires deleting the administrator record and re-running the seed.

### Verification

```bash
# no secrets anywhere in committed history
git log -p --all | grep -iE "mongodb\+srv://|JWT_SECRET=.+|ADMIN_PASSWORD=.+|BEGIN RSA"
```

Expected: no output other than `.env.example` placeholders.

---

## 4. Instance preparation

Performed once, on a fresh Ubuntu 24.04 instance.

```bash
# 1. Reclaim disk space before installing
#    (a fresh instance can arrive with a full apt cache and /boot)
sudo apt clean
sudo apt autoremove --purge -y
df -h /

# 2. Update package lists
sudo apt update

# 3. Install Node.js 22 from NodeSource, plus Nginx and Git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# 4. Install PM2 globally
sudo npm install -g pm2

# 5. Confirm
node --version    # v22.23.2
npm --version     # 10.9.8
nginx -v          # nginx/1.28.3
pm2 --version     # 7.0.4
git --version
```

> **Note.** The first attempt at `sudo apt upgrade -y` failed with `You don't have enough free space in /var/cache/apt/archives/`. Running `apt clean` and `apt autoremove --purge` released sufficient space. A full system upgrade is not required — only the four packages above.

---

## 5. Nginx reverse proxy

Edit the default site:

```bash
sudo nano /etc/nginx/sites-available/default
```

Replace the contents of the `location /` block with:

```nginx
location / {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
}
```

Validate and apply:

```bash
sudo nginx -t                  # must report "syntax is ok" and "test is successful"
sudo systemctl restart nginx
sudo systemctl enable nginx    # start on boot
```

**Checkpoint.** Browsing to `http://3.106.192.200` should now return **502 Bad Gateway**. This is the correct result at this stage: Nginx is running and forwarding, but nothing is yet listening on port 5000.

---

## 6. Database preparation

Performed in the MongoDB Atlas console.

1. Cluster `IFN636Taskmgr` (free M0 tier, ap-southeast-2).
2. **Database Access** — create user `baringa_app` with an autogenerated password and the *Read and write to any database* role. A dedicated user is used for this application rather than reusing an existing one, so its credentials can be rotated independently.
3. **Network Access** — add the instance's public IP `3.106.192.200` to the access list. Without this the deployed application cannot reach the database.
4. **Connect → Drivers → Node.js** — copy the connection string.

The database name `baringa` is appended to the connection string before the query parameters, which isolates this application's data from other databases on the same cluster:

```
mongodb+srv://<user>:<password>@<cluster-host>/baringa?retryWrites=true&w=majority
```

---

## 7. Application deployment

```bash
# 1. Clone
cd ~
git clone https://github.com/nzizaphil/baringa-alumni-platform.git
cd baringa-alumni-platform

# 2. Install server dependencies
cd server
npm install
```

### 2b. Build the client

The Express process serves the compiled client (§2), and the compiled client is
not in the repository. Build it before starting PM2, or the deployed site will
answer `/api` correctly and every page route with a 404.

```bash
cd ~/baringa-alumni-platform/client
npm install
npm run build          # writes client/dist, which Express serves
ls dist/index.html     # must exist before §7.4
```

### 3. Create the production environment file

```bash
nano .env
```

Contents — **values are placeholders here; real values are entered only on the instance**:

```
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/baringa?retryWrites=true&w=majority
JWT_SECRET=<64-character random hex string>
JWT_EXPIRES_IN=1d
CLIENT_URL=http://3.106.192.200
ADMIN_EMAIL=<the first administrator's email address>
ADMIN_PASSWORD=<a strong password, chosen here and nowhere else>
ADMIN_NAME=<the first administrator's display name>
```

The three `ADMIN_` values are read by the seeding script in §7.5 and by nothing
else — the running application never reads them. They are listed as empty keys in
`.env.example`, which is the only place in the repository they appear.

Generate the JWT secret on the instance:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`ADMIN_PASSWORD` should be at least as strong as the platform asks of a member at
registration — eight characters or more, with a letter and a digit — since it
opens the most privileged account on the system.

### 4. Start under PM2

Confirm §7.2b has been run and `client/dist/index.html` exists first — the static
handler is wired up when the process starts, so a build produced afterwards is not
picked up until the next restart.

```bash
cd ~/baringa-alumni-platform/server
pm2 start src/server.js --name baringa-api
pm2 save
pm2 startup
```

`pm2 startup` prints a `sudo env PATH=...` command. **Run that command, then run `pm2 save` again.** This is what registers the systemd service that restarts the application after a reboot; skipping it means the application will not come back up.

> **Note.** If PM2 is started before `.env` is saved, the process inherits an empty environment and the application will report `(development)` regardless of the file contents. Fix with:
> ```bash
> pm2 restart baringa-api --update-env
> ```
> Confirm the log line reads `Server listening on port 5000 (production)`. This matters because the centralised error handler only suppresses stack traces when `NODE_ENV` is `production`.

### 5. Seed the first administrator

**This step runs on the instance, after the application is deployed, and the
platform is not usable without it.** Registration only ever produces a `pending`
member (see [Authentication and account status](auth.md)), and only an
administrator can approve one — through the registration review endpoints in
[the API reference](api.md#admin), which are themselves closed to anyone who is
not an approved administrator. So until this runs there is nobody who can let the
first member in.

```bash
cd ~/baringa-alumni-platform/server
npm run seed:admin
```

It reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` from the `.env` created
in §7.3 and creates one account with role `administrator`, status `approved` and
association `current_lecturer`. Expected output:

```
MongoDB connected: database "baringa"
Administrator created: <ADMIN_EMAIL> ("<ADMIN_NAME>")
```

If a variable is missing the script stops before connecting, names the variables
that are not set, and exits non-zero:

```
Cannot seed an administrator: ADMIN_PASSWORD is not set
```

There is deliberately no API endpoint that creates an administrator, and there
must never be one: the first privileged account has to come from somewhere the
API cannot be talked into reaching. This script is that somewhere.

**Re-running is safe.** If the account is already there it is reported and left
exactly as it is — no duplicate, and no password reset even if `ADMIN_PASSWORD`
has since been changed in the `.env`:

```
Administrator already exists: <ADMIN_EMAIL> - left unchanged
```

Changing a live administrator's password is therefore not something this script
does; it only ever creates the first one.

---

## 8. Verification

```bash
# process is running
pm2 status                       # baringa-api → online

# application responds directly
curl http://localhost:5000/api/health

# application responds through Nginx
curl http://localhost/api/health

# an unknown API path returns the JSON 404 envelope, not the HTML shell
curl -i http://localhost/api/does-not-exist

# the built client is served, and a refresh on a client route survives
curl -i http://localhost/
curl -i http://localhost/feed

# logs show a clean start and no credentials
pm2 logs baringa-api --lines 20

# exactly one administrator exists, and it is approved
cd ~/baringa-alumni-platform
node --env-file=server/.env scripts/db-query.js '{"role":"administrator"}'
```

Expected log output:

```
MongoDB connected: database "baringa"
Server listening on port 5000 (production)
```

Expected health response:

```json
{"success":true,"data":{"status":"ok","timestamp":"..."}}
```

Expected for the three client checks: `/api/does-not-exist` returns
`404` with `Content-Type: application/json` and
`{"success":false,"message":"Route not found: GET /api/does-not-exist","errors":[]}`,
while `/` and `/feed` both return `200` with `Content-Type: text/html` and the
same `index.html`. If `/feed` returns `404`, the client has not been built on the
instance or PM2 was started before it was — run §7.2b and restart.

From a browser on a whitelisted address: `http://3.106.192.200/api/health` returns the same payload, and `http://3.106.192.200/feed` loads the application directly and survives a refresh.

### Reboot persistence test

```bash
sudo reboot
```

Wait approximately two minutes, reconnect, then:

```bash
pm2 status
curl http://localhost/api/health
```

Both must succeed **without any manual start**. This confirms `pm2 save` and `pm2 startup` were configured correctly, and satisfies `DEVOPS-4` AC3.

---

## 9. Redeployment

To deploy an updated version:

```bash
cd ~/baringa-alumni-platform
git pull origin main

cd server
npm install                      # only if dependencies changed

cd ../client
npm install                      # only if dependencies changed
npm run build                    # REQUIRED before the restart below

cd ../server
pm2 restart baringa-api --update-env
pm2 logs baringa-api --lines 20
```

**`npm run build` in `client/` is not optional and is not conditional.** Express
serves `client/dist` (§2), and `git pull` does not update it because build output
is not committed. Skipping the build leaves the previous bundle in place and the
site silently serves the old client against the new API; there is no error to
notice. Run the build before `pm2 restart` — the static handler is wired up at
process start, so building afterwards changes nothing until the next restart.

The `--update-env` flag is included as standard so that any change to `.env` is picked up rather than silently ignored.

`npm run seed:admin` (§7.5) does not need repeating on an update — the account
survives a redeployment, since it lives in the database rather than on the
instance. Running it again is harmless if you are unsure: it reports the existing
account and changes nothing.

---

## 10. Known constraints

**No Elastic IP.** Elastic IP allocation is not available in the managed QUT AWS account, so the instance uses an auto-assigned public IP. An auto-assigned address is retained for the life of a running instance but is released on stop. **The instance is therefore left running for the duration of the assessment and must not be stopped**, as stopping it changes the public URL and invalidates every reference to it.

This is not hypothetical. The instance was stopped once during development and the address changed from `13.211.174.154` to `3.106.192.200`. The recovery procedure below records what had to be updated, in the order the failures appear.

### Recovering from an address change

Read the current address from the EC2 console — the instance is identified by its ID, `i-0b915c1f99ca7ba2d`, not by its address. Then update every reference:

| # | What | Where | Symptom if missed |
|---|---|---|---|
| 1 | SSH host entry | `~/.ssh/config` on the developer machine | `ssh` times out with no error explaining why |
| 2 | Atlas access list | Atlas → **Network Access** — add the new address, remove the old | Application starts but every database operation fails |
| 3 | `CLIENT_URL` | instance `server/.env`, then `pm2 restart baringa-api --update-env` | CORS rejections against the old origin |
| 4 | Inbound security group rules | AWS console, if any rule referenced the instance | Not applicable to inbound rules, but check any outbound allowlist elsewhere |
| 5 | Deployment URL | `README.md`, report cover page, submission | Marker follows a dead link |
| 6 | This document | §1 target environment and every command example | Future deployment follows stale instructions |

Confirm the recovery:

```bash
ssh baringa
pm2 list                                                   # baringa-api online
curl -s -o /dev/null -w "%{http_code}\n" localhost:5000/api/health
```

Then from a whitelisted machine, not from the instance:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<new-address>/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://<new-address>/feed
```

Both must return `200`. The second confirms the client build is being served and that a client-side route survives a direct request.

**Check the address again immediately before submission and before any demonstration.** A URL recorded hours earlier may no longer resolve.

**Per-IP inbound access.** The shared security groups permit port 80 only from specific `/32` addresses. Access for any additional user requires adding their address to the inbound rules.

**No HTTPS.** The application is served over HTTP. TLS would require a domain name and certificate, which is outside the scope of this phase.

**Single instance, no redundancy.** There is no load balancing, auto-scaling or failover. This is appropriate for a demonstration deployment and is not a production configuration.

**Manual deployment.** CI/CD is explicitly out of scope for this phase per the assessment brief.
