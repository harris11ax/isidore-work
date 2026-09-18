#!/bin/bash
# Exercise the admin portal over HTTP: auth gate, every screen, one mutation and
# its CSRF rejection. Prints a status code per check.
set -u
BASE="http://127.0.0.1:${PORT:-8099}"
J="$(mktemp)"
PW="${1:?password required}"
pass=0; fail=0

check() { # label expected actual
	if [ "$2" = "$3" ]; then echo "  ok    $1  ($3)"; pass=$((pass+1));
	else echo "  FAIL  $1  expected $2 got $3"; fail=$((fail+1)); fi
}

code() { # method path [extra curl args...]
	local m="$1" p="$2"; shift 2
	curl -s -b "$J" -c "$J" -o /dev/null -w '%{http_code}' -X "$m" "$@" "$BASE$p"
}

echo "== auth gate =="
check "anonymous /admin/ redirects" 302 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/")"
check "login page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

csrf=$(curl -s -c "$J" "$BASE/admin/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
[ -n "$csrf" ] && echo "  ok    csrf token present" && pass=$((pass+1)) || { echo "  FAIL  no csrf token"; fail=$((fail+1)); }

echo "== login =="
check "wrong password rejected" 401 "$(code POST /admin/login -d "_csrf=$csrf&password=definitely-not-it")"
check "missing csrf rejected" 400 "$(code POST /admin/login -d "password=$PW")"
check "correct password accepted" 302 "$(code POST /admin/login -d "_csrf=$csrf&password=$PW")"

echo "== screens (authenticated) =="
for p in /admin/ /admin/landing /admin/projects /admin/projects/new /admin/domains /admin/cv /admin/contact /admin/media /admin/publish /admin/activity; do
	check "GET $p" 200 "$(code GET "$p")"
done
check "GET a project form" 200 "$(code GET /admin/projects/1)"

echo "== mutations =="
csrfA=$(curl -s -b "$J" "$BASE/admin/landing" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
check "landing POST without csrf redirects" 302 "$(code POST /admin/landing -d 'site_title=x')"
check "landing POST with csrf" 302 "$(code POST /admin/landing \
	-d "_csrf=$csrfA" -d 'site_title=isidore.work' -d 'landing_name=Isidore LaRocco' \
	-d 'landing_bio=Test paragraph one' --data-urlencode 'work_blurb=Roles held for an employer — {count} records.')"

echo "== media =="
check "media file served" 200 "$(code GET /admin/media/1)"
check "media range/404 for missing" 404 "$(code GET /admin/media/99999)"

echo
echo "passed: $pass   failed: $fail"
rm -f "$J"
[ "$fail" -eq 0 ]
