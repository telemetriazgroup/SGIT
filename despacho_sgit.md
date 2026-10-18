# Despacho SGIT

Proceso e implementación del turno de asignación. El caso de origen es [`caso_encargado_despacho.md`](caso_encargado_despacho.md). Esto reemplaza la pregunta horaria de código y máquina. No abre el sprint 7 ni toca Odoo.

El corte 1 deja el turno usable con texto. El corte 2 añade fotos, el aviso al técnico y la repregunta.

## Proceso

El superusuario marca en Cuentas quiénes son coordinadores de despacho. Solo esas cuentas, y solo si tienen teléfono, reciben la pregunta. El rol `despacho` sigue sirviendo para entrar a la web y ver las tareas habilitadas. La marca nueva decide a quién escribe el bot.

De lunes a viernes, si el día no es feriado, a las 08:30 hora de Lima el bot toma la primera cotización pendiente de asignación y se la escribe a esos teléfonos. No manda las tres juntas. Cada una tiene su conversación. Si el coordinador termina antes, pasa a la siguiente. Si pasan 30 minutos desde el último mensaje, cierra lo que haya y pasa a la siguiente. A las 18:00 no abre otra. Si no hay pendientes de asignación, no envía nada. El menú sigue vivo: el coordinador puede escribir `menu` y ver las cotizaciones que el área técnica todavía no cerró.

Ejemplo de una mañana con tres pendientes:

1. COT 10020263469, alquiler de contenedor reefer.
2. COT 10020264025, Donofrio Helados.
3. COT 10020262172, Hipermercados Tottus.

A las 08:30 sale solo la primera. La segunda espera a que esa charla se cierre o a que cumpla el silencio de 30 minutos.

Si hay dos coordinadores, los dos reciben la apertura. El primero que contesta se queda con la cotización. Al otro se le dice que esa COT ya la está atendiendo alguien, y no se le abre una segunda charla de la misma.

Texto de apertura:

```
Buenos días. Te escribe el asistente automático del área ZTrack.
Tenemos una solicitud de telemetría en la cotización 10020263469, del cliente ALQUILER DE CONTENEDOR REEFER 40 RH +.
Envíame el contenedor y la máquina asignados. Puedes escribir o mandar imágenes.
Escribe 1 o datos para ver la cotización.
Escribe menu para ver las demás pendientes.
```

A partir de ahí:

| El coordinador escribe o manda | El bot hace |
| --- | --- |
| `1` o `datos` | Resume la ficha (COT, cliente, lugar, cita, cantidad) y vuelve a pedir contenedor y máquina. |
| `menu` | Lista las pendientes de asignación y las habilitadas que el área técnica no ha cerrado. Un número abre esa cotización. |
| texto o imagen | Lo guarda en la asignación de esa COT y pregunta si quiere añadir algo más. |
| `ok`, `listo` o `es todo` | Repite lo entendido y pide confirmación. |
| `ok` o `ya` sobre ese resumen | Cierra la asignación y, si aún es hora, abre la siguiente. |
| `otro` | Descarta el borrador de esa vuelta y pide escribir de nuevo. |
| 30 minutos sin mensajes | Cierra con lo recogido, si hay algo, y pasa a la siguiente. |

Cuando la asignación queda confirmada, cada técnico activo con teléfono recibe el texto y las imágenes. En el chat puede aceptar o pedir más detalle. Las preguntas predefinidas son:

- ¿El equipo está en patio?
- ¿Se va a cambiar la máquina?
- ¿Se despachará hoy?
- ¿Está en gambeta?

También puede escribir una pregunta propia. Cualquiera de esas devuelve la cotización a la cola. Aceptar no anota solo: abre el menú que ya existe para registrar seguimiento o incidente de esa COT.

La confirmación del coordinador deja la asignación visible en la ficha. El código y la máquina firmes de la tarea se escriben cuando un técnico acepta.

## Qué se apaga

Hoy, entre 08:00 y 18:00, `PulsoDespacho` llama a `TareasService.barrido()` y, si hay un despacho con teléfono, encola un aviso `consulta_despacho` por cada tarea habilitada en `detectada` sin nota de seguimiento. La respuesta solo se acepta si trae las palabras código y máquina (`propuestaEquipo`). Eso queda en `borrador_equipo` hasta que un miembro lo confirma en la web. Johan no tiene teléfono, así que la hora se anota en `recordatorio` y el aviso no sale.

En el mismo cambio del corte 1:

- `consultas()` deja de crear avisos `consulta_despacho`.
- El barrido deja de insertar `recordatorio` de tipo `horario` para esas tareas. Si sigue insertándolo, la hora queda consumida y una repregunta del técnico no vuelve a salir.
- El snooze no se toca. `aviso_snooze` y el recordatorio pedido por un miembro siguen igual.
- `propuestaEquipo` deja de ser la única forma de responder. El texto libre y las imágenes son la asignación.
- El menú corto `1. Tareas recientes / 2. Buscar / 3. Salir` lo reemplaza esta charla. `menu` y la búsqueda de una COT se conservan dentro de ella.

La confirmación en la web del borrador actual puede quedar para lo ya guardado. Las asignaciones nuevas no pasan por ese borrador.

## Reglas de la cola

Entra al turno automático una tarea que cumpla todo esto:

- está en `habilitado` con clase `tarea`;
- su estado no es `resuelta`;
- no tiene una asignación aceptada por un técnico, o tiene una repregunta abierta.

No entra la centinela `10000000000`, ni una tarea que el superusuario no marcó, ni una ya aceptada y sin repregunta.

El menú manual, cuando el coordinador escribe `menu`, muestra las habilitadas que no están resueltas, aunque ya tengan asignación. Desde ahí puede añadir más información.

Orden de la cola: la más antigua entre las que nunca se preguntaron, y después las reconsultas. Una repregunta no se salta por delante de una que lleva la mañana sin abrirse si esa otra ya estaba en cola; entra al final. Una tarea no se pregunta dos veces el mismo día salvo que vuelva por silencio sin respuesta, por `otro`, o por repregunta de un técnico.

Reloj, en `America/Lima`:

- día laborable, de lunes a viernes, fuera de los feriados que ya usa `barridoCorre`;
- la primera apertura del día, a las 08:30;
- no se abre una cotización nueva desde las 18:00;
- silencio de 30 minutos desde el último mensaje de esa charla.

El pulso puede seguir despertando cada 60 segundos. Solo abre turno si el reloj lo permite y no hay otra cotización `en_curso`.

## Corte 1

Cuentas, cola, charla de texto y cierre. Sin imágenes hacia los técnicos y sin las cuatro preguntas.

### Datos

Migración nueva, idempotente, aplicada en cada arranque después de `022_despacho.sql`. No reinicia charlas de técnicos ni borra tareas.

```text
usuario.consulta_despacho  boolean NOT NULL DEFAULT false
```

Johan nace con la marca en falso. Nadie queda marcado solo por tener rol `despacho`. El teléfono se sigue editando donde ya se edita. Sin teléfono, la marca no alcanza para escribirle.

```text
asignacion_despacho
  id              uuid
  tarea_id        uuid → tarea
  autor_correo    text
  autor_nombre    text
  texto           text
  estado          recogiendo | por_validar | confirmada | aceptada | reconsulta
  creado_en       timestamptz
  confirmada_en   timestamptz
```

Una tarea puede tener varias asignaciones en el tiempo. La vigente es la última que no esté descartada. `otro` pasa la que estaba `recogiendo` o `por_validar` a un estado `descartada`, que hay que incluir en el `CHECK`.

```text
turno_despacho
  id                 uuid
  tarea_id           uuid → tarea
  telefono_dueno     text
  estado             en_cola | en_curso | cerrada | reconsulta
  abierto_en         timestamptz
  ultimo_mensaje_en  timestamptz
```

Una sola fila `en_curso` en toda la tabla. El índice único parcial evita que dos pulsos abran dos cotizaciones.

La charla sigue siendo una fila por teléfono. Hay que ampliar el `CHECK` de `charla.paso` en la migración que se vuelve a aplicar en cada arranque (`017_charla_tecnico.sql`, o en la migración nueva si esa corre después y repite la lista completa). Los pasos nuevos:

- `despacho_oferta`
- `despacho_detalle`
- `despacho_menu`
- `despacho_recogiendo`
- `despacho_validar`

No hace falta un tipo nuevo de aviso en el corte 1: la apertura sale por la misma cola `aviso`, con el tipo que ya existe, o con uno nuevo si se quiere distinguir el texto. Si se agrega un tipo, va en `013_bot_prueba.sql` dentro del `CHECK` que esa migración vuelve a crear en cada arranque. Ponerlo solo en un archivo posterior se pierde al reiniciar, en cuanto `013` corre primero.

### Charla

`atenderDespacho` deja de exigir `propuestaEquipo` y pasa a mirar el paso.

`despacho_oferta` y `despacho_recogiendo` tratan `1` y `datos` como pedido de ficha, y `menu` como lista. Cualquier otro texto se acumula en `asignacion_despacho.texto`, separado por un salto de línea, y el bot responde: «Quedó anotado. ¿Quieres añadir algo más? Escribe ok cuando termines.»

`ok`, `listo` y `es todo` en recogida pasan a `despacho_validar` y arman el eco:

```text
Entiendo que para la cotización 10020263469 está asignado:
<texto acumulado>
Responde ok si es así.
Escribe otro para volver a redactarlo.
```

`ok` o `ya` en validación pone la asignación en `confirmada`, cierra el turno y llama al que abre la siguiente. `otro` marca esa asignación `descartada`, crea otra en `recogiendo` y vuelve a pedir el dato.

El silencio lo evalúa el pulso, no el mensaje entrante. Si `en_curso` y `ultimo_mensaje_en` tiene 30 minutos o más, cierra igual que un `ok` si había texto, o devuelve la tarea al final de la cola si no se escribió nada.

`menu` guarda los id en `charla.lista`, como ya hacen las tareas recientes. El número elige. Si esa cotización es otra, la que estaba `en_curso` vuelve a `en_cola` sin perder el texto ya guardado.

### Web

En el alta y la edición de Cuentas, un control «Preguntar pendientes de despacho». Lo ve y lo cambia el superusuario. La ficha de la tarea, para quien ya la puede ver, muestra la última asignación confirmada: autor, hora y texto. En el corte 1 no se muestra foto.

### Archivos del corte 1

- `apps/api/src/db/013_bot_prueba.sql`, solo si entra un tipo de aviso nuevo.
- `apps/api/src/db/017_charla_tecnico.sql`, lista completa de pasos.
- `apps/api/src/db/024_despacho_turno.sql`, marca, tablas e índice único.
- `apps/api/src/bot/avisos.ts`, texto de apertura, eco y menú.
- `apps/api/src/bot/bot.service.ts`, `atenderDespacho` y los pasos nuevos.
- `apps/api/src/bot/pulso-despacho.ts`, cola de a una y silencio. El snooze se queda.
- `apps/api/src/tareas/barrido.ts`, el horario de las 08:00 deja de alimentar esta pregunta. `entraHoraria` puede seguir existiendo para el snooze.
- `apps/api/src/tareas/tareas.service.ts`, dejar de insertar el `recordatorio` horario de esta consulta.
- `apps/web/src/Equipo.tsx` y la ficha en `Tareas.tsx`.

## Corte 2

Fotos, aviso al técnico y repregunta.

### Fotos que entran

El técnico ya manda imágenes y el bot ya las guarda y, en una respuesta de la misma charla, ya puede enviar `MessageMedia`. Despacho reutiliza ese almacén. Cada imagen cuelga de la asignación:

```text
asignacion_archivo
  id              uuid
  asignacion_id   uuid → asignacion_despacho
  clave           text
  mime            text
  nombre          text
```

Cada imagen recibida durante `despacho_recogiendo` se guarda y el bot vuelve a preguntar si quiere añadir algo más. El eco de validación dice cuántas imágenes llegaron. Esas imágenes no se escriben como nota de seguimiento del técnico.

### Aviso al técnico

La cola de salida hoy manda solo `aviso.cuerpo` como texto (`apps/bot/src/main.ts`). Para que las fotos lleguen hay que colgarlas del aviso y enseñar al bot a enviarlas delante del texto.

Tipo nuevo, declarado en el `CHECK` de `013_bot_prueba.sql`: `asignacion_despacho`.

Al confirmar, un aviso por cada técnico activo con teléfono. El cuerpo lleva la COT, el cliente y el texto del coordinador. Las imágenes van en el orden en que llegaron. No se manda la contraseña de nadie ni el cuerpo del correo completo.

En el teléfono del técnico la charla queda en un paso nuevo, `tecnico_asignacion`:

```text
Despacho informó la cotización 10020263469.
<texto>
Imágenes: <n>
1. Aceptar y registrar
2. Pedir más detalle
```

`1` no crea la nota. Deja la asignación en `aceptada`, copia a `tarea.codigo_equipo` y `tarea.maquina_equipo` el texto confirmado, y abre el menú de esa COT para que el técnico elija seguimiento o incidente, que ya existe.

`2` muestra las cuatro preguntas y la opción de escribir otra. Al elegir o escribir, la asignación pasa a `reconsulta`, el turno vuelve a `reconsulta` y el texto de la pregunta queda para la siguiente apertura a despacho:

```text
El equipo técnico pregunta por la cotización 10020263469:
¿El equipo está en patio?
La asignación anterior fue:
<texto>
```

El coordinador responde con la misma charla de recogida y validación. Al confirmar, los técnicos reciben otra vez el paquete.

### Archivos del corte 2

- `013_bot_prueba.sql`, tipo `asignacion_despacho`.
- `017_charla_tecnico.sql`, paso `tecnico_asignacion`.
- `024` o una `025` con `asignacion_archivo` y la tabla que une aviso e imagen.
- `apps/bot/src/main.ts`, envío de la imagen junto con el aviso.
- `apps/api/src/bot/bot.service.ts`, rama del técnico delante del menú de la COT, sin cambiar los textos `1. Tareas recientes / 2. Buscar / 3. Salir`.
- Ficha web: las imágenes de la asignación, al lado del texto.

## Límites

No se pregunta una cotización resuelta. El hilo de correo de una resuelta sigue en su ficha y no entra a este turno.

No se habilitan en masa las tareas viejas. El turno solo ve las que el superusuario ya marcó.

No se llama `retirarSinEncargo` desde este flujo.

No se corre `prueba.bot` ni `prueba.buzon` contra la base que ya tiene el correo y la sesión de WhatsApp. Esas suites borran filas y marcan el bot desconectado.

No se inventan nombres de modelos de Odoo. Este proceso no lee ni escribe Odoo.

No se manda la consulta real de la 10020263469, ni un mensaje de prueba a un técnico, para verificar el código. La prueba usa un número de laboratorio y cotizaciones desechables, y al final borra esas filas.

No se borra `sessions/wwebjs` ni la sesión del otro bot.

## Prueba del corte 1

Con el reloj inyectado, sin esperar a las 08:30 reales:

- A las 08:29 no sale nada. A las 08:30 sale una sola cotización, a los teléfonos marcados.
- Una segunda evaluación un minuto después no abre la siguiente.
- `ok` sobre el eco cierra y abre la segunda.
- `otro` no deja el texto anterior en la ficha.
- 30 minutos sin mensajes devuelve a la cola una cotización vacía, y cierra una que ya tenía texto.
- Sábado, feriado y las 18:00 no abren turno.
- Una tarea no habilitada no aparece. Una resuelta no aparece.
- El snooze de un miembro sigue avisando a su hora.

En la web, el superusuario marca y desmarca la cuenta. Johan, sin la marca o sin teléfono, no recibe el turno.

## Prueba del corte 2

Sobre una cotización desechable y un teléfono de laboratorio:

- Una imagen queda en la asignación y vuelve en el aviso al técnico.
- Aceptar deja el texto en la ficha y abre seguimiento o incidente. No crea la nota por su cuenta.
- Cada pregunta predefinida, y una escrita, devuelve la COT a la cola con ese texto.
- Confirmada la respuesta, el técnico recibe el paquete nuevo.
- Un segundo proceso del bot no toma la sesión.

## Queda fuera

Lectura de venta y ticket en Odoo, atenciones, órdenes de fabricación, materiales, instalación y usuarios de plataforma. Eso sigue en los sprints 7 a 13.

El espacio fijo de 30 minutos entre una cotización ya cerrada y la siguiente no se espera: si el coordinador termina en cinco minutos, la siguiente sale en ese momento. Los 30 minutos son el silencio que cierra la charla, no una pausa después de un `ok`.
