#!/bin/sh
set -eu
cd /app

# Dentro de Compose los servicios se ven por su nombre, no por el puerto publicado al anfitrión.
export DATABASE_URL="postgres://sgit:sgit@postgres:5432/sgit"
export REDIS_URL="redis://redis:6379"
export S3_ENDPOINT="http://minio:9000"
export PORT="${PORT:-18003}"
export PUPPETEER_SKIP_DOWNLOAD=true

if [ ! -x node_modules/.bin/tsx ]; then
  echo "Instalando dependencias del API. En un servidor nuevo puede tardar varios minutos."
  npm ci
fi

if [ ! -f /app/.env ]; then
  echo "Falta /app/.env. Copia .env.example a .env y completa los valores antes de arrancar."
  exit 1
fi

# El cwd del API hace que tsx use su tsconfig. --include vuelve a leer .env al guardarlo.
cd /app/apps/api
echo "Arrancando el API en el puerto ${PORT}, ruta /SGIT/"
exec /app/node_modules/.bin/tsx watch --include /app/.env src/main.ts
