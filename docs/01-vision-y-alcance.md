
# Visión y alcance

## Problema

El área de desarrollo instala telemetría sobre operaciones de alquiler de contenedores reefer. La orden no llega por un formulario: llega dentro de un correo comercial de asignación y despacho, dirigido a varias áreas a la vez.

En un mismo mensaje conviven despacho, SSOMA, ZTRACK, almacén, área técnica y transporte. Desarrollo tiene que:

- reconocer que el correo le compete (bloque ZTRACK, nombres del equipo, palabras como telemetría y accesos a la plataforma);
- rescatar cotización, ticket de ventas, cliente, lugar, fecha, dirección, cantidad de equipos y datos de funcionamiento;
- seguir el hilo, porque las otras áreas reportan avances, reprograman o informan incidentes;
- perseguir a despacho el código y la máquina asignada;
- pedir materiales con una orden de fabricación en Odoo;
- instalar, probar contra la API del equipo, crear o asignar el usuario de la plataforma y devolver accesos al comercial y el código a despacho.

Eso hoy depende de lectura humana, chats sueltos y memoria del equipo.

## Resultado esperado

Una operación donde:

- cada 5 minutos el buzón queda reflejado en SGIT, con HTML, imágenes y adjuntos;
- una cotización abre una sola tarea, y los correos siguientes engrosan su línea de tiempo;
- el equipo de desarrollo recibe el aviso y puede trabajar la tarea desde la web o desde WhatsApp;
- cada unidad de telemetría tiene su atención, sus materiales, sus fotos y su prueba;
- el cierre produce usuario de plataforma, reporte y aviso a quien despacha y a quien vendió.

## Usuarios  

| Quién | Relación con SGIT |
| --- | --- |
| Equipo de desarrollo (3 o 4 personas, entre ellos Eusebio y Luis) | Operan el sistema. Toman tareas, registran avances, incidentes, atenciones y cierre |
| Administrador | Palabras clave, usuarios, ventanas de recordatorio, catálogos |
| Johan (despacho) | Lo consulta el bot por código y máquina. Recibe el aviso cuando la telemetría ya está instalada |
| Comercial que solicita (en el ejemplo, Olinda Lopez) | Origen del correo. Recibe accesos y reporte de instalación |
| Área técnica, almacén, transporte, SSOMA | Aparecen en el hilo. Sus novedades se registran como situaciones o incidentes relatados por desarrollo |

Despacho, técnica y almacén alimentan información. En la primera versión no son usuarios de la aplicación: el equipo de desarrollo transcribe lo que le dicen y adjunta la evidencia.

## Dentro del alcance

- Conexión OAuth a Gmail, carga histórica por rango de fechas y sincronización incremental cada 5 minutos.
- Réplica del mensaje: cuerpo HTML, imágenes inline y archivos.
- Clasificación configurable por palabras y por presencia del bloque ZTRACK.
- Extracción de COT, ticket, cliente, lugar, contenedor, fecha y hora, dirección, temperatura, producto, cantidad de telemetrías y firma del comercial.
- Tarea única por COT, con situaciones de hilo.
- Lectura en Odoo del estado de la cotización (ventas) y del ticket (servicio externo).
- Aviso al equipo y operación por WhatsApp con el cliente ya existente (`whatsapp-web.js`).
- Consulta horaria a despacho entre 08:00 y 18:00, solo para pendientes sin avance.
- Validación con recordatorio a las N horas.
- Incidentes con texto e imagen en cualquier momento.
- Una o varias atenciones de telemetría por tarea.
- Creación de órdenes de fabricación en Odoo, réplica de materiales, impresión, foto de la MO solicitada y foto de la recepción.
- Confirmación de materiales recibidos o de que no fueron necesarios.
- Evidencia de instalación: dispositivo, contenedor, máquina, chip y equipo.
- Prueba contra la API de conexión según modelo.
- Alta o asignación de usuario en la plataforma.
- Cierre con línea de tiempo de incidentes, aviso a despacho y envío de accesos y reporte al comercial.
- Cola de revisión cuando el parser no está seguro.

## Fuera del alcance de la primera versión

- Reemplazar Odoo en ventas, inventario o fabricación. SGIT crea y consulta; Odoo sigue siendo el registro contable y de stock.
- Dar de alta usuarios de aplicación a comercial, despacho, almacén o técnica.
- App móvil nativa. La web debe usarse en el teléfono y el bot cubre el campo.
- Envío masivo o campañas por WhatsApp.
- Interpretar automáticamente, sin confirmación humana, cualquier idioma o formato de correo que no se parezca al patrón “ASIGNAR Y DESPACHAR”.
- Facturación, cobro del alquiler y despacho físico del contenedor. Esas áreas siguen su propio flujo; SGIT solo observa el hilo y notifica el dato que les sirve (código instalado).
- Migrar el bot a la API oficial de Meta. Se documenta como opción futura si el cliente no oficial deja de ser viable.

## Principios de diseño

1. **Una cotización, una tarea.** El hilo informa; no abre otro expediente.
2. **El correo se conserva.** Aunque el parser falle, el mensaje y sus archivos quedan para corrección manual.
3. **La duda no crea tareas fantasma.** Confianza baja va a revisión, no a la bandeja operativa.
4. **Lo ya avanzado no se hostiga.** El recordatorio horario es para pendientes sin movimiento.
5. **Todo incidente queda en la línea de tiempo**, aunque la tarea ya tenga dueño y avance.
6. **Odoo se llama con idempotencia.** Reintentar una MO o un alta de usuario no debe duplicar documentos.
7. **Las credenciales de plataforma son un dato de cierre**, cifradas en reposo, ausentes de logs y entregadas al comercial por el canal definido, con registro de quién las generó.
8. **WhatsApp es un canal operativo**, con sesión persistente y cola de salida. El expediente completo vive en SGIT.

## Criterio de éxito

Sobre un buzón real de un mes:

- los correos con bloque ZTRACK y COT reconocible generan una sola tarea;
- un reply del mismo hilo no genera otra tarea y sí una situación visible;
- el equipo puede llevar una atención de punta a punta, incluida la MO, sin entrar a Odoo para armar la lista de materiales;
- al cerrar, despacho tiene el código y el comercial tiene accesos y reporte;
- un operador nuevo entiende el estado de una operación mirando solo la tarea y su línea de tiempo.

