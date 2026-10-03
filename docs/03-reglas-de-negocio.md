# Reglas de negocio

Las reglas siguientes son normativas para implementación y pruebas. Si un correo real las rompe, se ajusta el diccionario o se manda el caso a revisión; no se abre una segunda tarea “por las dudas”.

## Identidad de la operación

| Id | Regla |
| --- | --- |
| RN-01 | La clave de negocio de una tarea es la COT normalizada: se conservan solo los dígitos. `COT 10020263623` y `cot10020263623` son la misma tarea |
| RN-02 | Existe como máximo una tarea abierta por COT. Cerrada sigue siendo la misma ficha si llega un correo tardío: se anexa y se evalúa reapertura, no se crea otra |
| RN-03 | Si el mensaje trae COT y ya hay tarea, se anexa aunque el `threadId` de Gmail sea distinto (reenvíos) |
| RN-04 | Si no trae COT y el `threadId` ya está ligado a una tarea, se anexa a esa tarea |
| RN-05 | Si no hay COT ni hilo conocido, el mensaje no crea tarea automática |
| RN-06 | El ticket de ventas (`#2139`) se guarda y se usa para buscar en Odoo. No sustituye a la COT como clave |
| RN-07 | Dos COT en el mismo asunto se mandan a revisión humana |

## Clasificación

| Id | Regla |
| --- | --- |
| RN-10 | El bloque ZTRACK es la señal principal de que el correo convoca a desarrollo |
| RN-11 | El diccionario inicial incluye, como mínimo: `eusebio`, `luis`, `telemetria`, `ztrack`, `usuario y contraseña`, `acceso a la plataforma`. El administrador puede sumar o quitar términos sin desplegar código |
| RN-12 | Los nombres del diccionario identifican involucramiento. No se usan como única prueba si el resto del correo es ajeno a telemetría: eso cae en `revisar` |
| RN-13 | Comparación sin distinguir mayúsculas ni tildes |
| RN-14 | Un correo `ajeno` permanece almacenado y no genera aviso |
| RN-15 | Solo el nacimiento de la tarea avisa al equipo. Un anexo avisa si hay reprogramación o incidente; el resto queda en la ficha |

## Extracción

| Id | Regla |
| --- | --- |
| RN-20 | Del asunto se leen, cuando el patrón se cumple: acción, COT, ticket, descripción del servicio, lugar y cliente |
| RN-21 | Lugar y cliente se toman de los dos últimos segmentos separados por ` - ` en el tramo final del asunto. En el ejemplo: lugar `MAKRO HUACHO`, cliente `MAKRO SUPERMAYORISTA S.A.` |
| RN-22 | La cantidad de telemetrías sale del bloque ZTRACK (`1 und de telemetría`). Si no se puede leer, la tarea nace con cantidad nula y el operador la completa antes de abrir atenciones |
| RN-23 | Fecha, hora, dirección y enlace de mapa salen de “FECHA Y HORA DE ENTREGA – CLIENTE”. La ocurrencia con dirección pisa a la que solo tiene fecha y hora, y ambas quedan citadas |
| RN-24 | Temperatura y producto son opcionales. Su ausencia no bloquea la tarea |
| RN-25 | La firma esperada trae nombre, cargo, correo `@zgroup.com.pe` y teléfono. Si el patrón no cierra, el comercial queda parcial y se puede editar |
| RN-26 | Cada campo extraído guarda el fragmento de origen. La edición humana marca el campo como `corregido` y no lo pisa una sync posterior, salvo que el operador pulse “volver a leer este campo” |
| RN-27 | Fechas del correo se interpretan como `dd/mm/aaaa` en `America/Lima` |

## Hilo y situaciones

| Id | Regla |
| --- | --- |
| RN-30 | Cada mensaje nuevo vinculado a la tarea crea una situación en la línea de tiempo |
| RN-31 | Si la fecha, la hora o la dirección cambian respecto de la cita vigente, la situación es `reprogramacion`, la cita anterior pasa al historial y la nueva queda vigente |
| RN-32 | El texto de otras áreas (despacho, técnica, almacén, transporte, SSOMA) se conserva entero en la situación. El resumen automático es una ayuda, no reemplaza el mensaje |
| RN-33 | Una reprogramación no borra atenciones, fotos ni MO. Si la instalación ya empezó, la tarea muestra conflicto de agenda para que el responsable decida |

## Recordatorios y WhatsApp

| Id | Regla |
| --- | --- |
| RN-40 | La consulta automática a despacho y el barrido de pendientes corren de 08:00 a 18:00, hora Lima, en el calendario laborable configurado |
| RN-41 | Como máximo un recordatorio horario por tarea en esa ventana |
| RN-42 | Entra al barrido la tarea pendiente que desarrollo todavía no movió: sin seguimiento de avance y sin snooze vigente |
| RN-43 | El primer seguimiento de avance saca la tarea del barrido horario |
| RN-44 | “En validación, recuérdame en N horas” crea un snooze. Al vencer, se recuerda esa tarea aunque tenga avance. N es un entero de horas definido por el operador |
| RN-45 | Registrar un incidente no mete la tarea de nuevo al barrido horario |
| RN-46 | El incidente se puede abrir desde el menú aunque la tarea tenga dueño, avance o atenciones |
| RN-47 | Los salientes de WhatsApp van por cola, con separación entre envíos. No hay difusión masiva a contactos fuera del equipo, despacho y los avisos de cierre ya definidos |
| RN-48 | Un código o máquina propuesto por el chat de despacho queda en borrador hasta que un miembro del equipo lo confirma |

## Atenciones y materiales

| Id | Regla |
| --- | --- |
| RN-50 | Una tarea tiene cero o más atenciones, una por unidad de telemetría que el equipo decide instalar |
| RN-51 | La cantidad leída en ZTRACK es la propuesta inicial, no un tope rígido. Cambiarla exige un motivo en la bitácora |
| RN-52 | Cada atención puede tener cero o una MO activa. Una segunda MO exige anular o cerrar la anterior, para no pedir dos veces el mismo kit por descuido |
| RN-53 | “Materiales no necesarios” es un cierre válido del tramo de almacén y queda justificado en la bitácora |
| RN-54 | No se pasa a instalación sin una de estas dos confirmaciones: materiales recibidos, o no necesarios |
| RN-55 | Falta de stock o demora de almacén es un incidente con foto opcional. No cierra la atención por sí solo |
| RN-56 | La foto de la MO firmada es obligatoria si hubo MO. La foto de recepción es obligatoria si se declararon materiales recibidos |
| RN-57 | La lista de materiales que ve el operador es la réplica de la lista Odoo elegida, con las cantidades que él confirme. Esas cantidades son las que viajan al crear la fabricación |

## Instalación, prueba y cierre

| Id | Regla |
| --- | --- |
| RN-60 | La evidencia mínima de instalación es: foto del dispositivo instalado, identificación de contenedor, máquina, chip y código de equipo |
| RN-61 | La prueba llama a la API que corresponda al modelo de máquina y guarda la respuesta cruda y el resumen legible |
| RN-62 | Sin prueba exitosa registrada, la atención no se cierra. Una excepción la autoriza un administrador y queda auditada |
| RN-63 | El cierre de plataforma es uno de los dos: usuario nuevo generado por la API, o cuenta existente asignada. En ambos casos se guarda el identificador de cuenta |
| RN-64 | La contraseña se muestra en el momento de generarla y se entrega en el reporte al comercial. En base queda cifrada. No se escribe en logs ni en la bitácora en claro |
| RN-65 | La tarea se cierra cuando todas sus atenciones están `cerrada` o `cancelada` con motivo, y el operador confirma el cierre |
| RN-66 | Al cerrar se notifica a despacho el código instalado y al comercial los accesos más el reporte |
| RN-67 | Cancelar una atención no cancela la tarea si queda otra atención abierta |
| RN-68 | Reabrir una tarea cerrada es una acción de administrador, conserva el historial y no reenvía accesos hasta un nuevo cierre explícito |

## Odoo

| Id | Regla |
| --- | --- |
| RN-70 | El estado comercial que se muestra en la tarea se lee de Odoo. SGIT no lo inventa ni lo pisa |
| RN-71 | Crear una MO usa una clave de idempotencia por atención. El reintento devuelve el mismo documento |
| RN-72 | Si Odoo rechaza la MO (stock, permiso, dato), la atención permanece en solicitud de materiales y el error queda visible, con incidente opcional |

## Edición y auditoría

| Id | Regla |
| --- | --- |
| RN-80 | Seguimientos, incidentes y cambios de estado guardan autor, canal y fecha. No se borran; se pueden anular con una nota posterior |
| RN-81 | Correos y archivos importados son inmutables. Lo editable es la interpretación (campos de la tarea) |
| RN-82 | Quién generó un usuario de plataforma, quién cerró y quién reenvió el reporte queda en auditoría |
