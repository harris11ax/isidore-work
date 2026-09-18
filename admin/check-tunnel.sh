#!/bin/bash
# Verify the tunnel route without waiting for local DNS: pin the hostname to a
# Cloudflare edge IP that the public resolver already returns.
set -u
IP="104.21.71.145"
for path in /admin/login /admin/; do
	code=$(curl -s -o /tmp/be.html -w '%{http_code}' --resolve "backend.isidore.work:443:$IP" "https://backend.isidore.work$path")
	echo "$path -> $code"
done
echo "--- backend login page reached over the tunnel? ---"
grep -c "Content administration" /tmp/be.html || true
echo "--- first line of what came back ---"
head -c 120 /tmp/be.html
echo
