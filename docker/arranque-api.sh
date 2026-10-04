#!/bin/sh
set -eu
cd /app

# Dentro de Compose los servicios se ven por su nombre, no por el puerto publicado al anfitrión.
export DATABASE_URL="postgres://sgit:sgit@postgres:5432/sgit"
export REDIS_URL="redis://redis:6379"
export S3_ENDPOINT="http://minio:9000"
export PORT="${PORT:-18003}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:18004}"
export PUPPETEER_SKIP_DOWNLOAD=true

if [ ! -x node_modules/.bin/tsx ]; then
  echo "Instalando dependencias del API..."
  npm ci
fi

# El cwd del API hace que tsx use su tsconfig. --include vuelve a leer .env al guardarlo.
cd /app/apps/api
exec /app/node_modules/.bin/tsx watch --include /app/.env src/main.ts
