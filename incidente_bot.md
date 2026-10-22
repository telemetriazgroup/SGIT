# Incidente: WhatsApp sin QR en el VPS

Fecha: 21 de octubre de 2026, servidor `ztrackperu2025` (Ubuntu), proyecto en `/home/ztrack/mongo/Proyectos/SGIT`. La pantalla pública es `https://ztrack.app/SGIT/`.

## Qué se vio

En la pantalla del bot, WhatsApp figuraba fuera de línea: «El proceso del bot no responde». Al pulsar **Cerrar sesión y pedir otro QR**, el registro anotó el cierre y la pantalla respondió: «El cierre quedó pedido, pero el proceso del bot no está en marcha». No apareció código.

## Causa

El botón no abre Chrome. Deja el pedido `olvidar` en la base. Quien borra la sesión y publica el QR es otro proceso, `npm run dev:bot`, y ese proceso no forma parte de `docker compose`. En el VPS nadie lo había dejado corriendo.

Al lanzarlo a mano, la sesión guardada sí se borró (`Borré la carpeta de la sesión de este equipo`) y enseguida falló:

```text
Browser was not found at the configured executablePath (/usr/bin/google-chrome)
```

`PUPPETEER_EXECUTABLE_PATH` apunta a `/usr/bin/google-chrome`. En ese Ubuntu el binario no estaba (`falta-chrome`).

## Qué se hizo

1. Se instaló Google Chrome en el VPS. La prueba `test -x /usr/bin/google-chrome` pasó a `chrome-ok`.
2. El unit `docker/sgit-bot.service` estaba en el repositorio local y no en el servidor. `cp` falló con `No such file or directory`. El unit se creó directo en `/etc/systemd/system/sgit-bot.service`.
3. Se detuvo el `tsx src/main.ts` que había quedado en la terminal, para que no retuviera el liderazgo del bot.
4. `systemctl enable --now sgit-bot` arrancó el servicio y dejó el enlace en `multi-user.target`, así sigue al cerrar SSH y al reiniciar el servidor.

`journalctl -u sgit-bot -f` no pudo quedarse abierto: `Failed to allocate directory watch: Too many open files` e `Insufficient watch descriptors available`. Eso es el visor, no el bot. El servicio sí quedó en marcha: `Started sgit-bot.service - SGIT WhatsApp`. Para leer el registro sin seguirlo en vivo:

```bash
systemctl status sgit-bot --no-pager
journalctl -u sgit-bot -n 40 --no-pager
```

## Cómo queda el servicio

Unidad: `/etc/systemd/system/sgit-bot.service`. Copia de referencia en el repo: `docker/sgit-bot.service`.

```ini
[Unit]
Description=SGIT WhatsApp
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/ztrack/mongo/Proyectos/SGIT
ExecStart=/bin/bash -lc 'npm run dev:bot'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Chrome sigue siendo el del sistema, `/usr/bin/google-chrome`. El proceso llama al API en `http://localhost:18003/SGIT` y escribe el QR en `sessions/qr.png`, que la pantalla lee por el volumen del API.

El teléfono de laboratorio escanea ese código en Dispositivos vinculados. **Reiniciar la misma sesión** reabre la carpeta ya vinculada. **Cerrar sesión y pedir otro QR** solo tiene efecto con este servicio en marcha.
