# Análisis total de SGIT

Fecha de corte: 2 de noviembre de 2026. Este documento describe qué hace el sistema hoy, cómo se construyó y en qué punto está cada fase. La fuente es el código de `apps/api`, `apps/web` y `apps/bot`, las migraciones `001` a `055`, las suites `prueba.*` y los cierres escritos en `sprint_sgit.md` y `Proceso_wat_ok.md`.

SGIT es el sistema de gestión de instalación de telemetrías del área de desarrollo de ZGroup. La solicitud no llega por un formulario: llega dentro de un correo de “ASIGNAR Y DESPACHAR” que también habla con despacho, SSOMA, almacén, técnica y transporte. El área tiene que reconocer el bloque ZTRACK, abrir un expediente por cotización y acompañarlo hasta los materiales, la instalación y el aviso de que el equipo ya está puesto.

La pantalla pública que aparece en los incidentes de operación es `https://ztrack.app/SGIT/`.

## Qué hace el sistema

El recorrido que el código ya opera es este.

1. **Replica el buzón.** Se conecta por OAuth a `telemetria@zgroup.com.pe`. Trae el HTML, las imágenes del cuerpo y los adjuntos. La sincronización reciente corre cada 3 minutos, de 5 mensajes en 5. Un rango histórico largo no bloquea lo reciente. El mismo mensaje de Gmail no se guarda dos veces. Un adjunto que falla deja el mensaje incompleto y se reintenta.
2. **Clasifica.** Un correo con COT y una convocatoria al área (ZTRACK, telemetría, Eusebio, Luis, o un término del diccionario) abre tarea. Un correo sin señales queda en otros. Una mención suelta, o una cotización que no cita al área, queda pendiente de decisión. Publicidad conocida (LinkedIn, Cursor, Canva) cae en otros. El diccionario se edita en la web y el cambio vale sin desplegar código.
3. **Abre una sola tarea por cotización.** Del asunto y del cuerpo saca COT, ticket de ventas, cliente, lugar, cita, dirección, mapa, temperatura, producto, cantidad de telemetrías y la firma del comercial. Un reply de la misma COT, o del mismo hilo de Gmail, alarga la línea de tiempo. Si cambia la hora, la cita anterior queda en el historial. Un campo corregido a mano no se vuelve a pisar hasta que alguien pulse “volver a leer”.
4. **Coordina al equipo por la web y por WhatsApp.** El bot usa `whatsapp-web.js` en un proceso aparte, con una sola sesión. Al nacer una tarea avisa a los miembros activos. Desde el chat o desde la ficha se anota seguimiento, incidente y foto. Un número que no está registrado no escribe en las tareas.
5. **Pide contenedor y máquina a despacho.** Johan entra como usuario despacho y solo ve las tareas que el superusuario habilitó. La cola le pregunta cada 30 minutos, dentro del horario de operación, el contenedor y la máquina de los hilos que todavía no los tienen. Puede contestar por texto o por varias fotos. Esas fotos se leen, el técnico recibe un solo aviso para decir ok o corregir, y si no responde en 5 minutos la lectura queda sin validar. Un contenedor de puros números se asume ZGRU hasta que el técnico escriba otro código.
6. **Parte la cotización en hilos.** Una telemetría es un hilo. El técnico escribe cuántas son, de 1 a 20. El hilo queda listo para pedir insumos cuando despacho está validado y, si esa unidad se instala, el chip está disponible. Un chip ocupado se registra y el hilo sigue abierto. Si la máquina es Carrier o Daikin, si se prioriza otro pedido, o si no hay stock, se anota que esa telemetría no se instala.
7. **Pide los materiales en Odoo.** El producto es `[GPNDND0002] CT TRACK REEFER (HARDWARE)`. Se toma el borrador más antiguo de ese producto que no tenga cotización ni serie. Si no hay, se crea una orden. El ejecutor sale del técnico (Marcelo, Edwin o Vásquez); en otro caso es Eusebio Avellaneda. El chip `INDND4855` y el módem `INDND7509` vienen marcados. El técnico ajusta materiales por un enlace y confirma por WhatsApp. Al confirmar, los componentes pedidos quedan consumidos. Un hilo no abre dos órdenes. Si Odoo responde que llegó al límite de 80 órdenes y no hay borrador libre, queda un incidente.
8. **Deja constancia de almacén e imprime.** Se registra la foto de la solicitud entregada a almacén y las fotos de la recepción. El técnico puede preguntar por chat si los insumos ya están listos para retirar. El PDF de la orden se baja de Odoo una vez, se guarda, y se manda a la impresora (Print API, en laboratorio `http://192.168.1.166:7101`).
9. **Registra la instalación que ya se puede documentar.** Fotos del trabajo, comentario, chip, módulo 4G (SN e IMEI de la etiqueta) y, si el equipo ya traía telemetría, la asimilación de la orden de fabricación que ese chip ya tiene en Odoo. La asimilación solo escribe en Odoo cuando el número del chip del hilo coincide con el de la orden.
10. **Lee Odoo y lo muestra en la ficha.** La cotización es un `sale.order` y el ticket es una `project.task` de Servicio externo. SGIT guarda pedido, líneas, notas, entrega y facturación. Si Odoo no responde, queda la última copia. El reloj relee cada 3 minutos las tareas cuya copia tiene más de 15 minutos. Si hay varios documentos y no es una campaña, el operador elige. En una campaña se asimilan todos los servicios externos.

Lo que el caso original pide y el código todavía no hace: consultar la API del equipo (Starcool, Thermoking o Genset) para dejar la lectura de la instalación, crear o asignar el usuario de la plataforma, armar el reporte con accesos y enviarlo al comercial, y avisar a despacho que el código ya puede asignarse como cierre formal de la tarea. El menú de WhatsApp ya muestra esas tres validaciones de conexión y responde, en texto, que todavía no están implementadas. Usarán el IMEI del módulo 4G cuando existan.

## Cómo está armado

Cuatro procesos comparten PostgreSQL, Redis y el almacén de archivos.

| Proceso | Qué hace |
| --- | --- |
| `apps/api` | Identidad, buzón, clasificación, tareas, hilos, Odoo, fabricación, chips, módems, impresión, salida, respaldo y lector de imágenes |
| `apps/web` | Bandeja de correo, ficha de tarea, diccionario, bot, cuentas, chips, M2M, impresión, Odoo, respaldo, lector y QR |
| `apps/bot` | Sesión de WhatsApp Web, menús y envío de la cola. No clasifica correos ni crea órdenes |
| Relojes del API | Sync de Gmail, relectura de Odoo, cola de despacho, snooze y salida de correos |

La web habla solo con el API. El bot publica lo que el técnico escribió y consume avisos que el dominio ya decidió. Hay un solo líder de sesión: un segundo proceso no arranca con la misma sesión.

Roles que existen en la base: superusuario, administrador, operador, técnico, despacho y almacén.

| Rol | Qué ve y qué hace |
| --- | --- |
| Superusuario | Buzón, bot, cuentas, Odoo, respaldo, lector, chips y M2M. Cierra por regularización |
| Administrador | Tareas, corrección, diccionario, impresión y el menú ampliado de WhatsApp |
| Operador | Opera el sistema y edita tareas |
| Técnico | Tareas, seguimiento, incidente y el recorrido de telemetrías. Guarda su número en Mi cuenta |
| Despacho | Solo las tareas habilitadas. Responde contenedor y máquina por WhatsApp |
| Almacén | Recibe el pedido de chip o de módulo, manda la foto y contesta si los insumos están listos |

Cuentas de laboratorio descritas en el caso: `superusuario@sgit.local`, `admin@sgit.local` y `tecnico@sgit.local`. La puesta en marcha local usa `operador@sgit.local`. Despacho de laboratorio: `johan@sgit.local`.

## Pantallas

La bandeja es la aplicación. Después del ingreso, el menú lateral abre:

| Pantalla | Para qué |
| --- | --- |
| Recibidos y Enviados | Réplica del buzón, con búsqueda, HTML, imágenes y descarga de adjuntos. Redactar existe en la bandeja |
| Tareas | Ficha de la COT: datos extraídos, fechas, situaciones del hilo, bitácora, hilos, corrección, transferencia, campaña y hoja de Odoo |
| Diccionario | Términos que convocan al área |
| Bot | Estado de la sesión, QR, reinicio y bitácora de conexión |
| Salida | Cola de WhatsApp y de correo que otra aplicación deja en SGIT |
| Cuentas | Alta y edición de administradores, técnicos, despacho y almacén |
| Chips | Inventario cargado por Excel o CSV, estado ocupado o disponible, y la orden en la que se consumió |
| M2M | Módulos 4G, con serie, existencia y si ya salieron al cliente |
| Imprimir | Dirección de la Print API, prueba de impresión e historial |
| Odoo | Conexión, copia del pedido y de la tarea, y los cambios entre lecturas |
| Respaldo | Partidas del buzón: mensajes, adjuntos y clasificación, cortadas por peso |
| Lector | Prueba de lectura de imágenes (contenedor, máquina, chip, etiqueta del módulo) |
| QR | Código para vincular WhatsApp |
| Mi cuenta | Nombre y teléfono del usuario |

La barra superior muestra si Gmail y WhatsApp están en línea y ofrece Reiniciar cuando alguno está fuera.

## Menú de WhatsApp

El flujo que usa el técnico está escrito en `Proceso_wat_ok.md` y coincide con los menús de `apps/api/src/bot/avisos.ts`.

Menú general del administrador: tareas recientes, asuntos internos, pendientes de decisión, buscar cotización, imprimir y salir. El técnico ve tareas recientes, buscar cotización y salir. También se puede escribir la COT o el nombre del cliente. Escribir `menu` vuelve al menú anterior.

Dentro de la cotización: datos, seguimiento, incidente, último seguimiento, último incidente, resumen y telemetrías. El administrador además cierra por regularización.

Dentro del hilo:

1. Área despacho. Validar, pedir ahora el contenedor y la máquina, regularizar por texto o foto, y ver los últimos registros.
2. Área almacén. Ver lo de despacho, pedir chip, pedir módulo 4G, regularizar chip o módulo, registrar la entrega de la solicitud, registrar la recepción y preguntar si ya se puede retirar.
3. Esta telemetría no se instala, con motivo.
4. Ya tiene telemetría. Regularizar chip y módulo, asimilar la orden de Odoo, fotos de la instalación que ya está, y las tres validaciones de conexión, que responden que faltan.
5. Orden de fabricación. Pedir insumos, modificar el borrador, confirmar, ver el PDF, imprimirlo y abrir el reporte de instalación.
6. Volver.

El reporte de instalación, una vez confirmada la orden, recibe fotos, un comentario, el IMEI del módulo y las mismas tres validaciones pendientes. Si no hay texto junto a las fotos, el bot espera 15 segundos y vuelve al menú.

Atajos desde la lista de cotizaciones: `3-1-A` abre almacén del hilo 1 de la cotización 3, `3-1-D` despacho, `3-1-R` regularización y `3-1-F` fabricación.

## Integraciones que ya hablan

| Sistema | Uso actual |
| --- | --- |
| Gmail | Lectura del buzón y, por la cola de salida, envío de correos que otra aplicación deja encargados. El ciclo reciente es de 3 minutos |
| Odoo | Lectura de `sale.order` y `project.task`. Escritura de la orden de fabricación del producto GPNDND0002, notas del chatter, consumo de componentes y PDF oficial. Cotizaciones contrastadas en el cierre del sprint 7: `10020264043` y `10020263584` |
| WhatsApp Web | Avisos, menús, fotos y la cola de salida. Un número ajeno que responde a un mensaje de salida recibe solo el teléfono de contacto, y no entra al menú |
| Print API | Envío del PDF de la orden. Una copia por pedido. El mismo `external_id` no se imprime dos veces |
| Lector de imágenes | Contenedor, serie de máquina, tarjeta de chip (IMEI y celular) y etiqueta ZTRACK del módulo (SN e IMEI) |
| Salida | `POST` con clave `x-salida-clave`. Hasta 30 WhatsApp y 30 correos por llamada. Los correos salen con 20 segundos de separación. Producción: `https://ztrack.app/SGIT/servicio/salida` |

La API de conexión del equipo y la API de usuarios de la plataforma siguen sin dueño ni contrato en el acta de descubrimientos. Por eso las opciones 3, 4 y 5 del reporte de instalación no llaman a ningún conector.

## Fases

El plan de `docs/08-plan-y-fases.md` son siete fases, 16 sprints y unas 16 a 18 semanas. Los cierres con fecha están escritos hasta el sprint 8 (19 de octubre de 2026). El sprint 9 se abrió ese mismo día. El código de noviembre ya cubre el trabajo de los sprints 9 y 10 y una parte del 11, y deja abiertos el 12, el 13 y el cierre formal del 14 y el 15.

| Fase | Nombre | Estado al 2 de noviembre de 2026 |
| --- | --- | --- |
| 0 | Cimientos | Operativa. Monorepo, PostgreSQL, Redis, archivos, ingreso y bot hasta el QR. El acta de descubrimientos sigue marcada “pendiente de firma”, aunque la casilla, los modelos de Odoo y el producto de fabricación ya se usan en el código |
| 1 | Buzón y tarea | Cerrada en operación. Réplica, clasificación, extracción, una tarea por COT, hilo, corrección humana y cola de pendientes |
| 2 | Operación y WhatsApp | Cerrada el 18 de octubre, y después ampliada. Bitácora, avisos, incidentes, snooze, despacho por texto y por foto, y menús de técnico, despacho y almacén |
| 3 | Lectura de Odoo | Cerrada el 18 de octubre. Copia, ambigüedad, campaña, reloj de 3 minutos y evolución en la ficha |
| 4 | Hilos, fabricación y almacén | En uso. Hilos desde el 19 de octubre. La orden, el enlace de materiales, la confirmación, el PDF, la impresora, la foto de solicitud y la foto de recepción están en el menú. El estado del hilo en base sigue siendo solo `abierto` o `listo`: la constancia de almacén vive en la bitácora y en la orden, no en la máquina de estados que dibujó el modelo de dominio |
| 5 | Instalación, prueba y cierre | A medias en la evidencia, y abierta en el cierre. Hay fotos, comentario, módulo 4G y asimilación de una orden ya existente. Falta la llamada a Starcool, Thermoking y Genset, el usuario de plataforma, el reporte con accesos, el correo al comercial y el aviso de cierre a despacho |
| 6 | Endurecimiento | Parcial. Hay barra de salud de Gmail y WhatsApp, bitácora de conexión, reinicio, impresión con historial y respaldo por partidas del buzón. Falta el tablero de tareas detenidas y de errores de Odoo, el runbook ejecutado por otra persona, y el restore completo de base, archivos y sesión del bot delante del área |

### Sprint por sprint

| Sprint | Fase | Qué pedía el viernes | Dónde está |
| --- | --- | --- | --- |
| 0 | Cimientos | Levantar API, web y bot, y firmar el acta | El entorno local está en `docs/puesta-en-marcha.md`. El acta no tiene la firma ni los dueños de las API de cierre |
| 1 | Buzón | Ver correos con imágenes y adjuntos | Hecho. Suite `prueba.buzon`. El ciclo quedó en 3 minutos, no en 5 |
| 2 | Tarea | El correo de ejemplo es una sola ficha | Hecho. `prueba.clasificacion`, `prueba.extraccion`, `prueba.tareas` |
| 3 | Hilo | Un reply no duplica y la duda se resuelve a mano | Hecho. Situaciones, cita anterior, campos protegidos y confirmación de pendientes |
| 4 | Bitácora web | Nota, foto, incidente y recordatorio sin WhatsApp | Hecho. `prueba.bitacora`. Estados de tarea: `detectada`, `en_seguimiento`, `en_validacion`, `resuelta` |
| 5 | Bot | Aviso y respuesta por el chat | Cerrado el 5 de octubre de 2026 |
| 6 | Despacho | Preguntar código y máquina solo si no hay avance | Cerrado el 18 de octubre. Después el ciclo pasó a una cola cada 30 minutos y acepta varias imágenes. El piloto del buzón real, en ese cierre, seguía sin dueño ni rango firmados; aun así las cotizaciones de producción ya se contrastaron en el sprint 7 |
| 7 | Odoo lectura | Venta y ticket en la ficha | Cerrado el 18 de octubre. `prueba.odoo` |
| 8 | Hilos | N hilos, despacho validado y chip disponible | Cerrado el 19 de octubre. En la COT `10020263584` se registró el chip ocupado `8951029078500034086`, celular `919863833`, contenedor `ZGRU5333709` y máquina `E0GM015342` |
| 9 | Fabricación | Una orden confirmada, con la COT y los materiales elegidos | En el código y en el menú, sin párrafo de cierre en `sprint_sgit.md`. Suites `prueba.fabricacion`, `prueba.hilos`, `prueba.menu-hilo` |
| 10 | Almacén | Foto de la MO firmada y foto de recepción, o “no fue necesario” | El menú de almacén registra entrega, recepción y la consulta de retiro. La máquina de estados `esperando_almacen` / `materiales_recibidos` del plan no está en `hilo_atencion` |
| 11 | Instalación | Fotos, chip y código bloquean el paso a prueba | Hay registro de fotos, chip y módulo. El paso a prueba no está bloqueado por una máquina de estados porque el conector todavía no existe |
| 12 | Prueba de conexión | Lectura real del equipo, o excepción de administrador | El menú nombra Starcool, Thermoking y Genset. `avisoSenal` responde que la validación no está implementada. No hay suite `prueba.conexion` |
| 13 | Cierre | Usuario, un correo al comercial, un aviso a despacho | No construido. No hay cuenta de plataforma ni suite `prueba.cierre`. La salida de correo que sí existe es una cola genérica para otras aplicaciones |
| 14 | Salud | Tablero y runbook de token, QR, MO y reenvío | Hay estado de Gmail y WhatsApp, reinicio y bitácora. No hay el tablero de revisión, tareas quietas y último error de Odoo que pide el sprint |
| 15 | Respaldo | Restore en limpio y parser afinado con el correo real | Hay exportación e importación por partidas (`prueba.respaldo`) y el parser ya absorbió formas reales de asunto, cita y firma. No hay constancia de un restore hecho delante del área |

## Qué cambió respecto al diseño de agosto

El caso y `docs/05-modelo-de-dominio.md` dibujan una atención con estados `por_iniciar` → materiales → `en_instalacion` → `en_prueba` → `en_plataforma` → `cerrada`. El código tomó otro corte, que es el que opera el equipo:

- La unidad de trabajo de campo es el **hilo** (`hilo_atencion`), con estado `abierto` o `listo`.
- La tarea sigue en `detectada`, `en_seguimiento`, `en_validacion` o `resuelta`. `resuelta` cubre el cierre por regularización, que es una decisión del administrador con nota y foto, distinta del cierre con accesos de plataforma.
- Despacho y almacén sí son usuarios, con su propio menú. El diseño de la primera versión decía que no entrarían a la aplicación.
- El módulo 4G se incorporó al lado del chip. El chip decide si el hilo puede pedir insumos. El módulo no.
- Una telemetría que ya venía instalada se asimila a la orden que ese chip tiene en Odoo, en lugar de abrir otra.
- La campaña (varias tiendas bajo una cotización) tiene cronograma, servicio externo por tienda y prioridad de fechas. Suites `prueba.campana` y `prueba.prioridad`.
- La salida es un servicio aparte: otra aplicación deja WhatsApp o correo y SGIT los envía. No es el reporte de instalación del caso.
- El reloj de Gmail y el de Odoo quedaron en 3 minutos. La cola de despacho quedó en 30 minutos, dentro de la ventana laboral.

## Pruebas que existen

La suite automática no llama a Gmail, WhatsApp ni Odoo reales. Cubre reglas e integraciones con dobles.

| Suite | Proceso |
| --- | --- |
| `prueba.identidad` | Salud de API, PostgreSQL, Redis y archivos, e ingreso |
| `prueba.buzon`, `prueba.rangos` | Sync, adjuntos, historyId y huecos de fechas |
| `prueba.clasificacion`, `prueba.extraccion`, `prueba.cita`, `prueba.seguimiento` | Clase del correo, campos y reprogramación |
| `prueba.tareas` | Una COT, una tarea, y la corrección humana |
| `prueba.bitacora` | Barrido, snooze, feriado y nota con foto |
| `prueba.bot`, `prueba.lectura`, `prueba.menu-hilo` | Avisos, líder único, lectura de despacho y menús |
| `prueba.odoo` | Cero documentos, ambigüedad y copia del pedido |
| `prueba.hilos`, `prueba.lectura-chip`, `prueba.chips`, `prueba.modems`, `prueba.modulo` | Hilos, tarjeta SIM, inventario y etiqueta del módulo |
| `prueba.fabricacion`, `prueba.impresion` | Orden, materiales, PDF e impresora |
| `prueba.salida` | Cola de WhatsApp y correo |
| `prueba.respaldo` | Partidas del buzón |
| `prueba.campana`, `prueba.prioridad` | Tiendas y orden de las citas |

No están las suites que el plan reserva para el cierre: `prueba.conexion`, `prueba.cierre` y `prueba.operacion`.

## Pendiente para cerrar el caso

El circuito del caso, de la COT al acceso del cliente, se corta después de la evidencia de instalación.

1. Contrato y conector de Starcool, Thermoking y Genset. Guardar hora, éxito y extracto, sin tokens en el log. Si la API falla, la instalación se queda en prueba. Un administrador puede autorizar seguir, con motivo.
2. Alta o asignación del usuario de plataforma, cifrada, mostrada una vez, e idempotente por hilo.
3. Reporte de instalación con la línea de tiempo, un solo correo al comercial y un solo WhatsApp a despacho con la COT y el código. Un reenvío queda auditado. La contraseña no entra al chat interno ni a los logs.
4. Estados de la tarea y del hilo que impidan cerrar si falta la prueba, la excepción o el usuario.
5. Tablero de operación: última sync fallida, cola de revisión, tareas `detectada` quietas, sesión del bot y último error de Odoo.
6. Restore probado de PostgreSQL, archivos y sesión del bot, y firma del acta que todavía tiene vacíos los dueños de las API de cierre.

Hasta ese punto, el sistema ya reemplaza la lectura manual del correo, la persecución de despacho, el pedido de materiales y el expediente fotográfico de la instalación. El cierre con accesos sigue siendo un paso humano fuera de SGIT.
