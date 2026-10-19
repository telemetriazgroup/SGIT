# Flujos operativos

Recorrido con el correo de ejemplo. El fixture está en [`ejemplos/correo-cot-10020263623.md`](ejemplos/correo-cot-10020263623.md).

## 1. Llega la solicitud

1. A las 10:00 el comercial envía “ASIGNAR Y DESPACHAR” con COT `10020263623` y ticket `#2139`.
2. Antes de 5 minutos el sincronizador descarga el mensaje, el HTML y cualquier adjunto.
3. El clasificador ve el bloque ZTRACK, “telemetría” y el pedido de usuario y contraseña. Decisión: `evento_desarrollo`.
4. El extractor llena la ficha:

| Campo | Valor |
| --- | --- |
| COT | 10020263623 |
| Ticket | 2139 |
| Descripción | Alquiler de contenedor reefer 40 RH + servicio de transporte y manipuleo |
| Lugar | MAKRO HUACHO |
| Cliente | MAKRO SUPERMAYORISTA S.A. |
| Contenedor | 01 reefer 40 RH, máquina Magnum Plus MP4000 Thermo King o Starcool |
| Cita | 12/09/2026, 10:00, Av. San Martín 580, Huacho |
| Funcionamiento | −21 °C, congelados |
| Telemetrías | 1 |
| Comercial | Olinda Lopez, comercial4@zgroup.com.pe, +51 981 322 944 |

5. No existe tarea para esa COT: se crea en `detectada`.
6. El bot avisa a los 3 o 4 miembros con ese resumen y el enlace.

Si esa misma mañana llega otro correo con la misma COT, nace una situación en la tarea ya abierta. El equipo no recibe un segundo “tarea nueva”.

## 2. El mismo día, el hilo se mueve

Transporte confirma unidad. Técnica dice que el técnico entra a las 09:30. Alguien reprograma la entrega a las 15:00.

1. Cada reply se anexa por COT o por `threadId`.
2. El cambio de hora crea una situación `reprogramacion`. La cita de las 10:00 queda en el historial; vigente pasan las 15:00.
3. El responsable, si ya tomó la tarea, recibe un aviso de reprogramación. Si nadie la tomó, el cambio se ve en la ficha y en el siguiente resumen horario, que ahora muestra la hora nueva.

## 3. Perseguir el equipo asignado

La tarea sigue en `detectada`. Entre 08:00 y 18:00 el bot pregunta a Johan, como máximo una vez por hora, cuál es el código y la máquina.

Un miembro habla con él y registra:

> Johan, responsable de despachos, dice que no hay equipo asignado.

Adjunta la captura. La tarea pasa a `en_seguimiento` y **deja de entrar** al recordatorio de cada hora.

Más tarde, desde el menú de incidentes, otro miembro elige la misma tarea y anota que el equipo apareció y que la máquina estuvo en reparación según Angie, con foto. Eso no reactiva el barrido horario.

Si necesitan esperar, marcan validación y “recuérdame en 4 horas”. A esa hora el bot vuelve a mostrar la tarea.

## 4. Atender la telemetría

El técnico abre Telemetrías y confirma el número. Una telemetría abre un hilo y tres abren tres. En cada hilo valida lo que mandó despacho y dice si se instala. Si se instala, almacén manda la foto del chip. El hilo queda listo cuando despacho está validado y, si instala, el chip está disponible. Un chip ocupado no entra.

Cuando el hilo está listo, la orden de fabricación pide materiales:

1. Elige la lista de instalación y deja transformador, cable, kit y enchufe según lo que realmente va a pedir (el correo de almacén describe el despacho del contenedor; la MO de telemetría es la lista de **esta** instalación, no una copia ciega de ese párrafo).
2. SGIT crea la fabricación en Odoo y abre el PDF.
3. Imprime, firma y sube la foto de la MO.
4. Almacén demora: incidente con foto. La atención sigue en espera.
5. Cuando recibe, sube la foto de recepción y confirma “materiales recibidos”.

Si la instalación no lleva materiales, confirma “no fue necesario” y salta al mismo punto de instalación.

## 5. Instalar y probar

En campo registra:

- foto del dispositivo ya instalado;
- contenedor;
- máquina;
- chip asignado;
- código de equipo.

Pasa a prueba. El modelo (Magnum Plus o Starcool, el que finalmente quedó) elige el conector. La API devuelve la lectura y queda guardada como constancia de que el equipo reporta.

## 6. Usuario y cierre

1. Genera un usuario nuevo o asigna uno existente para Makro Huacho.
2. La atención queda cerrada.
3. Como era la única, la tarea pasa a `lista_para_cierre`.
4. El operador confirma.
5. Despacho recibe: COT `10020263623`, telemetría instalada, código para que lo asigne y despache con el equipo.
6. Olinda recibe el reporte (cliente, lugar, cita, temperatura, contenedor, código, chip, fotos de prueba, línea de tiempo de incidentes) y los accesos a la plataforma.
7. La tarea queda `cerrada`. La línea de tiempo sigue siendo consultable.

## 7. Lo que el operador ve en la ficha

Una pantalla, de arriba hacia abajo:

- identidad: COT, ticket, cliente, lugar, estado, responsable;
- cita vigente y, si hubo cambio, la anterior;
- vínculo Odoo: estado de la venta y del ticket, o “sin vínculo / ambiguo”;
- cantidad de telemetrías y tarjetas de cada atención con su paso actual;
- línea de tiempo única;
- correos del hilo, abiertos como réplica, con sus imágenes;
- acciones según estado: tomar, anotar, incidente, validar, atender, cerrar.

## 8. Casos que no deben romper el flujo

| Situación | Comportamiento |
| --- | --- |
| El parser no lee la hora | Tarea creada, cita incompleta, visible en la ficha para completarla. No bloquea el aviso |
| No hay COT | Cola de revisión. Cero avisos al equipo |
| Odoo caído al abrir la ficha | Se ve el último estado leído y la fecha de esa lectura |
| WhatsApp caído | La web sigue. Los avisos esperan en la cola |
| Dos personas toman la tarea | La primera escritura gana el responsable; la segunda ve quién ya la tiene y puede sumar notas igual |
| Llega un correo de la COT una semana después del cierre | Situación nueva en la tarea cerrada. Reabrir es decisión de un administrador |
