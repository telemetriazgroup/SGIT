# Sprints SGIT

Plan de construcción por sprints de una semana, alineado a las fases de [docs/08-plan-y-fases.md](docs/08-plan-y-fases.md) y a las historias de [docs/10-backlog-y-criterios-de-aceptacion.md](docs/10-backlog-y-criterios-de-aceptacion.md).

Cada sprint cierra un entregable mínimo que el área puede ver el viernes. El siguiente sprint se apoya en ese resultado y no reabre el proceso anterior salvo por un fallo de su prueba.

Calendario: 16 sprints, 16 semanas, equipo de 1 o 2 personas de desarrollo más el área de desarrollo en la demo. Si el inventario de Odoo se complica, el sprint 7 puede usar una semana extra sin mover el alcance de los demás.

## Cómo se prueba

Hay dos capas, y las dos tienen que estar hechas para dar el sprint por cerrado.

| Capa | Qué cubre | Dónde corre |
| --- | --- | --- |
| Automática del proceso | Reglas puras e integraciones con dobles: COT, estados, barrido, idempotencia | En cada cambio, sin Gmail, WhatsApp ni Odoo reales |
| Guiada del entregable | El viernes, con el sistema levantado, el flujo que el área va a usar | Buzón de pruebas, número de laboratorio, Odoo staging, API de laboratorio |

El reloj de negocio se inyecta en las pruebas automáticas. Nadie espera a las 18:00 ni a un feriado para saber si el barrido se dispara.

El correo de referencia es [docs/ejemplos/correo-cot-10020263623.md](docs/ejemplos/correo-cot-10020263623.md). En las tablas de este documento se llama **fixture**.

## Mapa de sprints

| Sprint | Fase | Entregable mínimo del viernes |
| --- | --- | --- |
| 0 | 0 Cimientos | El proyecto levanta en local y el acta de accesos está firmada |
| 1 | 1 Buzón | Se ven los correos importados, con imágenes y adjuntos |
| 2 | 1 Tarea | El fixture es una sola ficha, con los datos extraídos |
| 3 | 1 Hilo | Un reply no duplica; se corrige y se resuelve la cola de dudas |
| 4 | 2 Bitácora web | El equipo anota, adjunta foto, registra incidente y pide recordatorio sin WhatsApp |
| 5 | 2 Bot | El laboratorio recibe el aviso y responde por el chat |
| 6 | 2 Recordatorios | Despacho se consulta solo si no hay avance, y el piloto de bandeja puede encenderse |
| 7 | 3 Odoo lectura | La ficha muestra venta y ticket, o el conflicto, aunque Odoo no responda |
| 8 | 4 Hilos | De la cotización salen N hilos. Uno queda listo con despacho validado y, si instala, un chip disponible |
| 9 | 4 Fabricación | Una atención crea una sola MO en staging y se imprime |
| 10 | 4 Almacén | Con fotos, o con “no fue necesario”, la atención queda lista para instalar |
| 11 | 5 Instalación | Las evidencias de campo bloquean el paso si faltan |
| 12 | 5 Prueba | Queda la lectura del equipo, o una excepción de administrador |
| 13 | 5 Cierre | Usuario, un correo al comercial, un aviso a despacho y la tarea cerrada |
| 14 | 6 Salud | Tablero y runbook para token, QR, MO y reenvío |
| 15 | 6 Respaldo | Restore probado y los hilos reales dejan de caer en revisión |

Después del sprint 6 se puede pilotear el buzón real en un rango de fechas corto: clasifica, abre tareas y avisa. Escritura en Odoo de producción y usuarios reales de plataforma esperan al cierre del sprint 13 en laboratorio.

## Procesos y sprint en que quedan probados

| Proceso | Entra en | Suite que lo cierra |
| --- | --- | --- |
| Identidad y acceso | 0, y se usa en 4 y 5 | `prueba.identidad` |
| Buzón: sync y réplica | 1 | `prueba.buzon` |
| Clasificación | 2, se afina en 15 | `prueba.clasificacion` |
| Extracción | 2, se afina en 15 | `prueba.extraccion` |
| Tareas e hilo | 2 y 3 | `prueba.tareas` |
| Bitácora y recordatorios | 4 y 6 | `prueba.bitacora` |
| Notificaciones y bot | 5 y 6 | `prueba.bot` |
| Lectura Odoo | 7 | `prueba.odoo.lectura` |
| Hilos de telemetría | 8 | `prueba.hilos` y `prueba.lectura-chip` |
| Fabricación | 9 y 10 | `prueba.fabricacion` |
| Instalación | 11 | `prueba.instalacion` |
| Prueba de conexión | 12 | `prueba.conexion` |
| Plataforma y cierre | 13 | `prueba.cierre` |
| Salud, respaldo y auditoría | 14 y 15 | `prueba.operacion` |

Una suite anterior se vuelve a correr en los sprints siguientes. Si se pone roja, el sprint nuevo no se demo.

## Hecho de un sprint

- El entregable de la tabla se demostró con la prueba guiada.
- La suite del proceso quedó verde, incluidos los casos de este documento.
- Lo que no entró está escrito en “Queda fuera”.
- No hay tokens, sesiones de WhatsApp ni contraseñas en el repositorio.
- La demo dura lo que dura la prueba guiada: el área recorre el flujo, no mira una lista de pantallas.

---

## Sprint 0 — Cimientos

**Entregable.** Un desarrollador levanta API, web y bot en local. El área firma el acta de descubrimientos: modelos de Odoo, casilla a sincronizar, dueños de las API, feriados y si el comercial recibirá el reporte solo por correo.

**Historias.** H-00, H-01, H-02.

**Proceso.** Identidad y acceso, más el esqueleto de infraestructura.

### Pruebas — `prueba.identidad`

| Caso | Resultado |
| --- | --- |
| API, PostgreSQL, Redis y almacén de archivos responden a su chequeo de salud | Los cuatro en estado listo |
| La web abre la pantalla de ingreso | Carga sin error de configuración |
| Un operador de prueba entra; un usuario inexistente no | Sesión solo para el usuario creado |
| El bot de laboratorio emite el QR y llega a `listo` tras escanear | Una sesión en disco, fuera de git |
| `sessions/` y archivos `.env` no están en el índice de git | El repositorio no contiene secretos |

### Prueba guiada

1. Levantar el entorno con el instructivo del repositorio.
2. Entrar a la web con el usuario de prueba.
3. Mostrar el QR del bot y dejarlo conectado.
4. Recorrer el acta y dejar por escrito modelo de COT, modelo de ticket, modelo de MO, lista de materiales, usuario de Odoo staging, casilla de Gmail de pruebas y calendario laborable.

**Queda fuera.** Correos, tareas, menús del bot.

**Sale cuando.** El acta está firmada y los cinco casos automáticos pasan en una máquina limpia.

---

## Sprint 1 — Réplica del buzón

**Entregable.** El operador pide un rango de fechas y ve esos correos en SGIT, con el HTML, las imágenes dentro del cuerpo y los archivos descargables. A los 5 minutos entra lo nuevo.

**Historias.** H-10, H-11, H-12.

**Proceso.** Buzón.

### Pruebas — `prueba.buzon`

| Caso | Resultado |
| --- | --- |
| Listar un rango que ocupa más de una página de Gmail | Entran todos los mensajes del rango |
| Importar dos veces el mismo `gmailMessageId` | Una sola fila |
| El lote falla a la mitad | El `historyId` no avanza; el reintento completa sin duplicar |
| Mensaje con imagen inline y un adjunto | La imagen se ve en el cuerpo y el archivo se descarga autenticado |
| Llega correo nuevo con la sync en marcha | Aparece en menos de un ciclo de 5 minutos |
| Un adjunto que falla | El mensaje queda `incompleto` y se reintenta ese archivo |
| Backfill largo y sync reciente a la vez | Lo reciente no espera a que termine el histórico |
| URL de un adjunto sin sesión | No se entrega el archivo |

### Prueba guiada

1. Autorizar la casilla de pruebas.
2. Importar los últimos 7 días.
3. Abrir un correo que tenga imagen y un archivo.
4. Cortar la red durante un lote y reanudar: no se pierden mensajes ni se duplican.
5. Enviar un correo de prueba a la casilla y verlo en SGIT en el siguiente ciclo.

**Queda fuera.** Clasificación, tareas, avisos.

**Sale cuando.** La bandeja de correos sirve para leer el buzón de pruebas sin volver a Gmail.

---

## Sprint 2 — Clasificar y abrir la tarea

**Entregable.** El fixture se convierte en una tarea con COT, ticket, cliente, lugar, cita, temperatura, una telemetría y el comercial. Procesarlo otra vez no abre otra tarea.

**Historias.** H-13, H-14.

**Procesos.** Clasificación, extracción, tareas (alta).

### Pruebas — `prueba.clasificacion`

| Caso | Resultado |
| --- | --- |
| Fixture | `evento_desarrollo` |
| Cuerpo sin ZTRACK y sin términos del diccionario | `ajeno`, cero tareas |
| Un término del diccionario y sin bloque ZTRACK reconocible | `revisar`, cero tareas, cero avisos |
| Dos COT en el mismo asunto | `revisar`, cero tareas |
| Se desactiva un término y se agrega otro desde la pantalla de admin | El cambio vale sin desplegar código. El fixture sigue siendo evento mientras conserve ZTRACK y telemetría |

### Pruebas — `prueba.extraccion`

Sobre el fixture, los campos quedan así:

| Campo | Valor |
| --- | --- |
| COT | `10020263623` |
| Ticket | `2139` |
| Lugar | `MAKRO HUACHO` |
| Cliente | `MAKRO SUPERMAYORISTA S.A.` |
| Fecha y hora | 12/09/2026 10:00 America/Lima |
| Dirección y mapa | Av. San Martín 580 y el enlace de Google Maps |
| Temperatura y producto | −21 °C, congelados |
| Cantidad | 1 |
| Comercial | Olinda Lopez, `comercial4@zgroup.com.pe`, +51 981 322 944 |

Casos adicionales:

| Caso | Resultado |
| --- | --- |
| `cot 10020263623`, `COT10020263623` y `COT 10020263623` | La misma clave normalizada |
| `10 AM`, `10:00` y `10:00 a.m.` | 10:00 |
| `ÁREA TECNICA` y `AREA TECNICA` | La misma sección |
| `1 und de telemetría` y `2 telemetrías` | Cantidades 1 y 2 |
| Fecha u hora ilegible | La tarea puede nacer con la cita incompleta; el campo queda vacío, no inventado |
| Cada campo extraído | Guarda el fragmento del correo del que salió |

### Pruebas — `prueba.tareas` (alta)

| Caso | Resultado |
| --- | --- |
| Fixture procesado | Una tarea en `detectada` con los campos de arriba |
| Segunda pasada del mismo mensaje | Sigue habiendo una tarea y un mensaje |
| Correo `ajeno` | Almacenado, sin tarea |

### Prueba guiada

1. Procesar el fixture desde la bandeja.
2. Abrir la ficha y leer COT, ticket, Makro Huacho, Makro Supermayorista, 12/09/2026 10:00, −21 °C, 1 telemetría y Olinda Lopez.
3. Pulsar de nuevo “procesar”: la lista de tareas no crece.
4. En admin, agregar un término de prueba y ver que un correo armado con ese término cae en revisión.

**Queda fuera.** Replies, corrección humana, WhatsApp.

**Sale cuando.** El área reconoce en la ficha los datos que hoy lee a mano en el correo de ejemplo.

---

## Sprint 3 — Hilo, corrección y revisión

**Entregable.** Un reply de la misma cotización alarga la línea de tiempo y, si cambia la hora, deja la cita anterior guardada. Un campo corregido a mano no se vuelve a pisar. Un correo dudoso se confirma desde la cola y ahí sí nace la tarea.

**Historias.** H-15, H-16, H-17, H-18. Cierra la fase 1.

**Proceso.** Tareas e hilo.

### Pruebas — `prueba.tareas` (hilo)

| Caso | Resultado |
| --- | --- |
| Segundo mensaje con la misma COT | Una situación, una sola tarea |
| Reply sin COT y con el mismo `threadId` ya vinculado | Se anexa a esa tarea |
| Mensaje sin COT y sin hilo conocido | No crea tarea |
| El reply pasa la entrega de 10:00 a 15:00 | Situación `reprogramacion`; vigente 15:00; 10:00 queda en el historial |
| También cambia la dirección | La cita vigente toma la dirección nueva |
| El operador corrige el lugar y el mensaje se vuelve a evaluar | El lugar corregido se mantiene |
| El operador pulsa “volver a leer” en ese campo | El extractor puede reemplazarlo |
| Correo en `revisar`, el operador confirma “es telemetría” | Nace la tarea con la COT de ese correo |
| Correo en `revisar`, el operador lo marca ajeno | Sigue almacenado y no nace tarea |
| Línea de tiempo | Origen, situaciones y cambios de cita en orden cronológico |

### Prueba guiada

Es la aceptación de la fase 1:

1. Importar el fixture y verificar los campos del sprint 2.
2. Procesarlo otra vez: una tarea.
3. Anexar un reply que cambia la hora a las 15:00: una reprogramación, cita vigente 15:00, cita previa 10:00.
4. Corregir el cliente a mano y reprocesar: el cliente corregido sigue.
5. Procesar un correo sin señales: almacenado, sin tarea.
6. Cortar la sync a mitad de un lote y reanudarla: el puntero no se adelanta dejando mensajes afuera.
7. Confirmar un correo de la cola de revisión y ver nacer su tarea.

**Queda fuera.** Avisos al equipo, bitácora, Odoo.

**Sale cuando.** El área puede reemplazar la lectura del hilo de una COT por la ficha, todavía sin coordinar por WhatsApp.

---

## Sprint 4 — Bitácora en la web

**Entregable.** Sin bot, un miembro toma la tarea, escribe “Johan dice que no hay equipo”, adjunta una foto, registra un incidente y pide que le recuerden en 4 horas. La tarea con avance deja de ser candidata al barrido horario.

**Historias.** H-21, H-22, H-24 y H-25 en la web. La regla del barrido queda implementada; el envío por WhatsApp es el sprint 6.

**Proceso.** Bitácora y recordatorios.

### Pruebas — `prueba.bitacora`

El reloj de las pruebas se fija. La zona es `America/Lima`.

| Caso | Resultado |
| --- | --- |
| Seguimiento con texto e imagen, canal `web` | Queda el autor, la fecha, el texto y el archivo. La tarea pasa a `en_seguimiento` |
| Tarea `detectada`, lunes 09:00, día laborable | Entra al barrido |
| La misma tarea después del seguimiento, lunes 10:00 | No entra |
| Incidente sobre una tarea ya en seguimiento | Queda en la línea de tiempo y la tarea sigue fuera del barrido |
| Snooze de 4 horas a las 09:00 | No entra al barrido de las 10:00, 11:00 ni 12:00. A las 13:00 el recordatorio está vencido y se dispara aunque haya notas |
| Martes 07:59 y martes 18:01 | El barrido no corre |
| Domingo o feriado del calendario firmado en el sprint 0 | El barrido no corre |
| Dos evaluaciones del barrido entre 09:00 y 09:59 para la misma tarea | Un solo recordatorio horario |
| Nota de bitácora | No se borra; una anulación es otra nota |

### Prueba guiada

1. Entrar como miembro del equipo y tomar la tarea del fixture.
2. Cargar el seguimiento de despacho con una foto.
3. Ver el estado `en_seguimiento` y la foto en la línea de tiempo.
4. Registrar el incidente “Angie dice que la máquina está en reparación”.
5. Marcar validación a 4 horas y comprobar en la ficha la hora en que volverá a salir.
6. Con el reloj de prueba, comprobar que el barrido ya no la lista como pendiente sin avance.

**Queda fuera.** Envío real por WhatsApp y la pregunta a Johan.

**Sale cuando.** El equipo puede dejar constancia del día a día en la ficha si el bot está caído.

---

## Sprint 5 — Bot de avisos y menú

**Entregable.** Al nacer una tarea, los miembros activos del laboratorio reciben COT, cliente, lugar, cita y cantidad. Desde el chat pueden anotar, mandar una foto y registrar un incidente. El admin ve si la sesión está lista, esperando QR o caída.

**Historias.** H-20, H-21 por WhatsApp, H-25 por el menú, H-27, H-28.

**Proceso.** Notificaciones y bot.

### Pruebas — `prueba.bot`

| Caso | Resultado |
| --- | --- |
| Nace una tarea y hay miembros activos | Cada uno tiene un aviso en la cola con COT, cliente, lugar, cita y cantidad |
| Dos avisos seguidos | El segundo espera la pausa del outbox; no salen en el mismo instante |
| El número del miembro manda texto e imagen sobre una tarea | Seguimiento con canal `whatsapp` y ese usuario. La tarea pasa a `en_seguimiento` |
| Desde el menú de incidentes elige la tarea y manda foto | Incidente en la línea de tiempo |
| Un teléfono que no está registrado manda un mensaje | No se crea seguimiento ni incidente |
| La sesión cae | El admin ve `desconectado`. Los avisos siguen en la cola y salen al reconectar |
| Un segundo proceso del bot intenta usar la misma sesión | No arranca; queda un solo líder |
| Reply que reprograma, y la tarea ya tiene responsable | El responsable tiene un aviso de reprogramación. Un anexo rutinario no repite el aviso de “tarea nueva” |

### Prueba guiada

Con el número de laboratorio, no con el número operativo:

1. Crear una tarea de prueba y recibir el resumen en el teléfono del miembro.
2. Responder con una nota y una foto; verlas en la web con el autor correcto.
3. Abrir “Registrar incidente”, elegir la tarea y enviar otra foto.
4. Escribir desde un número no dado de alta y comprobar que la ficha no cambió.
5. En admin, leer el estado `listo` y la hora del último aviso.
6. Intentar levantar una segunda copia del bot y ver que se niega.

**Queda fuera.** El barrido que escribe a despacho y la confirmación del código.

**Sale cuando.** Un miembro puede informar una novedad desde el teléfono y otro la lee en la ficha.

**Cierre — 5 de octubre de 2026.** El técnico habilitado recibe el aviso, entra a la cotización, deja seguimiento o incidente con foto y eso se lee en la ficha. Un número no registrado no anota. La barra muestra Gmail y WhatsApp en línea, y Reiniciar si alguno está fuera. La suite `prueba.bot` quedó actualizada al menú y no se volvió a correr sobre esta base: limpia el líder y marca la sesión desconectada. El sprint 6 no se abre.

---

## Sprint 6 — Recordatorios y despacho

**Inicio — 6 de octubre de 2026.** Johan entra como usuario despacho (`johan@sgit.local`). Solo ve las tareas que el superusuario habilitó. Entre 08:00 y 18:00 el bot le pregunta código y máquina si tiene WhatsApp; la respuesta queda en borrador hasta que un miembro la confirma.

**Cierre — 18 de octubre de 2026.** Despacho responde por texto o por varias imágenes. Esas imágenes se guardan primero, se leen después y el técnico recibe un solo aviso, en la cotización, para decir ok o corregir una lectura. Si no responde en 5 minutos, queda registrado sin validar. Un contenedor leído en puros números se asume ZGRU hasta que el técnico escriba otro código. El superusuario ve esos movimientos en la ficha. El piloto del buzón real sigue sin dueño ni rango de fechas firmados. Con esto se abre el sprint 7.

**Entregable.** Entre 08:00 y 18:00 el bot pregunta a despacho por código y máquina solo mientras la tarea no tiene avance. Si Johan contesta en el chat, el código queda en borrador hasta que un miembro lo confirma. El snooze avisa a la hora pedida. Con esto se puede abrir el piloto del buzón real, acotado por fechas.

**Historias.** H-22, H-23, H-24, H-26. Cierra la fase 2.

**Procesos.** Bitácora (envío) y bot (despacho).

### Pruebas — `prueba.bitacora` y `prueba.bot`

| Caso | Resultado |
| --- | --- |
| Tarea `detectada`, lunes 09:00 | Una consulta a despacho con COT, cliente, lugar y fecha |
| Otra evaluación a las 09:40 | No sale una segunda consulta |
| A las 10:00, si sigue sin avance | Sale la siguiente, y no más de una en esa hora |
| La tarea ya está `en_seguimiento` a las 11:00 | No hay consulta |
| Sábado, o lunes 19:00 | No hay consulta |
| Snooze pedido a 5 minutos en el ambiente de prueba | Llega el aviso al vencer, aunque la tarea tenga notas. En producción el operador elige las horas; el caso de 4 horas queda cubierto por la misma regla |
| El chat de despacho propone código y máquina citando la COT | Borrador en la ficha. La atención todavía no los toma |
| Un miembro confirma el borrador | Código y máquina quedan firmes, con autor |
| Un miembro descarta el borrador | No se graban |

### Prueba guiada

Recorrido de la fase 2 con el número de laboratorio:

1. Tarea nueva: llega el aviso al equipo.
2. Consulta a despacho simulada mientras nadie anotó.
3. Nota con foto desde el chat: la tarea sale del barrido.
4. Incidente desde el menú: el barrido sigue sin incluirla.
5. Snooze de 5 minutos en prueba: llega el aviso.
6. Propuesta de código en el chat: se ve en borrador y solo pasa al confirmarla en la web.
7. Comprobar de nuevo que una segunda copia del bot no toma la sesión.

**Queda fuera.** Lectura y escritura en Odoo. El piloto, si se enciende, usa un rango corto del buzón real y no crea MO ni usuarios.

**Sale cuando.** El equipo acepta dejar de perseguir a mano los pendientes sin avance, y el piloto tiene dueño y rango de fechas.

---

## Sprint 7 — Lectura de Odoo

**Inicio — 18 de octubre de 2026.** La cotización `10020264043` es el pedido `sale.order` y el ticket `2365` es la tarea `project.task` de Servicio externo. SGIT copia pedido, líneas, notas, entrega y facturación. La conexión se guarda en la pantalla Odoo. Las tareas marcadas se vuelven a leer. SGIT no escribe en Odoo.

**Entregable.** La ficha de una tarea marcada muestra la cotización y el servicio externo guardados, con la fecha de esa lectura. Si hay dos documentos, el operador elige. Si Odoo no responde, sigue viendo la última copia.

**Historias.** H-30, H-31, H-32, H-33. Cierra la fase 3.

**Proceso.** Lectura Odoo.

### Pruebas — `prueba.odoo.lectura`

Doble del cliente en la suite automática, y un caso contra staging en la prueba guiada. Los nombres de modelo son los del acta del sprint 0.

| Caso | Resultado |
| --- | --- |
| Una sola venta para `10020263623` | La ficha muestra estado, id externo y fecha de lectura |
| Un solo ticket para `2139` | Igual en el bloque del ticket |
| Cero documentos | “Sin vínculo”. No se crea un id inventado |
| Dos ventas con el mismo número | “Ambiguo”. SGIT no elige la primera |
| El operador vincula uno de los dos | Ese id queda y la próxima lectura usa ese vínculo |
| Odoo no responde y había una lectura previa | Se muestra esa lectura, su fecha y el aviso de fallo |
| Odoo no responde y nunca hubo lectura | “Sin vínculo” más el aviso de fallo. La ficha abre igual |
| Cualquier flujo de este sprint | SGIT no escribe el estado comercial en Odoo |

### Prueba guiada

1. En staging, ubicar una COT de prueba con un solo pedido y abrir su ficha en SGIT.
2. Duplicar a propósito la referencia en un segundo documento de staging y ver el conflicto.
3. Elegir el documento correcto a mano.
4. Apagar el alcance de red hacia Odoo y recargar: la ficha sigue mostrando la lectura anterior.

**Queda fuera.** Crear la MO.

**Sale cuando.** El área contrasta el estado comercial en la ficha y en Odoo para la COT de prueba, y coinciden.

**Cierre — 18 de octubre de 2026.** La ficha de una tarea marcada guarda la cotización y el servicio externo. Si Odoo no responde, queda la última copia. El reloj sigue cada 3 minutos y relee la tarea cuando esa copia tiene más de 15 minutos. La pestaña Odoo muestra los cambios y la evolución, sin borrar los anteriores. En la tarea, Fechas lista la cita, las fechas leídas en Odoo y la reprogramación cuando el correo o Odoo cambian la entrega. En una campaña se asimilan todos los servicios externos. Si no es campaña y hay varios documentos, el operador elige cuál se queda. Las cotizaciones de producción contrastadas fueron `10020264043` y `10020263584`. Con esto se abre el sprint 8.

---

## Sprint 8 — Hilos

**Entregable.** El hilo reemplaza a la atención. De la cotización salen N hilos, uno por telemetría. El técnico confirma el número por WhatsApp. Despacho aporta el contenedor y la máquina. Si el hilo instala, almacén aporta el chip. El hilo queda listo para la orden de fabricación solo cuando despacho está validado y, si instala, el chip está disponible. Un chip ocupado se registra y el hilo sigue abierto: el técnico pide otro o regulariza la foto. El contenedor y la máquina se regularizan escritos o por imagen.

**Historias.** H-40.

**Proceso.** Hilos de telemetría.

El sistema ya consulta a despacho las cotizaciones pendientes. Si hay más de una telemetría, le dice cuántas son y pide la foto del contenedor y de la máquina del primer equipo, y después del siguiente. Si un equipo no trae foto ni texto, queda pendiente y no se salta.

Cuando el técnico toma la cotización, entra a Telemetrías. Si no hay hilos, escribe el número: 1 abre un hilo y 3 abren tres. Si a un hilo le falta el dato de despacho, la consulta sale en ese momento y no espera el ciclo automático. En cada hilo el menú es:

1. Validar lo que envió despacho.
2. Pedir ahora el contenedor y la máquina.
3. Pedir chip a almacén. Si el anterior está ocupado, pide otro.
4. Esta telemetría no se instala.
5. Volver a los hilos.
6. Regularizar el chip. Se escribe el IMEI o se manda la foto.
7. Regularizar el contenedor. Se escribe o se manda la foto.
8. Regularizar la máquina. Se escribe o se manda la foto.
9. Pedir otra imagen a almacén y a despacho. El mensaje recalca que el área de desarrollo solicita otra imagen más concluyente.

Almacén, al mandar la foto, recibe solo “Imagen procesada.” El resultado le llega al técnico. Si ya hay un celular, WhatsApp no lista las otras lecturas; esas quedan en el seguimiento. Si el chip está ocupado, el aviso dice que no se envía a una orden de fabricación.

La cantidad de hilos se corrige en la ficha, en Telemetrías, entre 1 y 20. Subir agrega hilos. Bajar quita solo los últimos que no están listos y no tienen chip. En la misma ficha se corrigen el contenedor, la máquina y el IMEI, con la misma regla del chip ocupado. La ficha también permite transferir la tarea y archivar o editar un seguimiento.

### Pruebas — `prueba.hilos` y `prueba.lectura-chip`

| Caso | Resultado |
| --- | --- |
| Hay 2 telemetrías | Despacho oye que son 2 y se le pide la foto del primer equipo, luego la del segundo |
| El técnico escribe 3 y la cotización no tiene hilos | Nacen 3 hilos y la cantidad de la tarea queda en 3 |
| Un hilo nuevo no tiene contenedor ni máquina | Despacho recibe el pedido en ese momento |
| Despacho validado y la telemetría no se instala | El hilo queda listo |
| Despacho validado, se instala y no hay chip | Sigue abierto. Falta el chip |
| Despacho validado y el chip está disponible | Queda listo. La orden de fabricación es el siguiente módulo |
| El chip leído está ocupado | Queda registrado y el hilo sigue abierto. El técnico pide otro o regulariza la foto |
| La foto ya identificó un celular | WhatsApp muestra ese IMEI y ese celular. Las otras lecturas quedan en el seguimiento |
| En la ficha se baja la cantidad y un hilo alto está listo o tiene chip | Se rechaza y ese hilo sigue |
| Se corrige el IMEI | Se busca el celular. Si no está en los chips cargados, no se guarda |
| La imagen no es concluyente | Se vuelve a pedir a almacén y a despacho, con la frase del área de desarrollo |
| Almacén manda la foto | Almacén recibe “Imagen procesada.” El resultado le llega al técnico |

### Prueba guiada

1. En una cotización tomada, abrir Telemetrías y confirmar el número de hilos.
2. Si falta el contenedor o la máquina, ver que despacho recibe el pedido en ese momento.
3. Validar despacho y marcar si esa telemetría se instala.
4. Con un chip ocupado, ver que queda registrado y que el hilo no queda listo.
5. En la ficha, corregir la cantidad y el contenedor, la máquina o el IMEI.
6. Pedir otra imagen y ver que almacén y despacho reciben el pedido de una imagen más concluyente.

**Queda fuera.** La orden de fabricación, las listas de materiales y las fotos de almacén. Cambiar la cantidad no pide un motivo: se rechaza solo si el hilo que se quitaría ya está listo o ya tiene chip.

**Sale cuando.** El equipo distingue la cotización de cada telemetría, y un hilo listo tiene despacho validado y, si instala, un chip que no está ocupado.

**Cierre — 19 de octubre de 2026.** El hilo reemplaza a la atención. `prueba.hilos` y `prueba.lectura-chip` quedaron verdes. En la ficha de la COT `10020263584` se registró el chip ocupado `8951029078500034086`, celular `919863833`, y el hilo 1 siguió abierto. El contenedor `ZGRU5333709` y la máquina `E0GM015342` se mantuvieron. Una foto sin IMEI no borró ese registro. La cantidad, el IMEI, el contenedor y la máquina se regularizan en la ficha o por WhatsApp, por texto o por imagen. La orden de fabricación no se crea aquí. Con esto se abre el sprint 9.

---

## Sprint 9 — Orden de fabricación

**Inicio — 19 de octubre de 2026.** Se abre desde un hilo listo. Un chip ocupado no entra.

**Entregable.** Desde un hilo listo se abre la orden de fabricación del producto `[GPNDND0002] CT TRACK REEFER (HARDWARE)`. Primero se toma el borrador más antiguo de ese producto que no tenga ref. cotización ni Lot/Serial Numbers. Solo si no hay ninguno se crea una orden nueva. La ref. cotización es la COT y el ejecutor sale del técnico: Marcelo, Edwin o Vásquez; si no es ninguno, Eusebio Avellaneda. Si Odoo responde que ya hay 80 órdenes y no quedó un borrador libre, queda un incidente. El técnico recibe un enlace: el chip y el USR-G786 vienen marcados, puede quitar materiales y cambiar cantidades, y la serie del módem puede ir vacía para que Odoo la elija. Al decir que está seguro, WhatsApp muestra el resumen. Escribe ok para confirmar la orden en Odoo, o enlace para volver a elegir. Un hilo no abre dos órdenes.

**Proceso.** Fabricación. `prueba.fabricacion`.

### Pruebas — `prueba.fabricacion`

| Caso | Resultado |
| --- | --- |
| El técnico se llama Marcelo, Edwin o Vásquez | El ejecutor es el empleado correspondiente |
| El técnico o el admin no es ninguno de ellos | El ejecutor es Avellaneda Moya Eusebio |
| Hay un borrador de GPNDND0002 sin cotización ni serie | Se toma ese, el más antiguo, y no se crea otra orden |
| No hay un borrador así | Se crea una orden nueva |
| Odoo dice que llegó al límite de 80 y no hay borrador libre | Queda un incidente |
| El borrador ya tiene cotización, IMEI, GSM o cualquier Lot/Serial | No se reutiliza |
| La lista se abre | El chip `INDND4855` y el módem `INDND7509` vienen marcados; el resto no |
| El módem no lleva serie | El resumen dice que Odoo elige la serie |

### Prueba guiada

1. En un hilo con chip ocupado, Pedir insumos avisa que no está listo y no toca Odoo.
2. En un hilo listo, la opción 10 o Pedir insumos abre o reutiliza el borrador y manda el enlace.
3. En el enlace se marcan materiales, se cambia la cantidad y, si hace falta, la serie del módem.
4. Estoy seguro deja la propuesta y WhatsApp muestra el resumen.
5. Enlace vuelve a abrir la lista. Ok confirma la orden en Odoo.

**Queda fuera.** El PDF para firmar y las fotos de almacén. Eso sigue para el sprint 10.

**Sale cuando.** Un hilo listo deja una orden confirmada en Odoo, con la COT, el ejecutor y solo los materiales que el técnico pidió.

---

## Sprint 10 — Constancia de almacén

**Entregable.** Con la foto de la MO firmada la atención espera a almacén. Con la foto de recepción se confirman los materiales. Si no hay stock, queda un incidente y la atención no se cierra. Si no hacía falta material, se salta la MO y queda habilitada la instalación.

**Historias.** H-43, H-44, H-45. Cierra la fase 4.

**Proceso.** Fabricación (cierre del tramo de materiales).

### Pruebas — `prueba.fabricacion` (almacén)

| Caso | Resultado |
| --- | --- |
| MO creada y sin foto firmada | No pasa a `esperando_almacen` |
| Foto de la MO firmada | Pasa a `esperando_almacen` |
| Confirmar recibidos sin foto de recepción | Se rechaza |
| Foto de recepción y confirmación | `materiales_recibidos` y de ahí puede pasar a `en_instalacion` |
| Incidente “sin stock” con foto | Queda en la línea de tiempo. El estado no es cerrado ni cancelado |
| “No fue necesario” sin nota | Se rechaza |
| “No fue necesario” con nota | `en_instalacion` habilitado y ninguna MO creada |

### Prueba guiada

1. Subir la foto de una MO firmada de laboratorio y ver el estado de espera.
2. Registrar “almacén no tiene el kit” con una foto: la atención sigue abierta.
3. Subir la foto de recepción y confirmar materiales recibidos.
4. En una segunda atención de la misma tarea, marcar “no fue necesario” y ver que no aparece una MO en Odoo.

**Queda fuera.** Fotos del dispositivo instalado y la API del equipo.

**Sale cuando.** Una atención de laboratorio llegó a “lista para instalar” con la constancia, y otra llegó por el atajo sin materiales.

---

## Sprint 11 — Evidencia de instalación

**Entregable.** En la atención se cargan fotos del dispositivo, del contenedor y de la máquina, más chip y código de equipo. Si falta uno de esos datos, no pasa a prueba.

**Historias.** H-50.

**Proceso.** Instalación.

### Pruebas — `prueba.instalacion`

| Caso | Resultado |
| --- | --- |
| Falta el chip, el código o cualquiera de las fotos mínimas | Permanece en `en_instalacion` |
| Dispositivo, contenedor, máquina, chip y código completos | Pasa a `en_prueba` |
| Cada archivo | Queda en la línea de tiempo de la atención, con autor y fecha |
| La atención no confirmó materiales ni “no fue necesario” | No acepta el cierre de instalación |

### Prueba guiada

1. Entrar a la atención que quedó lista para instalar en el sprint 10.
2. Intentar pasar de fase sin el chip y ver el bloqueo.
3. Completar fotos, chip y código desde el teléfono.
4. Ver el estado `en_prueba` y las fotos en la ficha.

**Queda fuera.** La llamada a la API del equipo y el usuario de plataforma.

**Sale cuando.** La ficha de esa atención sirve como expediente fotográfico de la instalación de laboratorio.

---

## Sprint 12 — Prueba de conexión

**Entregable.** Según el modelo de máquina, SGIT consulta el conector de esa familia y guarda la lectura. Si la API falla, la atención se queda en prueba. Un administrador puede autorizar seguir, con motivo.

**Historias.** H-51, H-52.

**Proceso.** Prueba de conexión.

Entra una sola familia: la que el acta del sprint 0 haya puesto primera. La segunda familia no se abre en este sprint.

### Pruebas — `prueba.conexion`

| Caso | Resultado |
| --- | --- |
| Modelo de la familia prioritaria | Se llama su conector, no el de otra familia |
| La API responde bien | Se guardan hora, éxito, resumen y extracto. La atención pasa a `en_plataforma` |
| La API responde error o no responde | Sigue en `en_prueba`. Se puede reintentar |
| Un operador pide saltar la prueba | Se rechaza |
| Un administrador la autoriza con motivo | Avanza, y quedan su usuario y el motivo |
| El extracto guardado y los logs | No contienen tokens de la API |

### Prueba guiada

1. Cargar en la atención el modelo de laboratorio (Magnum Plus o Starcool, el que se haya priorizado).
2. Lanzar la prueba contra la API de laboratorio y leer temperatura u otra señal en la ficha.
3. Repetir con la API detenida y ver que no avanza.
4. Entrar como administrador, autorizar la excepción y ver el motivo en la auditoría de la atención.

**Queda fuera.** Alta del usuario y el reporte al comercial. Si la API real todavía no tiene especificación, este sprint no se declara cerrado con un conector simulado puesto en el ambiente que el área usa.

**Sale cuando.** Hay una lectura real de laboratorio asentada en una atención, o una excepción firmada por el administrador sobre un fallo real de esa API.

---

## Sprint 13 — Usuario, reporte y cierre

**Entregable.** La atención de laboratorio genera o asigna un usuario de prueba, arma el reporte y, al cerrar la tarea, manda un correo al comercial de prueba y un WhatsApp a despacho con el código. Cerrar otra vez no vuelve a enviar. En los logs no está la contraseña.

**Historias.** H-53, H-54, H-55, H-56. Cierra la fase 5.

**Proceso.** Plataforma y cierre.

### Pruebas — `prueba.cierre`

| Caso | Resultado |
| --- | --- |
| Alta de usuario | Se guarda el identificador, el usuario y la contraseña cifrada. En pantalla se muestra una vez |
| Buscar esa contraseña en los logs del API y del bot | Cero coincidencias |
| Reintentar el alta de la misma atención | No nace un segundo usuario |
| Asignar una cuenta existente | No se regenera la contraseña |
| Cerrar la tarea con una atención todavía en instalación | Se rechaza |
| Una atención `cancelada` con motivo y las demás `cerrada` | La tarea sí puede cerrarse |
| Primer cierre | Un correo al comercial con PDF y accesos. Un WhatsApp a despacho con COT y código |
| Cerrar de nuevo, o reabrir la pantalla | No hay segundo envío |
| El operador pulsa reenviar | Sale otra vez y queda el autor del reenvío |
| Un administrador reabre la tarea | El historial sigue. No se reenvían accesos hasta un cierre nuevo y explícito |
| El chat interno del equipo | No recibe la contraseña. El medio de entrega es el reporte |

### Prueba guiada

Recorrido de la fase 5, que puede empezar en una atención con materiales no necesarios para no depender de una MO nueva:

1. Completar evidencias y prueba, o la excepción del sprint 12.
2. Generar el usuario de prueba.
3. Cerrar la atención y la tarea.
4. Verificar un solo correo en el buzón del comercial de prueba y un solo mensaje en el WhatsApp de despacho de laboratorio.
5. Cerrar otra vez y comprobar que no llega duplicado.
6. Revisar los logs con la contraseña de prueba.

**Queda fuera.** Usuarios reales de clientes y MO en Odoo de producción. Eso se habilita cuando esta prueba guiada está firmada por el área.

**Sale cuando.** El circuito del caso, de la COT al acceso, se recorrió una vez en laboratorio sin secretos en los logs.

---

## Sprint 14 — Salud y runbooks

**Entregable.** El administrador abre una pantalla con la última sync, la cola de revisión, las tareas `detectada` sin movimiento, el estado del bot y el último error de Odoo y de plataforma. Existe un runbook y otra persona lo ejecutó: reautorizar Gmail, mostrar el QR, reintentar una MO y reenviar un reporte.

**Historias.** H-60 y los runbooks de la fase 6.

**Proceso.** Salud y auditoría.

### Pruebas — `prueba.operacion` (salud)

| Caso | Resultado |
| --- | --- |
| La última sync falló | El tablero lo muestra con la hora y el error |
| Hay mensajes en `revisar` | El contador coincide con la cola |
| Hay tareas `detectada` desde hace más de un día laborable | Aparecen en el tablero |
| El bot está en `esperando QR` | El tablero no dice `listo` |
| Odoo o la plataforma devolvieron error en la última llamada | Se ve el error y la atención afectada, sin cuerpos que traigan contraseñas |

### Prueba guiada

Una persona que no escribió el código ejecuta, en laboratorio:

1. Invalidar el token de Gmail y volver a autorizar siguiendo el runbook.
2. Borrar la sesión de prueba del bot y volver a escanear el QR.
3. Reintentar una MO que quedó en error.
4. Reenviar el reporte de la tarea de laboratorio y ver el registro de auditoría.

**Queda fuera.** El restore completo. Es el sprint 15.

**Sale cuando.** El runbook quedó ejecutado de punta a punta y el tablero reflejó cada corte que se provocó.

---

## Sprint 15 — Respaldo y afinado del parser

**Entregable.** Se restaura base, archivos y sesión en un ambiente limpio, y una COT conocida vuelve con sus adjuntos. Los hilos reales que cayeron en revisión durante el piloto quedan clasificados, y un correo nuevo de la misma forma ya no entra a la cola. El fixture original sigue dando los mismos campos.

**Historias.** H-61, H-62. Cierra la fase 6.

**Procesos.** Operación, clasificación y extracción.

### Pruebas — `prueba.operacion` (respaldo)

| Caso | Resultado |
| --- | --- |
| Backup de PostgreSQL, almacén de archivos y sesión del bot | Los tres artefactos existen y están cifrados |
| Restore en un ambiente vacío | La COT de laboratorio aparece con su línea de tiempo, sus fotos y el id de Odoo |
| Abrir un adjunto después del restore | El archivo abre |
| El bot restaurado | Llega a `listo` con la sesión recuperada, o el runbook deja claro el único paso manual si WhatsApp exige un QR nuevo |

### Pruebas — `prueba.clasificacion` y `prueba.extraccion` (regresión)

| Caso | Resultado |
| --- | --- |
| Fixture original | Sigue en `evento_desarrollo` con los mismos campos del sprint 2 |
| Cada hilo real anonimizado que estuvo en revisión, ya incorporado a `fixtures/emails/` | Queda en la clase que el área decidió, `evento_desarrollo` o `ajeno` |
| Una variante nueva equivalente a uno de esos hilos | No cae en `revisar` |
| Correo sin señales | Sigue siendo `ajeno` |

### Prueba guiada

1. Anotar la COT de laboratorio y apagar ese ambiente.
2. Restaurar en limpio con el runbook.
3. Abrir la COT, una foto y el estado de Odoo.
4. Pasar con el área la lista de hilos que estuvieron en revisión y marcar cuáles ya no deben dudar.
5. Soltar una copia anonimizada de uno de esos hilos y ver que la cola no crece.

**Queda fuera.** App nativa, API oficial de Meta, watch push de Gmail y una segunda familia de máquina.

**Sale cuando.** El restore se hizo una vez delante del área y la cola de revisión del piloto no conserva los casos ya afinados.

---

## Qué se demuestra en cada viernes

| Viernes | El área se lleva |
| --- | --- |
| 0 | Ambiente y decisiones de Odoo, Gmail y calendario |
| 1 | Bandeja que ya es una réplica del buzón de pruebas |
| 2 | Ficha de la COT 10020263623 |
| 3 | Hilo sin duplicados y cola de dudas |
| 4 | Bitácora usable aunque WhatsApp no exista |
| 5 | Aviso y respuesta por el chat de laboratorio |
| 6 | Reglas de 08:00 a 18:00 y luz verde al piloto acotado |
| 7 | Estado de venta y ticket dentro de la ficha |
| 8 | Un hilo por telemetría, listo solo con despacho y, si instala, un chip disponible |
| 9 | MO impresa, una sola, en staging |
| 10 | Materiales recibidos o declarados innecesarios |
| 11 | Expediente fotográfico de la instalación |
| 12 | Lectura del equipo asentada |
| 13 | Cierre con accesos y aviso a despacho |
| 14 | Alguien que no programó el sistema lo reconecta con el runbook |
| 15 | Copia restaurada y parser afinado con el correo real del piloto |
