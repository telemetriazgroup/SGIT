# Arquitectura

## Forma del sistema

SGIT se parte en cuatro procesos con una base común. El bot no vive dentro del API: su sesión de WhatsApp Web exige un proceso Node con Chromium siempre encendido.

```text
                    ┌──────────────┐
                    │  Gmail API   │
                    └──────┬───────┘
                           │ cada 5 min + backfill
                    ┌──────▼───────┐     ┌─────────────┐
                    │  API SGIT    │────▶│ PostgreSQL  │
                    │  dominio,    │     └─────────────┘
                    │  parser,     │     ┌─────────────┐
                    │  Odoo, cierre│────▶│  Archivos   │
                    └──────┬───────┘     │ adjuntos y  │
                           │             │ fotos       │
              ┌────────────┼────────────┐└─────────────┘
              │            │            │
       ┌──────▼─────┐ ┌────▼─────┐ ┌────▼──────────┐
       │  Web       │ │  Redis   │ │  Bot WhatsApp │
       │  equipo    │ │  colas   │ │  web.js 1.34  │
       └────────────┘ └────┬─────┘ └───────┬───────┘
                           │               │
                    recordatorios     WhatsApp Web
                    y outbox          (sesión LocalAuth)
                           │
                    ┌──────▼────────────────────────┐
                    │ Odoo · API conexión · plataforma │
                    └────────────────────────────────┘
```

| Proceso | Responsabilidad |
| --- | --- |
| `apps/api` | Autenticación, buzón, clasificación, tareas, atenciones, Odoo, reportes, auditoría |
| `apps/web` | Bandeja, ficha de tarea, línea de tiempo, atención, impresión de MO, cola de revisión |
| `apps/bot` | Sesión WhatsApp, menús, recepción de fotos y textos, cola de salida |
| Worker dentro del API | Sync Gmail, barrido 08:00–18:00, snoozes, reintentos de integración |

API y bot se hablan por la base y por Redis. El bot no clasifica correos ni crea MO. Publica comandos (`registrar_seguimiento`, `registrar_incidente`, `pedir_snooze`) y consume avisos ya decididos por el dominio.

## Stack

| Capa | Elección | Motivo |
| --- | --- | --- |
| Lenguaje | TypeScript | Un solo lenguaje con el bot existente |
| API | NestJS | Módulos por contexto (buzón, tareas, odoo, cierre) y trabajos programados |
| Web | React + TypeScript | Uso en escritorio y en el teléfono del técnico |
| Bot | `whatsapp-web.js` ^1.34, LocalAuth, Puppeteer | Ya es el cliente de la operación. Ver [`bot_wattsap.md`](../bot_wattsap.md) |
| Datos | PostgreSQL | Tareas, hilos, atenciones y auditoría son relacionales |
| Colas | Redis + BullMQ | Sync, recordatorios, outbox con separación entre envíos |
| Archivos | MinIO o S3 compatible | Adjuntos de Gmail y fotos de campo, fuera de la base |
| PDF | Generación en el API | MO para firmar y reporte de instalación |

La web habla solo con el API. El navegador no guarda tokens de Gmail, Odoo ni de la plataforma.

## Módulos del dominio

| Módulo | Hace | No hace |
| --- | --- | --- |
| Identidad | Usuarios del equipo, roles, sesión de la web | Cuentas de la plataforma de telemetría |
| Buzón | OAuth, sync, réplica, visor del hilo | Enviar correo de negocio salvo el reporte de cierre |
| Clasificación | Diccionario, score, cola `revisar` | Decidir materiales o códigos de equipo |
| Extracción | Asunto, secciones, firma, cita | Inventar campos que el texto no trae |
| Tareas | Ficha por COT, situaciones, cita vigente | Una ficha por mensaje |
| Bitácora | Seguimientos, incidentes, snooze | Borrar historia |
| Atención | N unidades, estados de materiales e instalación | Despachar el contenedor |
| Fabricación | Elegir lista, crear MO, PDF, fotos | Llevar el kardex; eso es Odoo |
| Prueba | Elegir conector según modelo y guardar lectura | Modificar parámetros del equipo fuera del contrato de la API |
| Plataforma | Alta o asignación de usuario | Operar el monitoreo diario del cliente |
| Notificaciones | Cuándo avisar, a quién y con qué resumen | Abrir Chromium; eso es el bot |
| Auditoría | Autor, canal, antes/después de datos sensibles | Sustituir a la línea de tiempo de negocio |

## Estructura de carpetas

```text
apps/api/src/
  identidad/
  buzon/
  clasificacion/
  extraccion/
  tareas/
  bitacora/
  atenciones/
  fabricacion/
  prueba/
  plataforma/
  notificaciones/
  auditoria/
apps/web/src/
  bandeja/
  tarea/
  atencion/
  revision/
  admin/
apps/bot/src/
  client.ts          # Client + LocalAuth, como el snippet de bot_wattsap.md
  inbound/
  menus/
  outbox/
packages/shared/src/
  contratos de comandos bot ↔ api
fixtures/emails/
```

## Datos que cruzan el bot

Comandos que el bot envía al API, ya validados contra el miembro vinculado al número:

- `tomar_tarea`
- `registrar_seguimiento` (texto, imagen opcional)
- `registrar_incidente`
- `poner_en_validacion` (horas)
- `confirmar_equipo_despacho` (código, máquina)
- `iniciar_atencion` se ofrece en WhatsApp como acceso directo a la web cuando el paso pide formulario largo (materiales, fotos múltiples, prueba)

Por WhatsApp caben los pasos de campo: aviso, seguimiento, incidente, snooze y foto suelta. Crear la MO, elegir materiales, la prueba y el alta de usuario se hacen en la web, que puede abrirse desde el enlace del chat. Así el bot no concentra formularios frágiles ni muestra listas de materiales en un menú de texto.

## Sincronización Gmail

1. Cuenta de servicio de buzón autorizada con OAuth. El refresh token se guarda cifrado.
2. Primera carga: `messages.list` con el rango pedido, paginado.
3. Steady state: `history.list` desde el `historyId` guardado, cada 5 minutos.
4. Por mensaje: `messages.get` formato full, luego `attachments.get` por cada parte.
5. Idempotencia por `gmailMessageId`.
6. El puntero de historia solo avanza si el lote quedó persistido.

`users.watch` con Pub/Sub puede sumarse después para bajar la latencia. No reemplaza el barrido de 5 minutos: el barrido corrige watches caídos.

## Tiempo

| Reloj | Comportamiento |
| --- | --- |
| Sync | Cada 5 minutos, más reintento con backoff si Gmail falla |
| Barrido operativo | Cada hora en punto entre 08:00 y 18:00, `America/Lima`, días laborables |
| Snooze | Job por tarea a la hora pedida, también fuera de la ventana si las N horas caen de noche; el aviso espera a las 08:00 si así se configura. Por defecto se entrega a la hora pedida, porque el operador la eligió |
| Outbox WhatsApp | Consumo continuo con pausa entre envíos |

## Idempotencia de integraciones

| Acción | Clave |
| --- | --- |
| Mensaje Gmail | `gmailMessageId` |
| Tarea | COT normalizada |
| Situación | `gmailMessageId` + tarea |
| MO | `atencionId` + secuencia de fabricación activa |
| Usuario de plataforma | `atencionId` + intención (`alta` o `asignacion`) |
| Aviso de cierre | `tareaId` + destinatario + tipo, hasta que alguien pulse reenviar |

## Ambientes

| Ambiente | Datos |
| --- | --- |
| Local | Correos fixture, Odoo de prueba, bot con un número de laboratorio |
| Pruebas | Buzón de pruebas o etiquetas acotadas, Odoo staging |
| Producción | Buzón real, Odoo real, número operativo del bot |

Producción corre el bot como un solo réplica. Dos Chromium con la misma sesión de WhatsApp Web se pisan.

## Observabilidad

- Cada sync registra leídos, nuevos, fallidos y el `historyId`.
- Cada llamada a Odoo y a las API de equipo y plataforma registra correlación, estado y error, sin cuerpos con contraseñas.
- El bot expone estado: `qr`, `ready`, `disconnected`.
- La web muestra “última sync” y “WhatsApp conectado” para que el equipo sepa si el silencio es operativo o técnico.

## Decisiones de arquitectura

| Id | Decisión | Consecuencia |
| --- | --- | --- |
| AD-01 | Una tarea por COT | El parser y la base usan la COT como identidad; el hilo es hijo |
| AD-02 | Bot en proceso aparte | Se puede reiniciar el API sin tumbar la sesión, y al revés con cuidado |
| AD-03 | WhatsApp para campo corto; web para la atención completa | Menús estables y formularios donde hay listas, fotos múltiples y PDF |
| AD-04 | Réplica de lectura del correo, envío solo del reporte de cierre | El alcance de OAuth se mantiene acotado hasta la fase de cierre |
| AD-05 | Cola de revisión antes que tarea dudosa | Evita perseguir cotizaciones que no son de telemetría |
| AD-06 | Odoo sigue dueño de ventas, tickets y stock | SGIT guarda la copia operativa y el id externo |
| AD-07 | Credencial de plataforma cifrada y fuera de logs | El reporte es el medio de entrega, no la bitácora |
