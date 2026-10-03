# Acta de descubrimientos — sprint 0

Estado: **pendiente de firma**. Este documento no cierra el sprint hasta que el área de desarrollo complete los campos y firme. No se adelantan nombres de modelos de Odoo ni dueños de API.

Sirve para que el sprint 1 (Gmail) y los sprints 7 a 13 (Odoo, prueba de equipo y plataforma) no arranquen contra un supuesto.

## Buzón

SGIT tiene que ver el mismo hilo que hoy lee el área a mano. En el caso de Makro Huacho, Olinda Lopez (`comercial4@zgroup.com.pe`) envía:

`ASIGNAR Y DESPACHAR // COT 10020263623 // TICKET DE VENTAS #2139 // … MAKRO HUACHO - MAKRO SUPERMAYORISTA S.A.`

Ese mensaje, y las respuestas de despacho, técnica, almacén y transporte, tienen que aparecer en SGIT en menos de 5 minutos, con imágenes y adjuntos. De ahí sale una sola tarea para la COT `10020263623`. Lo que se sincroniza es la casilla **que recibe** ese correo, no la bandeja de enviados de la comercial.

| Decisión | Qué queremos lograr | Ejemplo con este caso | Respuesta del área |
| --- | --- | --- | --- |
| Casilla de producción | La cuenta Gmail donde cae el “ASIGNAR Y DESPACHAR” y donde las otras áreas contestan en el mismo hilo | Si el correo de Olinda llega a `desarrollo@zgroup.com.pe`, esa es la casilla. No es `comercial4@zgroup.com.pe`: esa solo envía | `telemetria@zgroup.com.pe` |
| Compartida o personal | Una casilla del área, para que la sync no se caiga si una persona cambia de teléfono o de puesto. La operan Eusebio, Luis y el resto del equipo (3 o 4 personas) | Si hoy el correo llega al Gmail personal de Eusebio, el objetivo sigue siendo una casilla compartida. La personal solo serviría de puente mientras se crea la del área | La utiliza el área |
| Casilla de pruebas | Otra cuenta, o la misma con una etiqueta `sgit-pruebas`, autorizada solo para leer. Ahí se reenvía una copia del correo real y se comprueba que nace una sola tarea | Reenviar a la casilla de pruebas el mensaje de la COT `10020263623` (Makro Huacho, 12/09/2026, 1 telemetría, −21 °C). Un segundo reenvío del mismo hilo no abre otra tarea | La misma cuenta, `telemetria@zgroup.com.pe` |
| Dueño del consentimiento OAuth | La persona que administra esa cuenta de Google y puede pulsar “permitir lectura”. SGIT guarda el permiso; no guarda la contraseña de Gmail | Quien sea dueño de la casilla de pruebas acepta el acceso de lectura. En producción lo acepta quien administre la casilla del área. Si el token caduca, esa misma persona vuelve a autorizar | Luis, administrador de `telemetria@zgroup.com.pe` |
| Histórico del piloto | Un rango corto de fechas, no todo el archivo del buzón. El rango tiene que incluir el correo de ejemplo y los replies de esa COT | Septiembre 2026, o los 30 días alrededor del 12/09/2026. Entran el mensaje de Olinda y, si en ese mes despacho reprogramó la entrega de las 10:00, también ese reply, colgado de la misma tarea | 30 días |

Al usar la misma cuenta para pruebas y producción, el piloto solo lee esos 30 días. No envía correo desde esa casilla hasta el cierre de la instalación.

## Odoo staging

En la ficha de la COT `10020263623` el área ve, sin entrar a Odoo, si la venta de Makro Huacho sigue vigente y en qué va el ticket `#2139`. Cuando atienden la telemetría, desde SGIT crean una sola orden de fabricación para pedir los materiales de esa instalación. La escritura de prueba ocurre solo en staging.

Estado de esta sección: **reglas de negocio cerradas**. Falta leer en esa base los nombres técnicos de modelo y de campo. Esos nombres no se inventan aquí; se anotan en la tabla de abajo al conectar con `sgit.tecnico`.

| Decisión | Qué quedó decidido |
| --- | --- |
| URL de staging | `https://zgroup-staging-desarrollo-2026-38295866.dev.odoo.com`. Ahí se busca la COT y se crea la MO de laboratorio. En producción no se crea nada hasta que el cierre de laboratorio esté firmado |
| Usuario técnico | `sgit.tecnico`. Lee ventas, Soporte al cliente y Servicio externo, y crea fabricaciones de telemetría. No administra usuarios ni borra pedidos. La contraseña no va en esta acta: va al almacén de secretos. El usuario tiene que existir en esa base antes del sprint 7 |
| Cotización | Es el pedido de venta de la operación. La ficha muestra su estado. La búsqueda usa el número `10020263623`, en el nombre del pedido o en la referencia del cliente. No se busca por “MAKRO HUACHO”. Si hay cero o más de un documento, no se elige solo: el operador vincula a mano |
| Ticket y tarea | Al enviar el correo, el ticket ya existe en **Soporte al cliente** y se consulta por el `#2139` del asunto. Desde ese ticket se crea una tarea en **Servicio externo**. La ficha muestra los dos, con la fecha de lectura. El número del ticket se trata como identificador único. Si aun así aparecen dos, el operador elige; SGIT no se queda con el primero |
| Orden de fabricación | Una atención crea una fabricación. Un segundo clic devuelve la misma orden |
| Lista de materiales | El operador elige la lista de la telemetría y ajusta cantidades. Esas cantidades son las que viajan a Odoo. El párrafo de almacén del correo (transformador, cable, kit, enchufe) no se copia solo |
| Estado de la MO | Nace en borrador al crearla. Pasa a confirmada cuando el operador ya seleccionó los materiales de esa lista. La foto de la orden firmada sigue siendo obligatoria antes de esperar la recepción de almacén |

### Lo que falta anotar en staging

Sin esta tabla el sprint 7 no puede programar la búsqueda. Se llena mirando el pedido de la COT `10020263623` y el ticket `#2139` en la URL de arriba.

| Qué mirar | Nombre técnico en esa base |
| --- | --- |
| Modelo del pedido de venta | |
| Campo donde está `10020263623` (nombre del pedido o referencia del cliente) | |
| Modelo del ticket en Soporte al cliente | |
| Campo donde está el `#2139` del correo. Tiene que ser el número que ve el comercial, no un id interno distinto | |
| Modelo de la tarea en Servicio externo | |
| Campo que une esa tarea con el ticket de Soporte al cliente | |
| Modelo de la orden de fabricación | |
| Modelo de la lista de materiales | |

## APIs de cierre

| API | Dueño que entrega el contrato | Familia que entra primero |
| --- | --- | --- |
| Conexión del equipo | | |
| Usuarios de la plataforma | | |

El alta de usuario de plataforma la hace siempre SGIT, o a veces solo se asigna una cuenta que ya existe: a vces 

## Cierre hacia el comercial

El reporte y los accesos salen solo por correo, o también por otro canal:

## WhatsApp de laboratorio

| Pregunta | Respuesta |
| --- | --- |
| Número que escanea el QR del bot | |
| Teléfono de cada miembro del equipo que operará SGIT | |

## Calendario del barrido

Propuesta, para confirmar o corregir: días laborables de lunes a viernes, zona `America/Lima`, ventana 08:00 a 18:00. Sábado y domingo no corren el recordatorio.

Feriados que el barrido debe saltar:

| Fecha | Motivo |
| --- | --- |
| | |
| | |
| | |
| | |

## Firmas

| Rol | Nombre | Fecha |
| --- | --- | --- |
| Área de desarrollo | | |
| Quien implementa SGIT | | |

Con la firma, las respuestas de esta acta pasan a ser la referencia de los sprints 1, 7, 12 y 13.
