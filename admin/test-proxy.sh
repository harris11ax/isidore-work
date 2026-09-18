#!/bin/bash
# End-to-end proof of the /admin proxy: drive the real Worker bundle through
# wrangler dev, with ADMIN_ORIGIN pointed at the live admin app, and check that
# path, method, body, CSRF and cookies all survive the hop.
set -u
PROXY="${PROXY:-http://127.0.0.1:8788}"
PW="${1:?password required}"
J="$(mktemp)"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok    $1  ($3)"; pass=$((pass+1)); else echo "  FAIL  $1  expected $2 got $3"; fail=$((fail+1)); fi; }
contains() { if grep -q "$2" "$3"; then echo "  ok    $1"; pass=$((pass+1)); else echo "  FAIL  $1 (not found: $2)"; fail=$((fail+1)); fi; }

echo "== through the Worker proxy =="
check "GET /admin/login" 200 "$(curl -s -b "$J" -c "$J" -o /tmp/p-login.html -w '%{http_code}' "$PROXY/admin/login")"
contains "login page came from the backend" "Content administration" /tmp/p-login.html

csrf=$(grep -o 'name="_csrf" value="[^"]*"' /tmp/p-login.html | head -1 | sed 's/.*value="//;s/"$//')
# Astro's built-in origin check (default on for on-demand routes) requires a
# matching Origin on state-changing requests; browsers always send one.
Origin="Origin: $PROXY"

code=$(curl -s -b "$J" -c "$J" -o /dev/null -w '%{http_code}' -X POST -H "$Origin" -d "_csrf=$csrf&password=$PW" "$PROXY/admin/login")
check "POST /admin/login through the proxy" 302 "$code"

check "session cookie survives the hop" 200 "$(curl -s -b "$J" -c "$J" -o /tmp/p-projects.html -w '%{http_code}' "$PROXY/admin/projects")"
contains "authenticated projects list" "Add a project" /tmp/p-projects.html

check "GET /admin/ (dashboard)" 200 "$(curl -s -b "$J" -c "$J" -o /tmp/p-dash.html -w '%{http_code}' "$PROXY/admin/")"
contains "dashboard rendered" "Last publish" /tmp/p-dash.html

echo "== bare /admin (no trailing slash) =="
bare=$(curl -s -b "$J" -o /tmp/p-bare.html -w '%{http_code}' "$PROXY/admin")
check "bare /admin serves the dashboard" 200 "$bare"

echo "== a mutation through the proxy =="
csrfA=$(curl -s -b "$J" -c "$J" "$PROXY/admin/landing" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
check "POST /admin/landing" 302 "$(curl -s -b "$J" -c "$J" -o /dev/null -w '%{http_code}' -X POST -H "$Origin" \
	-d "_csrf=$csrfA" -d 'site_title=isidore.work' -d 'landing_name=Isidore LaRocco' \
	-d 'landing_bio=Electrical and computer engineering student.' \
	--data-urlencode 'work_blurb=Roles held for an employer or institution — {count} records, newest first.' \
	--data-urlencode 'more_blurb=Coursework, personal builds, research and volunteer programmes — {count} more records, filterable by domain and category.' \
	--data-urlencode 'contact_blurb=Email is the fastest way to reach me; LinkedIn works too.' \
	--data-urlencode 'work_heading=Professional Work' -d 'more_heading=Everything else' -d 'contact_heading=Get in touch' \
	-d 'landing_selfie_caption=Placeholder — selfie to come.' \
	"$PROXY/admin/landing")"

echo
echo "passed: $pass   failed: $fail"
rm -f "$J"
[ "$fail" -eq 0 ]
