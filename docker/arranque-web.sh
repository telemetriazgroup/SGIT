#!/bin/sh
set -eu
cd /app
export PUPPETEER_SKIP_DOWNLOAD=true

if [ ! -x node_modules/.bin/vite ]; then
  echo "Instalando dependencias de la web..."
  npm ci
fi

cd /app/apps/web
export API_INTERNO="${API_INTERNO:-http://api:18003}"
exec /app/node_modules/.bin/vite --host 0.0.0.0 --port 18004
