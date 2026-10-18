# Proceso de WhatsApp del técnico

Recorrido del técnico habilitado para consultar una cotización y registrar seguimiento o incidente. El técnico no corrige la ficha, no toma la tarea y no opera el buzón. Solo lee y anota.

Cada respuesta del bot espera **2 segundos** desde que llega el mensaje. Así el chat se parece a una persona y no dispara varios envíos seguidos. Si en esos 2 segundos llega otro mensaje, se contesta solo el último. Los avisos que el sistema empuja solo (tarea nueva, reprogramación) siguen saliendo de uno en uno, con una pausa de 5 segundos entre cada número.

Hay dos lugares. El técnico siempre sabe en cuál está.

| Lugar | Qué significa |
| --- | --- |
| Menú general | No hay cotización abierta. Sirve para elegir o buscar otra. |
| Dentro de una COT | Todo lo que se escribe es de esa cotización, hasta que el técnico vuelva al menú general. |

Dentro de una COT, cada mensaje del bot abre con la misma referencia:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
```

Al volver, el bot lo dice en claro y muestra el menú general. No queda una cotización a medias.

## 1. Menú general

El técnico escribe lo que sea (`hola`, `menú`) y, a los 2 segundos, recibe:

```text
Menú general. No hay una cotización abierta.
1. Tareas recientes
2. Buscar cotización
3. Salir
Escribe 1, 2 o 3. También puedes escribir el número de COT o el nombre del cliente.
```

`Salir` cierra la consulta. El siguiente mensaje vuelve a abrir el menú general.

### 1.1 Tareas recientes

Muestra las **10** primeras de la pantalla Tareas: las del correo más reciente, sin la cotización interna `10000000000`.

```text
Tareas recientes:
1. COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
2. COT 10020252901 · PROYECTO OWYHEE PRODUCE
…
Escribe el número para entrar. Escribe menú para quedarte en el menú general.
```

El número de la lista abre esa cotización. No registra nada todavía.

### 1.2 Buscar

Desde el menú, o con la opción 2, el técnico busca de dos maneras:

- **Por número.** Un texto con la COT, por ejemplo `10020263623`.
- **Por cliente.** Un nombre, por ejemplo `Makro` o `Owyhee`.

Si hay una sola coincidencia, el bot pide confirmación antes de entrar:

```text
Encontré COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
1. Entrar
2. Seguir en el menú general
```

Si hay varias, lista hasta 10, con COT y cliente, y el técnico elige el número. Si no hay ninguna, lo dice y se queda en el menú general.

## 2. Dentro de la cotización

Al entrar, el bot repite la referencia y ofrece el menú de esa COT:

```text
Estás en COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
1. Datos de la cotización
2. Registrar seguimiento
3. Registrar incidente
4. Último seguimiento
5. Último incidente
6. Resumen de registros
7. Volver al menú general
```

La opción 7, o la palabra `salir`, vuelve al menú general. La respuesta deja constancia:

```text
Saliste de COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Volviste al menú general. No hay una cotización abierta.
1. Tareas recientes
2. Buscar cotización
3. Salir
```

`Cancelar` o `salir` durante un registro vuelve a este menú de la COT, sin guardar la nota, y repite la referencia. Desde el menú de la cotización, `salir` pasa al menú general.

## 3. Datos de la cotización

La opción 1 responde con los mismos datos de la ficha, bloque **Datos de la cotización**, para confirmar que es la cotización correcta antes de anotar:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Datos de la cotización
Ticket: 2139
Descripción: Alquiler de contenedor reefer 40 RH
Cliente: MAKRO SUPERMAYORISTA S.A.
Lugar: MAKRO HUACHO
Cita: 12/09/2026 10:00
Dirección: Av. San Martín 580, Huacho
Mapa: https://…
También citado: —
Temperatura: −21 °C · congelados
Telemetrías: 1
Contenedor: 01 reefer 40 RH
Comercial: Olinda Lopez, comercial
Correo: comercial4@zgroup.com.pe
Teléfono: +51 981 322 944

Sigues en COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Escribe menú para ver las opciones de esta cotización.
```

Un campo vacío se muestra como `—`. Después el técnico sigue dentro de la misma COT.

## 4. Registrar seguimiento o incidente

El registro es el mismo para los dos. Cambia el tipo y la frase de cierre. El técnico ya está dentro de la COT; no vuelve a elegirla.

Ejemplo de seguimiento. Incidente usa la opción 3 y cierra con «El incidente quedó…».

1. El técnico escribe `2` o `seguimiento`.
2. El bot confirma la cotización y pregunta por la imagen:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Vas a registrar un seguimiento.
¿Vas a poner una imagen?
1. Sí
2. No
```

3. Si escribe `no`, pasa al texto. Si escribe `sí`, el bot pide la foto:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Envía la imagen. Si ya no quieres imagen, escribe no.
```

4. Si la foto llega con un texto, ese texto es la nota y la imagen se guarda con ella. Si la foto llega sola, el bot responde `Imagen recibida. Escribe qué pasó.` Si en ese momento escribe `no`, la nota sigue sin imagen.
5. El técnico escribe qué pasó. Ejemplo: `Johan dice que no hay equipo asignado.`
6. El bot guarda la nota a nombre del técnico, canal WhatsApp, y confirma sin salir de la cotización:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
El seguimiento quedó en la ficha, con la imagen.
Sigues en esta cotización.
1. Datos de la cotización
2. Registrar seguimiento
3. Registrar incidente
4. Último seguimiento
5. Último incidente
6. Resumen de registros
7. Volver al menú general
```

Sin imagen, la confirmación dice `El seguimiento quedó en la ficha.` Un seguimiento pasa la tarea a `en_seguimiento` y la saca del recordatorio horario. Un incidente no la devuelve a ese recordatorio.

`menú` durante el texto, sin foto nueva, no guarda la nota: vuelve al menú de esa COT.

## 5. Consultar lo último

`4` envía el seguimiento más reciente de esa tarea. `5` envía el incidente más reciente. Si no hay ninguno, lo dice y sigue en la COT.

Cuando sí hay registro, el bot manda el texto. Si la nota tiene imagen, ese mismo texto sale como pie de la foto, en un solo mensaje:

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Último seguimiento · 05/10/2026 16:57 · Luis Marcelo
Johan dice que no hay equipo asignado.
Sin imagen.

¿Quieres el resumen de los últimos registros?
1. Sí, ver el resumen
2. No, seguir en esta cotización
```

Con imagen, no escribe «Imagen adjunta»: envía la foto guardada y el texto del seguimiento o del incidente va en el pie. El detalle de un registro del resumen hace lo mismo.

## 6. Resumen y detalle

`6` muestra los últimos registros de la bitácora de esa tarea, seguimiento e incidente juntos, del más nuevo al más viejo. Cinco por tanda.

```text
COT 10020263623 · MAKRO SUPERMAYORISTA S.A.
Últimos registros:
1. Seguimiento · 05/10/2026 16:57 · sin imagen · Johan dice que no hay equipo…
2. Incidente · 04/10/2026 11:20 · con imagen · La máquina está en reparación…
3. Seguimiento · 03/10/2026 09:05 · con imagen · Llegó el equipo…

Escribe el número para ver el detalle.
7. Ver más registros
8. Volver al menú de esta cotización
```

El detalle de un número repite el texto completo, autor y hora, y adjunta la imagen si existe. Al terminar ofrece:

```text
1. Otro registro de la lista
2. Menú de esta cotización
3. Menú general
```

`Ver más` trae los cinco anteriores. Si no hay más, lo dice.

## 7. La imagen hoy no se puede guardar

Validado el 5 de octubre de 2026, con el bot en estado listo y el técnico dentro de «Envía la imagen».

Llegaron dos fotos. En las dos, WhatsApp Web no entregó el archivo: la descarga falló tres veces con el error `r`, recargar el mensaje falló igual, y el intento de respaldo tampoco obtuvo bytes. El bot respondió que no pudo leer la imagen. Esas fotos **no** quedaron en la ficha ni en el almacén.

El técnico escribió `no` y después `no hay evento disponible`. Esa nota sí se guardó, como seguimiento, **sin imagen**.

Hasta que la lectura de la foto funcione, el registro no se bloquea:

1. El bot pide la imagen si el técnico dijo que sí.
2. Si no puede leerla, espera 2 segundos y responde: `No pude leer la imagen. Envíala otra vez, o escribe no para seguir sin imagen.` No cierra la sesión.
3. Un reintento usa el mismo paso. `no` pasa al texto y la nota se guarda sin archivo.
4. La confirmación no dice `con la imagen` si el archivo no se guardó.

Cuando la descarga funcione, el mismo paso 4 del registro guarda la imagen junto al texto y la consulta del punto 5 y 6 la puede reenviar.

## 8. Orden del chat, de punta a punta

1. El técnico escribe. El bot espera 2 segundos y abre el menú general.
2. Pide las 10 recientes o busca por COT o por cliente.
3. Confirma la coincidencia si hacía falta y entra. A partir de ahí cada respuesta nombra COT y cliente.
4. Si quiere estar seguro, pide **Datos de la cotización** y compara cliente, lugar y cita.
5. Elige seguimiento o incidente.
6. Dice si habrá imagen. Si sí, envía la foto o escribe `no`. Si la foto no se puede leer, puede reenviarla o seguir sin ella.
7. Escribe qué pasó.
8. Lee la confirmación y sigue en esa COT, o vuelve al menú general para abrir otra.
9. En cualquier momento, dentro de la COT, pide el último seguimiento, el último incidente o el resumen, y de ahí el detalle con su imagen.

## 9. Administrador y superusuario

Si la cuenta de WhatsApp es administrador o superusuario, el menú general lista, como máximo, los 10 más recientes de cada grupo que tenga abiertos:

```text
1. Tareas recientes
2. Asuntos internos
3. Pendientes de decisión
4. Buscar cotización
5. Salir
```

En una tarea o en un asunto interno puede registrar seguimiento o incidente. También puede cerrar por regularización: el bot pide si habrá imagen y después un comentario de por qué se cierra. Eso queda como seguimiento de cierre. La tarea pasa a resuelta y deja de listarse. El asunto interno o la decisión pendiente pasan a resueltos y dejan de listarse. La web tiene las mismas acciones: Abiertas / Resueltas en Tareas, Resueltos en asuntos internos, y Cerrar por regularización con comentario y foto opcional.
