
# Actores y casos de uso

## Actores

| Id | Actor | Tipo |
| --- | --- | --- |
| A01 | Miembro del equipo de desarrollo | Persona |
| A02 | Administrador SGIT | Persona |
| A03 | Sincronizador Gmail | Sistema |
| A04 | Clasificador y extractor | Sistema |
| A05 | Planificador de recordatorios | Sistema |
| A06 | Bot de WhatsApp | Sistema |
| A07 | Odoo | Sistema externo |
| A08 | API de conexión del equipo | Sistema externo |
| A09 | API de plataforma (usuarios ZTrack) | Sistema externo |
| A10 | Despacho (Johan) | Persona externa, solo por WhatsApp |
| A11 | Comercial solicitante | Persona externa, recibe el cierre |

## Mapa

```text
Correo ── A03 sincroniza ── A04 clasifica y extrae ── tarea por COT
                                                      │
                      A07 lee cotización y ticket ────┤
                                                      │
                      A06 avisa al equipo ────────────┤
                                                      │
A01 opera la tarea (web o WhatsApp) ─────────────────┤
A05 recuerda pendientes sin avance y snoozes ────────┤
A10 responde código y máquina ───────────────────────┤
                                                      │
A01 atiende N telemetrías ── A07 crea MO y materiales ┤
                         └── fotos, instalación ──────┤
                         └── A08 prueba conexión ─────┤
                         └── A09 usuario plataforma ──┤
                                                      │
                         cierre ── A10 código listo   │
                                └── A11 accesos y reporte
```

## Catálogo

| Id | Caso de uso | Actor principal | Fase |
| --- | --- | --- | --- |
| UC-01 | Sincronizar el buzón | A03 | 1 |
| UC-02 | Conservar el correo con imágenes y adjuntos | A03 | 1 |
| UC-03 | Clasificar si el correo involucra a desarrollo | A04 | 1 |
| UC-04 | Extraer datos de asunto y cuerpo | A04 | 1 |
| UC-05 | Crear la tarea de la cotización | A04 | 1 |
| UC-06 | Anexar un correo del mismo hilo sin duplicar la tarea | A04 | 1 |
| UC-07 | Corregir o completar una extracción | A01 | 1 |
| UC-08 | Revisar la cola de confianza baja | A01 | 1 |
| UC-09 | Administrar palabras y secciones clave | A02 | 1 |
| UC-10 | Ver cotización y ticket en Odoo | A01, A07 | 3 |
| UC-11 | Avisar al equipo que hay una tarea nueva | A06 | 2 |
| UC-12 | Consultar a despacho código y máquina | A06, A10 | 2 |
| UC-13 | Recordar cada hora los pendientes sin avance | A05, A06 | 2 |
| UC-14 | Tomar una tarea y registrar seguimiento | A01 | 2 |
| UC-15 | Adjuntar una imagen de referencia | A01 | 2 |
| UC-16 | Pasar a validación y pedir recordatorio en N horas | A01 | 2 |
| UC-17 | Registrar un incidente sobre una tarea | A01 | 2 |
| UC-18 | Abrir hilos de telemetría | A01 | 4 |
| UC-19 | Crear una orden de fabricación y elegir materiales | A01, A07 | 4 |
| UC-20 | Imprimir la MO y guardar la foto firmada | A01 | 4 |
| UC-21 | Registrar la respuesta de almacén | A01 | 4 |
| UC-22 | Confirmar materiales recibidos o no necesarios | A01 | 4 |
| UC-23 | Registrar la instalación | A01 | 5 |
| UC-24 | Probar la conexión del equipo | A01, A08 | 5 |
| UC-25 | Generar o asignar usuario de plataforma | A01, A09 | 5 |
| UC-26 | Cerrar la atención y la tarea | A01 | 5 |
| UC-27 | Avisar a despacho que ya puede asignar el código | A06 | 5 |
| UC-28 | Enviar accesos y reporte al comercial | A03 o A06 | 5 |
| UC-29 | Consultar la línea de tiempo de la operación | A01 | 2 |
| UC-30 | Administrar usuarios del equipo y la sesión del bot | A02 | 0 y 2 |

## UC-01 Sincronizar el buzón

**Disparador.** Reloj cada 5 minutos, o una carga inicial con fecha desde / fecha hasta pedida por un administrador.

**Precondición.** Hay una cuenta Gmail autorizada y un `historyId` guardado. En la primera carga no hay `historyId`: se usa el rango de fechas.

**Flujo.**

1. El sincronizador pide cambios desde el último `historyId`, o lista mensajes del rango.
2. Por cada mensaje nuevo descarga metadatos, cuerpo HTML, texto plano e identificadores de adjuntos.
3. Descarga bytes de adjuntos e imágenes inline y los guarda en el almacén de archivos.
4. Inserta el mensaje si el `gmailMessageId` no existe. Si existe, no lo vuelve a crear.
5. Actualiza el `historyId` del buzón solo cuando el lote terminó bien.
6. Entrega los mensajes nuevos al clasificador.

**Alternativas.**

- Gmail responde cuota o error transitorio: el lote se reintenta con backoff y el `historyId` no avanza.
- Un adjunto falla: el mensaje queda en estado `incompleto` y se reintenta ese archivo, sin perder el resto.
- La carga histórica es grande: se pagina y se puede pausar. La sync de 5 minutos de lo reciente tiene prioridad sobre el backfill.

## UC-02 Conservar el correo como réplica

**Flujo.**

1. Se guarda cabecera (de, para, cc, fecha, asunto, `threadId`).
2. Se guarda HTML original y una versión segura para mostrar en la app.
3. Las imágenes `cid:` se reescriben a URLs internas.
4. Cada adjunto conserva nombre, mime y tamaño.
5. La pantalla de la tarea puede abrir el hilo en orden cronológico, parecido a la conversación de Gmail.

El sistema conserva el mensaje para operar. No pretende clonar etiquetas, borradores ni la búsqueda completa de Gmail.

## UC-03 Clasificar si el correo involucra a desarrollo

**Flujo.**

1. Normaliza texto (minúsculas, sin tildes para comparar).
2. Busca secciones conocidas. La presencia de un bloque `ZTRACK` suma confianza alta.
3. Evalúa el diccionario: nombres del equipo, `telemetria`, `usuario y contraseña`, `plataforma`, y las frases que el administrador agregue.
4. Emite una decisión: `evento_desarrollo`, `revisar` o `ajeno`.
5. Un correo `ajeno` igual se almacena si está en el buzón sincronizado, y no abre tarea.

**Regla de confianza.**

| Señal | Decisión |
| --- | --- |
| Bloque ZTRACK y (telemetría o pedido de accesos) | `evento_desarrollo` |
| Palabras del diccionario sin bloque claro, o bloque ZTRACK ilegible | `revisar` |
| Ninguna señal | `ajeno` |

## UC-04 Extraer datos de asunto y cuerpo

**Entrada de referencia.** Asunto del caso:

`ASIGNAR Y DESPACHAR // COT 10020263623 // TICKET DE VENTAS #2139 // ALQUILER DE CONTENEDOR REEFER 40 RH + SERVICIO DE TRANSPORTE Y MANIPULEO - MAKRO HUACHO - MAKRO SUPERMAYORISTA S.A.`

**Flujo.**

1. Parte el asunto por `//`.
2. Localiza `COT` + dígitos y `TICKET DE VENTAS #` + dígitos.
3. Del último tramo separa descripción, lugar y cliente por ` - ` desde la derecha (lugar y cliente son los dos últimos segmentos cuando el patrón se cumple).
4. En el cuerpo corta por encabezados de sección: DESPACHO, SSOMA, ZTRACK, ALMACEN, ÁREA TÉCNICA, TRANSPORTE.
5. En ZTRACK lee la cantidad (`1 und de telemetría`, `2 telemetrías`, etc.).
6. En “FECHA Y HORA DE ENTREGA – CLIENTE” lee fecha, hora, dirección y URL de mapa. Si el bloque aparece dos veces, manda la ocurrencia más completa.
7. Lee `Temperatura` y `Producto almacenar` si existen.
8. En el cierre lee nombre, cargo, correo y teléfono del comercial.
9. En DESPACHO lee la línea de contenedor y la cantidad.
10. Guarda el JSON extraído junto al texto que lo originó, para poder mostrar “de aquí salió este dato”.

**Alternativa.** Si falta la COT, no hay tarea automática. El mensaje queda en revisión para vincularlo a mano.

## UC-05 Crear la tarea de la cotización

**Precondición.** Decisión `evento_desarrollo` y COT extraída.

**Flujo.**

1. Busca una tarea viva con esa COT normalizada (solo dígitos).
2. Si no existe, crea la tarea en estado `detectada`, copia los campos extraídos y vincula el mensaje como origen.
3. Si existe, ejecuta UC-06.
4. Dispara el aviso al equipo (UC-11) solo cuando la tarea nace.

## UC-06 Anexar un correo del mismo hilo

**Flujo.**

1. Empareja por COT. Si el reply no repite la COT, empareja por `gmailThreadId` ya vinculado a una tarea.
2. Crea una situación: `informativa`, `reprogramacion`, `avance_de_area` o `incidente_reportado`.
3. Si cambian fecha, hora o dirección, marca reprogramación y actualiza la cita vigente, conservando la anterior.
4. No abre otra tarea ni reinicia atenciones ya creadas.
5. Notifica al responsable de la tarea si la situación cambia la cita o trae un incidente. Un “enterado” rutinario queda en la línea de tiempo y puede agruparse para no saturar WhatsApp.

## UC-11 Avisar al equipo

**Flujo.**

1. Al nacer la tarea, el bot envía a los miembros activos un resumen: COT, cliente, lugar, fecha y hora, cantidad de telemetrías, comercial.
2. El mensaje incluye cómo abrir la tarea en la web.
3. El envío pasa por la cola de salida, con separación entre mensajes.

## UC-12 Consultar a despacho

**Flujo.**

1. Para una tarea `detectada` sin código de equipo, el bot escribe a despacho pidiendo código y máquina.
2. Entre 08:00 y 18:00, si la tarea sigue sin avance registrado por desarrollo, repite la consulta como máximo una vez por hora.
3. Desarrollo puede pegar la respuesta (“Johan dice que no hay equipo asignado”) y una foto. Eso es un seguimiento (UC-14) y corta el ciclo horario.
4. Si despacho responde por el mismo chat y el mensaje cita la COT, el bot propone el código y la máquina para confirmación humana antes de grabarlos.

## UC-13 Recordatorio horario

**Incluye una tarea si** está pendiente, no tiene avance de desarrollo y no tiene un snooze vigente, dentro de 08:00–18:00, días laborables configurados.

**Excluye** tareas con al menos un seguimiento de avance, tareas en validación hasta que venza el recordatorio, tareas cerradas y atenciones ya en curso.

A la hora pedida en una validación (“recuérdame en 4 horas”), el bot vuelve a mostrar esa tarea aunque ya tenga avance.

## UC-14 y UC-15 Seguimiento con imagen

**Flujo.**

1. El miembro elige la tarea en la web o en el menú del bot.
2. Escribe el hecho (“Angie, de técnica, dice que la máquina está en reparación”).
3. Opcionalmente adjunta una imagen.
4. Queda un evento de bitácora con autor, canal (`web` o `whatsapp`) y fecha.
5. La tarea pasa a `en_seguimiento` y sale del recordatorio horario.

## UC-16 Validación con snooze

**Flujo.**

1. El miembro marca la tarea `en_validacion`.
2. Indica en cuántas horas volver a preguntar (el caso usa 4).
3. Hasta esa hora no entra al barrido horario.
4. Puede registrar incidentes mientras tanto (UC-17).

## UC-17 Incidente

**Flujo.**s

1. Desde el menú “Registrar incidente” elige la tarea, aunque ya tenga avance.
2. Describe el hecho y puede adjuntar imagen.
3. El incidente se suma a la línea de tiempo y al anexo de cierre.
4. No reabre el recordatorio horario por sí solo.

Tipos previstos: despacho, técnica, almacén, transporte, instalación, plataforma, otro.

## UC-18 Abrir hilos

**Flujo.**

1. En WhatsApp, dentro de la cotización, Telemetrías.
2. El técnico confirma cuántas telemetrías son. Una abre un hilo y tres abren tres.
3. Cada hilo pide a despacho el contenedor y la máquina. Si se instala, pide el chip a almacén.
4. Queda listo para la orden de fabricación cuando despacho está validado y, si instala, el chip está disponible. Un chip ocupado no se guarda.
5. La cantidad se corrige en la ficha. El IMEI, el contenedor y la máquina se corrigen en la ficha o por WhatsApp.

## UC-19 a UC-22 Materiales

**Flujo.**

1. En la atención elige crear MO o marcar “materiales no necesarios”.
2. Si crea MO, elige la lista de materiales de Odoo que aplica y ajusta cantidades.
3. SGIT crea la fabricación en Odoo y guarda el id externo.
4. Genera el PDF para imprimir y firmar.
5. Pide la foto de la MO firmada como constancia de solicitud.
6. Al volver de almacén, registra foto de recepción, o un incidente (“demora”, “sin stock”, ítem faltante).
7. Confirma “materiales recibidos” para pasar a instalación. Si no hubo MO, confirma “no fue necesario” y también pasa.

Reintentar la creación con la misma clave de idempotencia devuelve la MO ya creada.

## UC-23 a UC-26 Instalación, prueba y cierre

**Flujo.**

1. Carga fotos de instalación, dispositivo, contenedor, máquina, chip y equipo, más el identificador de chip y el código.
2. Según el modelo de máquina, consulta la API de conexión y guarda la lectura (temperatura u otros puntos que devuelva el modelo) como evidencia de prueba.
3. Pide a la plataforma un usuario nuevo con contraseña generada, o asigna una cuenta existente.
4. Al completar evidencias, prueba y usuario, la atención pasa a `cerrada`.
5. Cuando todas las atenciones de la tarea están cerradas o canceladas con motivo, la tarea puede cerrarse.
6. El cierre arma el anexo: línea de tiempo de situaciones, seguimientos e incidentes, fotos de prueba y datos del equipo.

## UC-27 y UC-28 Avisos de cierre

1. A despacho: telemetría instalada, código y referencia de COT / ticket, para que asigne y despache el equipo.
2. Al comercial: accesos a la plataforma y reporte de instalación.
3. Ambos envíos quedan en la bitácora con fecha y canal. Un reenvío es una acción explícita, no un efecto colateral de reabrir la pantalla.

## UC-08 Cola de revisión

El miembro ve el correo, corrige campos, confirma “es telemetría” (y entonces corre UC-05) o lo marca ajeno. La corrección puede alimentar ejemplos del parser, sin reescribir el mensaje original.

## UC-29 Línea de tiempo

Una sola vista ordenada por fecha con: correos del hilo, situaciones, seguimientos, incidentes, cambios de estado, MO, fotos, prueba de conexión y envíos de cierre. Es la pantalla que reemplaza “buscar en el correo y en el chat”.
