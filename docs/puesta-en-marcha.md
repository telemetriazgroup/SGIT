# Puesta en marcha — sprint 0

Levanta PostgreSQL, Redis, el almacén de archivos, el API, la web y el bot de laboratorio. Correos, tareas y menús de WhatsApp quedan para los sprints siguientes.

## 1. Entorno

Desde la raíz del repositorio:

```bash
cp .env.example .env
PUPPETEER_SKIP_DOWNLOAD=true npm install
npm run entorno
npm test
```

`npm test` es la suite `prueba.identidad`: salud de los cuatro servicios, ingreso del operador, pantalla de ingreso, ciclo del QR en el bot y la comprobación de que `.env` y `sessions/` no entran a git.

El usuario local es el de `.env`:

| Campo | Valor de laboratorio |
| --- | --- |
| Correo | `operador@sgit.local` |
| Contraseña | `operador-prueba` |

Esa contraseña solo existe en la base local. No la uses fuera de esta máquina.

## 2. Procesos

En tres terminales, desde la raíz:

```bash
npm run dev:api
npm run dev:web
npm run dev:bot
```

| Proceso | Dirección |
| --- | --- |
| Web | http://localhost:18004 |
| API | http://localhost:18003/salud |
| Bot | QR en la terminal y en `sessions/qr.png` |
| Archivos (MinIO) | http://localhost:18002 , usuario `sgit`, clave `sgit-secreto` |

Los puertos altos evitan chocar con servicios que ya escuchan en 5432, 6379 y 9000. PostgreSQL de SGIT queda en el 5437.

## 3. Recorrido del viernes

1. Abrir http://localhost:18004. Tiene que verse el ingreso, sin un aviso de `VITE_API_URL`.
2. Probar un correo que no existe. No entra.
3. Entrar con el operador de prueba. La pantalla dice sesión iniciada.
4. En la terminal del bot, escanear el QR con el WhatsApp de laboratorio. El proceso escribe `listo` y borra `sessions/qr.png`. La sesión queda en `sessions/wwebjs/`, fuera de git.
5. Completar y firmar [el acta de descubrimientos](acta-descubrimientos.md).

Con el API y la web ya corriendo, el mismo recorrido del navegador se puede repetir con:

```bash
npm run verificar -w @sgit/web
```
