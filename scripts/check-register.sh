#!/usr/bin/env bash
# Baringa Alumni Platform — registration diagnostic
# Run from the repo root:  bash check-register.sh
# Isolates where a registration write is being lost.

BASE="http://localhost:5000"
EMAIL="diag+$(date +%s)@example.com"
PASS="Passw0rd123"

line() { printf '\n\033[1;36m── %s\033[0m\n' "$1"; }
ok()   { printf '   \033[0;32m%s\033[0m\n' "$1"; }
bad()  { printf '   \033[0;31m%s\033[0m\n' "$1"; }

line "1. Is the server up?"
HEALTH=$(curl -s -w '\n%{http_code}' "$BASE/api/health" 2>/dev/null)
CODE=$(echo "$HEALTH" | tail -n1)
BODY=$(echo "$HEALTH" | sed '$d')
if [ -z "$CODE" ] || [ "$CODE" = "000" ]; then
  bad "No response on $BASE — the server is not running."
  bad "Start it with: cd server && npm run dev"
  exit 1
fi
ok "HTTP $CODE"
echo "   $BODY"

line "2. Which database is configured?"
if [ -f server/.env ]; then
  # print the database name from the URI without exposing credentials
  grep -E '^MONGO' server/.env | sed -E 's#(mongodb\+srv://)[^@]*@#\1***:***@#' 
else
  bad "server/.env not found from this directory — run the script from the repo root."
fi

line "3. Is POST /api/auth/register mounted?"
REG=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag User\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"association\":\"current_student\",\"studentNumber\":\"12345678\"}")
CODE=$(echo "$REG" | tail -n1)
BODY=$(echo "$REG" | sed '$d')

case "$CODE" in
  404) bad "HTTP 404 — the route is not mounted. Check server/src/routes/auth.routes.js"
       bad "and that it is registered in the app entry point." ;;
  401|403) bad "HTTP $CODE — auth middleware is guarding the register route."
       bad "requireAuth must NOT be applied to POST /register." ;;
  201|200) ok "HTTP $CODE — the endpoint accepted the request." ;;
  *)   bad "HTTP $CODE" ;;
esac
echo "   Response body:"
echo "$BODY" | sed 's/^/   /'

line "4. Did the write actually persist?"
echo "   Attempting to log in as the account just created."
LOGIN=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
CODE=$(echo "$LOGIN" | tail -n1)
BODY=$(echo "$LOGIN" | sed '$d')
echo "   HTTP $CODE"
echo "$BODY" | sed 's/^/   /'
if [ "$CODE" = "200" ]; then
  ok "The user EXISTS in the database. The write is working —"
  ok "you are looking at the wrong database or collection in Atlas."
elif [ "$CODE" = "403" ]; then
  ok "The user EXISTS but is blocked as pending. The write is working —"
  ok "check the database name in Atlas against step 2 above."
elif [ "$CODE" = "401" ]; then
  bad "Login rejected. The user was NOT persisted despite the register response."
  bad "Look at the server terminal for a Mongoose validation or connection error."
fi

line "5. Duplicate check"
echo "   Re-sending the same registration. A 409 proves the record is in the DB."
DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Diag User\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"association\":\"current_student\",\"studentNumber\":\"12345678\"}")
echo "   HTTP $DUP"
if [ "$DUP" = "409" ]; then
  ok "409 — the record is definitely persisted."
elif [ "$DUP" = "201" ]; then
  bad "201 again — nothing is being written. Two identical registrations both"
  bad "succeeded, so the save is silently failing or hitting a different DB."
fi

line "Test account used"
echo "   $EMAIL / $PASS"
printf '\n'
