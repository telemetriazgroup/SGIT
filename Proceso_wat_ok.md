# WhatsApp — atención de una cotización

Este es el flujo que usa quien atiende la cotización desde WhatsApp. El administrador y el superusuario ven el menú ampliado. El técnico ve el mismo recorrido de telemetrías, sin el cierre por regularización. Despacho y almacén no entran a este menú: reciben el pedido y responden por el suyo.

Escribir `menu` en cualquier punto vuelve al menú anterior.

## Menú general

Administrador y superusuario:

1. Tareas recientes
2. Asuntos internos
3. Pendientes de decisión
4. Buscar cotización
5. Salir

Técnico:

1. Tareas recientes
2. Buscar cotización
3. Salir

También se puede escribir el número de COT o el nombre del cliente.

## Cotización

1. Datos de la cotización
2. Registrar seguimiento
3. Registrar incidente
4. Último seguimiento
5. Último incidente
6. Resumen de registros
7. Cerrar por regularización, solo administrador o superusuario
8. Telemetrías. En el técnico esta opción es la 7
9. Volver al menú anterior. En el técnico es la 8

El chip y la respuesta de despacho no están en este menú. Se piden dentro del hilo.

## Telemetrías

Si la cotización no tiene hilos, se escribe cuántas telemetrías son. Un número abre esa cantidad de hilos, de 1 a 20.

Al abrirlos, la cotización entra a la cola de despacho. No sale un mensaje en ese momento. El ciclo de despacho, cada 30 minutos, pide el contenedor y la máquina. Si hay más de un hilo sin ese dato, el mensaje dice cuántos hilos están pendientes. Se pueden abrir hilos de otras cotizaciones y cada una queda en la misma cola.

## Hilo

1. Área despacho
2. Área almacén
3. Esta telemetría no se instala
4. Ya tiene telemetría. Regularizar o validar la instalación
5. Orden de fabricación / instalación
6. Volver al menú anterior

Si el contenedor y la máquina ya están, no se pide el texto de despacho ni se muestra que falta. Si el hilo está listo, el mensaje dice que ya tiene lo necesario.

### No se instala

Hay que decir por qué:

1. La máquina es Carrier o Daikin
2. Control interno. Se priorizan los pedidos regulares
3. No hay stock de telemetría o de chip

También se puede escribir otra razón. Queda en el seguimiento del hilo.

### Ya tiene telemetría

Sirve cuando, al recibir el contenedor y la máquina, el equipo ya trae la telemetría instalada. Se asimila la orden de fabricación que ese chip ya tiene en Odoo.

1. Regularizar el chip. IMEI o foto
2. Regularizar el módulo 4G. IMEI o foto
3. Asimilar orden de fabricación. Compara el número del chip del hilo con el de esa orden. Si coinciden, deja en las notas de Odoo la aprobación: equipo y cotización. Si no coinciden, no escribe nada
4. Registrar imágenes de la instalación / validación
5. Validar conexión Starcool. Pendiente
6. Validar conexión Thermoking. Pendiente
7. Validar conexión Genset. Pendiente
8. Volver al hilo

## Área despacho

1. Validar lo que envió despacho
2. Pedir ahora el contenedor y la máquina. Esta sí sale en el momento y no espera el ciclo de 30 minutos. El texto dice cuántos hilos siguen pendientes
3. Regularizar el contenedor. Texto o foto
4. Regularizar la máquina. Texto o foto
5. Ver los últimos registros de despacho. Muestra hora, texto y la imagen más reciente
6. Volver al hilo

## Área almacén

1. Ver lo que envió despacho. Muestra hora, texto y la imagen más reciente
2. Pedir chip a almacén. Con eso queda que esta telemetría se instala
3. Pedir módulo 4G
4. Regularizar el chip. IMEI o foto. Si el chip está ocupado, queda registrado y no entra a fabricación
5. Regularizar el módulo 4G. Se busca por el SN, el que empieza por 0050 y está en M2M. La foto de la etiqueta ZTRACK-V2 lee el SN y el IMEI. El IMEI queda para validar la señal. Si hay más de un SN, se elige de la lista
6. Registrar entrega de solicitud a almacén. Pide la foto de la solicitud firmada y, si hace falta, un comentario
7. Registrar recepción de insumos de almacén. Recibe las fotos, varias juntas, y un comentario si lo escriben
8. Ver estado de solicitud de insumos en almacén. Pregunta por chat a almacén si los insumos de esa orden ya están listos para retirar. Almacén responde 1 si ya está listo, o 2 si falta. La respuesta le llega al técnico
9. Volver al hilo

El módulo 4G no decide si el hilo puede pedir insumos. El chip sí.

Almacén puede mandar varias fotos juntas del chip o del módulo 4G. Recibe solo “Imagen procesada.” El técnico recibe todas esas fotos y el resultado.

Cuando el técnico consulta el retiro, almacén recibe la orden y responde 1 si ya está listo, o 2 si falta. Puede escribir qué falta después del 2. Esa respuesta le llega al técnico.

## Lectura de las fotos de despacho

Despacho puede mandar varias fotos juntas del contenedor y de la máquina. Quedan todas en la ficha. El técnico recibe la cotización, las imágenes y lo que se leyó. Desde ese mensaje:

- `ok` valida las lecturas, las copia al hilo de ese equipo y sigue en el hilo. El contenedor y la máquina dejan de vivir solo en la cotización.
- El número de una imagen abre la corrección. `0` sale de esa corrección sin cambiar el código.
- `procesar` vuelve a leer las imágenes que todavía no tienen código.
- `menu` vuelve a la cotización.

## Insumos

La opción 5 del hilo abre el menú de la orden. Pedir el insumo crea la orden cuando el hilo está listo: despacho validado y, si se instala, chip disponible. Si la orden ya existe, se muestran la orden y los insumos marcados. Agregar o modificar insumos solo sigue abierto mientras la orden está en borrador. Si ya no lo está, la respuesta va en negrita y se vuelve al menú. Confirmar muestra los insumos y pide un sí. Al confirmar, los componentes pedidos quedan como consumidos. No se pulsa Producir todo. Después se manda el PDF y se vuelve al menú. El PDF también se pide aparte, y solo si la orden ya está confirmada. La primera vez se baja de Odoo y queda guardado. Si los insumos consumidos no cambiaron, las siguientes veces se manda ese archivo y no se vuelve a pedir a Odoo. Imprimir el PDF todavía no está implementado.

El enlace deja marcar materiales. Al guardar, el chip queda en Lote/Serie de su componente. Odoo recibe dos notas, cada dato en su línea: una con contenedor, máquina, chip e IMEI, y otra con los datos de la cotización y lo que se pide. Lo que no se marcó no entra en esas notas. Eso queda antes de confirmar, para que Odoo no tome otro chip. Lo que se desmarca sale de la lista y no queda en la reserva.

El reporte de instalación solo se abre con la orden confirmada.

1. Registrar imágenes de la instalación. Se reciben todas las fotos del envío. Si no hay texto, se esperan 15 segundos por más fotos o por un ok, y se vuelve al menú
2. Agregar comentario
3. Validar conexión Starcool. Pendiente
4. Validar conexión Thermoking. Pendiente
5. Validar conexión Genset. Pendiente
6. Módulo 4G. IMEI de la instalación. Con 4 dígitos o más se muestran hasta 8 series, cada una como DISPONIBLE u OCUPADO. El número elegido queda en el hilo. El mismo módulo se puede ligar desde almacén
7. Volver al menú de la orden

Si el hilo ya tiene módulo 4G, el menú lo muestra y la opción 6 lo cambia.
