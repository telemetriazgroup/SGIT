# Plan de desarrollo y fases

## Cómo se construye

Cada fase deja un sistema usable para una parte del trabajo, con datos reales o fixture, y no depende de un conector que todavía no existe. El orden sigue la dependencia del caso: sin correo confiable no hay tarea; sin tarea no hay bot; sin operación diaria no vale la pena crear MO; sin materiales e instalación no hay cierre contra las API.

Duraciones orientativas para un equipo chico (1 o 2 personas de desarrollo más el área usuaria para reglas y pruebas). Se ajustan cuando exista el inventario de Odoo y de las API.

| Fase | Nombre | Duración orientativa | Resultado que el área puede tocar |
| --- | --- | --- | --- |
| 0 | Cimientos y descubrimientos | 1 semana | Repositorio, ambientes, accesos, decisiones de modelos Odoo |
| 1 | Buzón, clasificación y tarea | 3 semanas | Ver el correo en SGIT y la ficha única por COT |
| 2 | Operación del equipo y WhatsApp | 3 semanas | Avisos, bitácora, incidentes, recordatorios |
| 3 | Lectura de Odoo | 1–2 semanas | Estado de venta y ticket dentro de la ficha |
| 4 | Atención y fabricación | 3 semanas | N atenciones, MO, fotos de almacén |
| 5 | Instalación, prueba y cierre | 3 semanas | Evidencia, conexión, usuario, reporte, avisos finales |
| 6 | Endurecimiento | 2 semanas | Métricas, backups, parser afinado con correo real, runbooks |

Total orientativo: 16 a 18 semanas. Las fases 3 y el arranque de 4 pueden solaparse cuando la ficha de la fase 2 ya está estable.

El corte semanal, el entregable del viernes y las pruebas de cada proceso están en [sprint_sgit.md](../sprint_sgit.md).

## Fase 0 — Cimientos

**Objetivo.** Poder desarrollar sin adivinar modelos de Odoo ni permisos de Gmail.

**Trabajo.**

- Monorepo `apps/api`, `apps/web`, `apps/bot`, `packages/shared`.
- PostgreSQL, Redis, almacén de archivos, entorno local con el fixture del correo.
- Esquema inicial de usuarios y roles.
- Inventario con el administrador de Odoo: modelo de la COT, modelo del ticket de servicio externo, modelo de fabricación y de listas de materiales, usuario técnico y base de staging.
- Proyecto OAuth de Gmail en un buzón de pruebas.
- Número de laboratorio para el bot y carpeta de sesión fuera del código.
- Lista de modelos de máquina que la prueba deberá soportar, y de quién entrega cada API.
- Calendario laborable y feriados de Lima que el barrido debe respetar.

**Salida.** Acta corta de descubrimientos: nombres técnicos de Odoo, dueños de cada API, buzón a sincronizar en producción (casilla compartida o casilla personal) y si el aviso al comercial será solo correo.

**Hecho cuando.** Un desarrollador levanta API, web vacía y bot hasta el QR en local, y el documento de descubrimientos está firmado por el área.

## Fase 1 — Buzón y tarea

**Objetivo.** El correo de ejemplo, y los que se le parezcan, terminan en una sola tarea; los replies no duplican.

**Incluye.** UC-01 a UC-09 y UC-29 en su versión de correos y correcciones. Reglas RN-01 a RN-33 y RN-80 a RN-81.

**Trabajo.**

- OAuth, backfill por fechas, sync cada 5 minutos, `historyId`, reintentos.
- Réplica HTML con imágenes inline y adjuntos.
- Diccionario editable.
- Extractor del asunto `//` y de las secciones del cuerpo, con fragmentos de origen.
- Tarea por COT, situaciones, historial de cita, campos protegidos si el humano los corrigió.
- Cola de revisión.
- Visor del hilo y ficha de solo lectura operativa (aún sin bot).

**Pruebas de aceptación.** Las del bloque “Fase 1” en [criterios](10-backlog-y-criterios-de-aceptacion.md), usando el fixture y al menos diez hilos reales anonimizados.

**Fuera.** WhatsApp, escritura en Odoo, MO.

## Fase 2 — Operación y WhatsApp

**Objetivo.** El equipo trabaja la bandeja y el chat con las reglas de recordatorio del caso.

**Incluye.** UC-11 a UC-17, UC-30. RN-40 a RN-48.

**Trabajo.**

- Proceso del bot, un solo réplica, estado de sesión en la web de admin.
- Alta de miembros con su teléfono.
- Outbox con pausa.
- Aviso de tarea nueva.
- Menú: pendientes, mis tareas, seguimiento con foto, incidente, validación en N horas.
- Consulta a despacho en la ventana 08:00–18:00.
- Confirmación humana del código propuesto por chat.
- La web ofrece las mismas acciones de bitácora.
- Aviso de reprogramación al responsable.

**Hecho cuando.** Con el bot de laboratorio, una tarea fixture recorre detectada → seguimiento → snooze → incidente, y el barrido horario ignora la que ya tiene avance.

## Fase 3 — Lectura Odoo

**Objetivo.** Desde la ficha se ve si la cotización y el ticket avanzan.

**Incluye.** UC-10. RN-70.

**Trabajo.**

- Cliente Odoo contra staging.
- Búsqueda por COT y por ticket.
- Estados: sin vínculo, vínculo único, ambiguo.
- Vínculo manual.
- Refresco del estado al abrir la ficha y un job periódico, guardando la fecha de lectura.

**Hecho cuando.** La COT de prueba en staging aparece en la ficha correcta y un número duplicado no se autoasigna.

## Fase 4 — Atención y materiales

**Objetivo.** De una tarea se abren N atenciones y se pide el material con constancia.

**Incluye.** UC-18 a UC-22. RN-50 a RN-57 y RN-71 a RN-72.

**Trabajo.**

- Abrir N hilos, uno por telemetría. La cantidad se corrige en la ficha. Un chip ocupado no entra a la orden de fabricación.
- Selector de lista de materiales y cantidades.
- Alta idempotente de la MO.
- PDF e impresión.
- Fotos de solicitud y de recepción.
- Incidentes de almacén que no cierran la atención.
- Confirmación “recibidos” o “no fue necesario” como único paso hacia instalación.
- Estados de atención hasta `en_instalacion`.

**Hecho cuando.** En Odoo staging existe una sola MO por atención aunque el operador pulse dos veces, y sin foto de recepción no avanza.

## Fase 5 — Instalación, prueba y cierre

**Objetivo.** Cerrar el circuito del caso: evidencia, lectura del equipo, usuario, aviso a Johan y reporte a Olinda.

**Incluye.** UC-23 a UC-28. RN-60 a RN-68.

**Trabajo.**

- Carga de evidencias mínimas.
- Conector de prueba por modelo, empezando por las familias que el descubrimiento haya priorizado.
- Alta y asignación de usuario, cifrado, idempotencia.
- Excepción de administrador para cerrar sin prueba.
- Reporte PDF con línea de tiempo.
- Correo al comercial y WhatsApp a despacho.
- Reenvío explícito.
- Cierre de tarea solo con atenciones terminadas.
- Reapertura solo administrador, sin reenvío automático.

**Hecho cuando.** Una atención de laboratorio termina con usuario de prueba, el comercial de prueba recibe un solo correo y despacho un solo aviso, y los logs no contienen la contraseña.

## Fase 6 — Endurecimiento

**Objetivo.** Dejarlo operable un lunes sin el autor del código al lado.

**Trabajo.**

- Tablero: última sync, mensajes en revisión, tareas detectadas sin movimiento, sesión del bot, errores de Odoo y de plataforma.
- Backup de PostgreSQL, del almacén de archivos y de la sesión del bot.
- Runbook: reautorizar Gmail, mostrar QR, reintentar MO, reenviar reporte.
- Ajuste del extractor con los hilos reales que cayeron en revisión durante el piloto.
- Retención de adjuntos y política de acceso a reportes con credenciales.
- Prueba de restauración en un ambiente limpio.

## Piloto

Después de la Fase 2 se puede pilotear la bandeja con el buzón real en modo “clasifica y avisa”, mientras Odoo y las API siguen en staging. Escritura en Odoo de producción y alta de usuarios reales de plataforma esperan a que las Fases 4 y 5 pasen con datos de prueba.

El piloto usa una etiqueta o un rango de fechas acotado, no todo el histórico de la casilla, hasta que el equipo valide que la COT no se duplica.

## Dependencias externas (pueden mover fechas)

| Dependencia | La necesita | Si se atrasa |
| --- | --- | --- |
| Consentimiento del dueño del buzón y proyecto OAuth | Fase 1 | Se desarrolla contra fixtures; no hay piloto |
| Modelos y usuario de Odoo | Fases 3 y 4 | La fase 2 igual se entrega |
| Especificación de API por modelo de máquina | Fase 5 | Se cierra la evidencia y se deja la prueba en “conector pendiente”; no se declara la fase cerrada |
| API de usuarios de plataforma | Fase 5 | Igual que arriba |
| Número de WhatsApp estable | Fase 2 | La web cubre la bitácora; los avisos esperan |

## Definición de hecho de una fase

- Criterios de aceptación de esa fase cumplidos.
- Reglas de negocio citadas cubiertas por pruebas automáticas donde son puras (normalización de COT, no duplicar, exclusión del barrido) y por prueba guiada donde hay Gmail, Odoo o WhatsApp.
- Migraciones reversibles en desarrollo.
- Documentado el runbook mínimo de lo que esa fase puede romper (token, sesión, MO duplicada).
- Sin secretos en el repositorio.

## Qué no se adelanta

- Envío de correo al comercial antes de tener el reporte y el manejo de secretos de la Fase 5.
- Más de un conector de máquina en paralelo al primero: se abre el segundo cuando el primero cierre una instalación real de laboratorio.
- App nativa, API oficial de Meta y `users.watch` de Gmail. Quedan como mejoras posteriores al piloto, si la operación las pide.
