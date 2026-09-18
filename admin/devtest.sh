#!/bin/bash
# Start the admin app, run the direct test suite, start wrangler dev with
# ADMIN_ORIGIN pointed at it, run the proxy suite, then stop both.
# Uses pidfiles — never pkill by pattern (it matches the caller's own command line).
set -u
cd "$(dirname "$0")" || exit 1
REPO="$(cd .. && pwd)"
PW="${1:?password required}"
APP_PID=/tmp/isidore-admin.pid
WDEV_PID=/tmp/isidore-wdev.pid
LOG_APP=/tmp/isidore-admin.log
LOG_WDEV=/tmp/isidore-wdev.log

stop() {
	for f in "$APP_PID" "$WDEV_PID"; do
		if [ -f "$f" ]; then
			pid=$(cat "$f")
			if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
				kill "$pid" 2>/dev/null
				for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
				kill -9 "$pid" 2>/dev/null
			fi
			rm -f "$f"
		fi
	done
	# anything left holding the ports (e.g. started by an earlier session)
	for port in 8099 8788; do
		pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
		if [ -n "$pid" ]; then echo "  freeing :$port (pid $pid)"; kill "$pid" 2>/dev/null; sleep 1; fi
	done
	# workerd is spawned by wrangler and can outlive it
	pkill -f 'workerd' 2>/dev/null
	return 0
}

stop
echo "=== starting the admin app ==="
cd "$REPO/admin" || exit 1
nohup node --no-warnings server.mjs > "$LOG_APP" 2>&1 &
echo $! > "$APP_PID"
sleep 4
head -3 "$LOG_APP"

echo
echo "########## DIRECT (app on :8099) ##########"
bash test-admin.sh "$PW" 2>&1 | tail -10
direct=$?

echo
echo "=== starting wrangler dev (Worker bundle, ADMIN_ORIGIN -> :8099) ==="
cd "$REPO" || exit 1
nohup npx wrangler dev --port 8788 --ip 127.0.0.1 --var ADMIN_ORIGIN:http://127.0.0.1:8099 > "$LOG_WDEV" 2>&1 &
echo $! > "$WDEV_PID"
for i in $(seq 1 40); do
	grep -q "Ready on" "$LOG_WDEV" && break
	sleep 1
done
grep -m1 "Ready on" "$LOG_WDEV" || echo "wrangler did not report ready"
sleep 2

echo
echo "########## THROUGH THE WORKER PROXY (:8788) ##########"
bash admin/test-proxy.sh "$PW"
proxy=$?

stop
echo
echo "direct suite exit: $direct   proxy suite exit: $proxy"
[ "$direct" -eq 0 ] && [ "$proxy" -eq 0 ]
