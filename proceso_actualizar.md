# Proceso para cerrar el caso sobre el sistema actual

Validación de [caso_sgit.md](caso_sgit.md) contra el SGIT que ya está en uso (4 de noviembre de 2026). El caso es el recorrido completo: el correo de Gmail se vuelve una sola tarea por cotización, el equipo la trabaja por WhatsApp o por la web, se fabrica en Odoo, se instala, se prueba la máquina, se genera el usuario de la plataforma y se avisa a despacho y al comercial.

Ese recorrido ya está construido hasta la fabricación y la evidencia de instalación. Lo que el caso todavía pide, y el sistema no hace, es la prueba contra la API de la máquina, el usuario de la plataforma y el aviso de cierre. Esta nota dice cómo se puede agregar eso sin rehacer lo que ya opera.

## Lo que el caso ya cubre y no se toca

| Tramo del caso | Dónde está hoy |
| --- | --- |
| Bajar el buzón con imágenes y adjuntos, y seguir sincronizando | Gmail, cada 3 minutos. El caso decía 5. El intervalo actual es más corto y se mantiene. |
| Marcar el correo del área por palabras (telemetría, Eusebio, Luis, usuario y contraseña, acceso a la plataforma) | Diccionario y clasificador. El ejemplo de la COT `10020263623` entra como tarea. |
| Leer COT, ticket, cliente, lugar, cita, temperatura, cantidad y comercial | Extractor del asunto y del cuerpo. Hay menú para reprocesar fechas de todo el buzón o de un hilo, sin pisar una cita corregida a mano. |
| Un solo ingreso por cotización; el resto del hilo es avance, reprogramación o incidente | La tarea se ancla a la COT. Un correo nuevo de la misma cotización suma situación, no otra tarea. |
| Avisar al equipo y dejar que anoten seguimiento, incidente, foto y “recuérdame en 4 horas” | Bot de WhatsApp y la misma bitácora en la web. Con avance, la tarea sale del recordatorio de cada hora (08:00 a 18:00). |
| Atender N telemetrías y crear una fabricación por cada una | Un hilo por telemetría. La orden de Odoo es el producto `GPNDND0002`, con chip `INDND4855` y módem `INDND7509`. Se eligen cantidades, se imprime el PDF, se guarda la foto y se confirma si el material llegó o no hizo falta. |
| Fotos de instalación, contenedor, máquina, chip y módulo | Menús de despacho, almacén e instalación en cada hilo, en WhatsApp y en la web. |
| Chips y módems disponibles para esa instalación | Copia local de Odoo (datos e imágenes). Abrir un número no consulta Odoo. La nota y el estado local del número no los pisa la sincronización. |

También hay piezas que el caso no pedía y que este cierre no debe desarmar: campaña (varias tiendas, cada una con sus hilos), virtualización del superusuario, y la regla de visibilidad. El administrador ve las tareas habilitadas y las que no, y puede habilitarlas. Técnico, despacho y el bot solo ven las habilitadas.

La tabla de cuentas al final de `caso_sgit.md` quedó corta. No se vuelve a ese recorte: el administrador habilita tareas, el técnico atiende el hilo, y despacho y almacén siguen en su parte.

## Lo que el caso pide y hoy se detiene

El caso, al final, encadena tres pasos después de la instalación:

1. Según el modelo de máquina (Magnum Plus / Thermo King, Starcool, o el que haya quedado), consultar la API de conexión y guardar la lectura como constancia.
2. En la plataforma, crear un usuario y contraseña, o asignar el contenedor a una cuenta que ya existe.
3. Cerrar la tarea y avisar: a despacho, que la telemetría ya está y con qué código; al comercial, los accesos y el reporte con fotos e incidentes.

Hoy el paso 1 tiene menú y no tiene conector. En el hilo, “Validar conexión Starcool”, “Thermoking” o “Genset” exige el IMEI del módulo 4G y, si falta, no deja seguir. Si el IMEI está, no llama a ninguna API: escribe en la bitácora que la validación todavía no está implementada y que usará ese IMEI. El SN, si existe, queda en la misma nota.

Los pasos 2 y 3 no existen como tal. Cerrar una tarea pide un motivo, cancela los recordatorios y la deja resuelta. No exige la lectura de la máquina, no crea usuario, no arma el reporte y no escribe al comercial ni a despacho. El comercial sí queda guardado en la ficha (nombre, cargo, correo, teléfono) cuando el extractor lo lee.

## Cómo se implementa, en el orden del caso

El punto de enganche ya está: `pedirSenal` en la atención del hilo, disparado desde la web y desde el bot. No hace falta otro menú. Cuando exista el conector, esa misma acción deja de limitarse a anotar el pendiente y pasa a consultar y guardar la lectura.

### 1. Prueba de la máquina

Condición de entrada, ya exigida: IMEI del módulo en el hilo. El SN y el modelo elegido (Starcool, Thermoking, Genset) viajan junto con el IMEI. El texto del correo (Magnum Plus MP4000 o Starcool) es una pista, no la decisión: manda el modelo que el técnico elige al validar, porque el caso dice que se prueba la máquina que finalmente quedó.

Cada familia es un conector aparte. El primero que tenga especificación se enciende; los otros siguen dejando la nota de pendiente. Una lectura buena se guarda como nota del hilo (hora, modelo, IMEI, resultado), igual que el resto del seguimiento, para que entre en la línea de tiempo del reporte. Una lectura mala no cierra el hilo ni borra las fotos: queda como incidente y se puede volver a pedir.

Sin la especificación de esa API no se inventa el conector. El menú actual es el lugar correcto para esperar.

### 2. Usuario de la plataforma

Va después de una lectura guardada, o de una excepción explícita de administrador cuando la API de la máquina no existe todavía. Dos caminos, como dice el caso: alta nueva, o asignar a una cuenta ya existente. Las dos tienen que poder repetirse sin crear un segundo usuario (un doble clic, un reintento de WhatsApp).

La contraseña se guarda cifrada y no se escribe en la bitácora ni en el log. El reporte y el correo al comercial son el único lugar donde sale, porque el caso lo pide así. Reenviar es una acción aparte, no un efecto de volver a abrir la tarea.

### 3. Cierre y avisos

El cierre del caso no reemplaza el cierre por motivo que ya existe. Quedan dos salidas:

- Cierre del caso: todas las telemetrías de la tarea tienen evidencia, lectura (o la excepción) y usuario. Recién ahí se arma el reporte (cliente, lugar, cita, temperatura, contenedor, código, chip, fotos de prueba, incidentes) y se envía una sola vez al correo del comercial. A despacho se le avisa, por el mismo canal que ya se usa para almacén, que esa COT ya tiene la telemetría instalada y el código para asignarla.
- Cierre por regularización: el que ya está (motivo escrito, tarea resuelta). No genera usuario ni correo, para no mandar accesos falsos de una tarea que se cerró sin prueba.

Si más tarde llega otro correo de esa COT, se anexa a la tarea cerrada, como ya ocurre. Reabrir no reenvía el reporte.

## Implicancia en el proceso

El trabajo diario hasta “materiales recibidos” e “instalación fotografiada” no cambia. Chips, M2M, campaña, habilitar tareas y el buzón siguen igual.

Cambia el tramo final de cada hilo:

- El técnico no da por probada una Starcool, Thermoking o Genset solo con la nota actual. Esa nota significa “pedido registrado, conector pendiente”. Cuando el conector exista, la misma opción pasa a ser la constancia.
- No se cierra “como el caso” una tarea a la que le falte la lectura o el usuario. Se puede cerrar por regularización, y eso se distingue del cierre con accesos.
- Despacho deja de enterarse solo porque alguien se lo escribe en el chat. El cierre del caso le manda el código. Hasta que eso exista, el aviso sigue siendo manual.
- El comercial deja de recibir los accesos por fuera del sistema. El correo sale de la ficha, al `comercial_correo` ya extraído. Si ese campo está vacío o mal leído, el envío se detiene y se corrige la ficha; no se adivina el destinatario.
- Una campaña cierra cuando sus tiendas están realizadas, como ahora. El usuario y el reporte son por la telemetría de cada tienda, no un solo usuario para toda la campaña.

La orden de fabricación que ya se crea (`GPNDND0002` y su lista de materiales) no sirve para el otro caso de Odoo, el de transformar una telemetría vieja en CTRACK reefer Orbcomm y luego en CTRACK disponible. Ese caso está en [casos_uso_odoo.md](casos_uso_odoo.md) y aquí no se implementa: usa otros productos y otra lista, y meterlo en esta orden rompería la fabricación de instalación.
