# Conectar el buzón telemetria@zgroup.com.pe

SGIT no pide la contraseña de Gmail. Pide un permiso de lectura que Luis autoriza una vez, con la cuenta `telemetria@zgroup.com.pe`. Google devuelve una clave duradera (refresh token). Esa clave queda cifrada en la base de SGIT.

La casilla tiene que ser un usuario de Google que pueda abrir sesión y pulsar Permitir. Un grupo de correo, sin usuario, no puede dar ese permiso.

Hasta que este alta no esté hecho, el sprint 1 se puede probar con el doble interno. La bandeja real espera estas claves.

## Qué se necesita

- Acceso a [Google Cloud Console](https://console.cloud.google.com) con una cuenta del dominio `zgroup.com.pe`.
- La API de Gmail habilitada.
- Un cliente OAuth de tipo aplicación web.
- Luis frente a la pantalla, entrando como `telemetria@zgroup.com.pe`.

Si la organización usa Google Workspace, el tipo de usuarios del permiso debe ser **Interno**. Así solo cuentas `@zgroup.com.pe` pueden autorizar, y no hace falta publicar la aplicación.

## Paso a paso

1. Entra a [Google Cloud Console](https://console.cloud.google.com) y crea un proyecto llamado `SGIT`, o abre el que ya vayan a usar.
2. En **APIs y servicios → Biblioteca**, busca **Gmail API** y pulsa **Habilitar**.
3. En **APIs y servicios → Pantalla de consentimiento de OAuth** (en la consola nueva puede llamarse **Google Auth Platform → Público**):
   - Tipo de usuario: **Interno**.
   - Nombre de la aplicación: `SGIT`.
   - Correo de asistencia: el de Luis o el del área.
4. En los permisos (ámbito / data access) agrega solo este:
   `https://www.googleapis.com/auth/gmail.readonly`
   Es lectura del buzón. El envío del reporte al comercial se agrega en el sprint 13, no ahora.
5. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo: **Aplicación web**.
   - Nombre: `SGIT local`.
   - URI de redirección autorizada, tal cual:

```text
http://localhost:18003/buzon/oauth/callback
```

   Va en **URI de redireccionamiento autorizado**, con `http://` y la palabra `localhost`. `127.0.0.1` no sirve: Google responde «Debe contener el nombre de un dominio». En **Dominios autorizados** (pantalla de consentimiento), si pide algo, va solo `zgroup.com.pe`, sin `http://` y sin ruta.

6. Google muestra el **ID de cliente** y el **secreto de cliente**. El secreto se muestra una vez. Cópialos al `.env` de la raíz del proyecto, sin comillas y sin subirlos a git:

```text
GOOGLE_CLIENT_ID=el-id-que-entregó-google
GOOGLE_CLIENT_SECRET=el-secreto-que-entregó-google
GOOGLE_REDIRECT_URI=http://localhost:18003/buzon/oauth/callback
GMAIL_CORREO=telemetria@zgroup.com.pe
INICIAR_SYNC=true
```

7. Guarda el `.env`. Con el entorno de Compose en marcha, el API vuelve a leer ese archivo solo. Si todavía no está arriba: `npm run entorno`.
8. Abre http://localhost:18004, entra con `operador@sgit.local` / `operador-prueba` y pulsa **Conectar Gmail**.
9. Luis elige la cuenta `telemetria@zgroup.com.pe` y pulsa Permitir. Si Google ofrece otra cuenta, no sirve: SGIT rechaza cualquier buzón que no sea ese.
10. La bandeja queda en `conectado`. Importa desde hace 30 días hasta hoy. Los correos aparecen con sus imágenes y archivos.
11. A partir de ahí, cada 5 minutos SGIT baja lo nuevo. Un correo enviado a `telemetria@zgroup.com.pe` se ve en el siguiente ciclo.

## Si Google no devuelve la clave duradera

Vuelve a pulsar Conectar Gmail. El enlace pide el permiso otra vez (`prompt=consent`). Si la cuenta ya tenía un permiso viejo, en [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions), con la sesión de `telemetria@`, quita el acceso de SGIT y conéctala de nuevo.

## Qué no va en el acta ni en git

- La contraseña de `telemetria@zgroup.com.pe`.
- El secreto de cliente y el refresh token. Viven en `.env` y en la base, cifrados. `.env` está fuera de git.
