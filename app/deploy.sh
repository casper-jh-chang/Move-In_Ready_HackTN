#!/usr/bin/env bash
# Build locally and redeploy to the OCI web server. Keeps the server's .env and database untouched.
# Usage: ./deploy.sh            (override with KEY=... SERVER=user@host ./deploy.sh)
set -euo pipefail
KEY="${KEY:-$HOME/Downloads/webserver.pem}"
SERVER="${SERVER:-opc@163.192.199.117}"
cd "$(dirname "$0")"

npm run build
COPYFILE_DISABLE=1 tar czf /tmp/movein.tgz --no-xattrs --exclude node_modules --exclude .env --exclude server/store.json --exclude '*.log' \
    package.json package-lock.json .nvmrc .env.example index.html tsconfig.json vite.config.ts README.md server src dist 2>/dev/null \
    || COPYFILE_DISABLE=1 tar czf /tmp/movein.tgz --exclude node_modules --exclude .env --exclude server/store.json --exclude '*.log' \
    package.json package-lock.json .nvmrc .env.example index.html tsconfig.json vite.config.ts README.md server src dist
scp -i "$KEY" /tmp/movein.tgz "$SERVER":/tmp/movein.tgz
ssh -i "$KEY" "$SERVER" 'set -e
  mkdir -p ~/move-in-ready && rm -rf ~/move-in-ready/dist
  tar xzf /tmp/movein.tgz -C ~/move-in-ready 2>/dev/null && rm /tmp/movein.tgz
  cd ~/move-in-ready && npm ci --omit=dev --no-audit --no-fund
  sudo systemctl restart move-in-ready && sleep 2 && systemctl is-active move-in-ready
  curl -s http://127.0.0.1:3001/api/health; echo'
echo "Live at https://163-192-199-117.sslip.io"
rm -f /tmp/movein.tgz
