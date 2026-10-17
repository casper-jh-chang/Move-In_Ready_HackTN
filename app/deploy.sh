#!/usr/bin/env bash
# Build locally and redeploy the web app and the video vision service to the OCI web server.
# Keeps the server's .env files, ~/.oci credentials, database and saved video analyses untouched.
# Usage: ./deploy.sh            (override with KEY=... SERVER=user@host ./deploy.sh)
# One-time server setup (systemd units, Apache, ffmpeg): see ../docs/oracle-cloud.md
set -euo pipefail
KEY="${KEY:-$HOME/Downloads/webserver.pem}"
SERVER="${SERVER:-opc@163.192.199.117}"
cd "$(dirname "$0")"

npm run build
export COPYFILE_DISABLE=1
TAR_OPTS=(--exclude node_modules --exclude .env --exclude server/store.json --exclude '*.log' --exclude .venv --exclude data --exclude __pycache__ --exclude .pytest_cache)
tar czf /tmp/movein.tgz --no-xattrs "${TAR_OPTS[@]}" \
    package.json package-lock.json .nvmrc .env.example index.html tsconfig.json vite.config.ts README.md server src dist 2>/dev/null \
    || tar czf /tmp/movein.tgz "${TAR_OPTS[@]}" \
    package.json package-lock.json .nvmrc .env.example index.html tsconfig.json vite.config.ts README.md server src dist
tar czf /tmp/vision.tgz --no-xattrs "${TAR_OPTS[@]}" -C .. vision-service 2>/dev/null \
    || tar czf /tmp/vision.tgz "${TAR_OPTS[@]}" -C .. vision-service
scp -i "$KEY" /tmp/movein.tgz /tmp/vision.tgz "$SERVER":/tmp/
ssh -i "$KEY" "$SERVER" 'set -e
  mkdir -p ~/move-in-ready && rm -rf ~/move-in-ready/dist
  tar xzf /tmp/movein.tgz -C ~/move-in-ready 2>/dev/null && rm /tmp/movein.tgz
  cd ~/move-in-ready && npm ci --omit=dev --no-audit --no-fund
  tar xzf /tmp/vision.tgz -C ~ 2>/dev/null && rm /tmp/vision.tgz
  [ -d ~/vision-service/.venv ] || python3.12 -m venv ~/vision-service/.venv
  ~/vision-service/.venv/bin/pip install -q -r ~/vision-service/requirements-local.txt
  sudo systemctl restart vision-service move-in-ready && sleep 4
  systemctl is-active vision-service move-in-ready
  curl -s http://127.0.0.1:3001/api/health; echo
  curl -s http://127.0.0.1:8000/health; echo'
echo "Live at https://163-192-199-117.sslip.io"
rm -f /tmp/movein.tgz /tmp/vision.tgz
