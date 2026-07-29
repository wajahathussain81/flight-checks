#!/usr/bin/env bash
set -euo pipefail
HOST=flight-checks
APP=/opt/flight-checks

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude data --exclude dist --exclude env.local \
  ./ "$HOST:$APP/"

# env.local (gitignored, on the Mac) is the source of truth for secrets
if [ -f env.local ]; then
  ssh "$HOST" mkdir -p /etc/flight-checks
  scp -q env.local "$HOST:/etc/flight-checks/env"
  ssh "$HOST" chmod 600 /etc/flight-checks/env
fi

ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/flight-checks
npm ci
npm run build
mkdir -p data /etc/flight-checks
[ -f /etc/flight-checks/env ] || { cp deploy/env.example /etc/flight-checks/env; chmod 600 /etc/flight-checks/env; echo "WARNING: /etc/flight-checks/env created from example — fill in real keys"; }
systemctl disable --now flight-checks-scan.timer 2>/dev/null || true
cp deploy/flight-checks-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now flight-checks-web.service
systemctl restart flight-checks-web.service
echo "deployed. web service restarted; scans use the built-in scheduler."
REMOTE
