# Backlog inicial y criterios de aceptación

Historias en el orden de las fases. Cada una se da por hecha solo si cumple el criterio y no contradice las reglas de [`03-reglas-de-negocio.md`](03-reglas-de-negocio.md).

## Fase 0

| Id | Historia | Criterio |
| --- | --- | --- |
| H-00 | Como desarrollador quiero el esqueleto del monorepo | API, web y bot levantan en local con PostgreSQL, Redis y almacén de archivos |
| H-01 | Como administrador de Odoo quiero dejar por escrito los modelos reales | Documento con modelo de COT, de ticket, de MO y de lista de materiales, y un usuario de staging |
| H-02 | Como administrador quiero un buzón de pruebas autorizado | OAuth de lectura completo contra una casilla que no es la de producción |

## Fase 1

| Id | Historia | Criterio |
| --- | --- | --- |
| H-10 | Como sistema quiero traer correos de un rango de fechas | Se importan los mensajes del rango, paginados, sin duplicar por `gmailMessageId` |
| H-11 | Como sistema quiero mantenerme al día | Cada 5 minutos entran los mensajes nuevos y el `historyId` solo avanza si el lote quedó guardado |
| H-12 | Como operador quiero ver el correo con sus imágenes y archivos | El HTML se ve en la ficha y los adjuntos se descargan. Una imagen inline del mensaje aparece en el cuerpo |
| H-13 | Como administrador quiero editar el diccionario | Agregar un término y desactivar otro no requiere despliegue. El correo de ejemplo sigue clasificado como evento |
| H-14 | Como sistema quiero abrir una tarea por COT | El fixture crea una tarea con los campos de la tabla del flujo. Un segundo procesamiento no crea otra |
| H-15 | Como sistema quiero colgar el reply en la misma tarea | Un mensaje con la misma COT, o del mismo hilo sin COT, crea situación y no tarea. Un cambio de hora deja la cita anterior en el historial |
| H-16 | Como operador quiero corregir un campo mal leído | La corrección se mantiene cuando el mensaje se vuelve a evaluar |
| H-17 | Como operador quiero una cola de dudas | Un correo con palabras del diccionario y sin ZTRACK reconocible no avisa al equipo y sí aparece en revisión. Desde ahí puedo confirmarlo y entonces nace la tarea |
| H-18 | Como operador quiero la línea de tiempo del hilo | Veo origen, situaciones y cambios de cita en orden |

### Aceptación de Fase 1 (prueba guiada)

1. Importar [`el correo de ejemplo`](ejemplos/correo-cot-10020263623.md) como mensaje.
2. Verificar COT, ticket, lugar, cliente, cita, temperatura, cantidad 1 y comercial.
3. Procesarlo otra vez: sigue habiendo una tarea.
4. Anexar un reply que cambia la hora a las 15:00: una situación de reprogramación, cita vigente 15:00, cita previa 10:00.
5. Procesar un correo sin señales: almacenado, sin tarea.
6. Cortar la sync a mitad de un lote y reanudarla: ningún mensaje a medias queda como único puntero avanzado.

## Fase 2

| Id | Historia | Criterio |
| --- | --- | --- |
| H-20 | Como miembro quiero enterarme de una tarea nueva | Al crearse, cada miembro activo recibe un resumen con COT, cliente, lugar, cita y cantidad |
| H-21 | Como miembro quiero anotar lo que me dijeron, con foto | Desde la web y desde WhatsApp queda un seguimiento con mi usuario, el texto y la imagen. La tarea pasa a `en_seguimiento` |
| H-22 | Como sistema no quiero insistir si ya hay avance | Esa tarea no sale en el barrido de las horas siguientes del mismo día |
| H-23 | Como sistema quiero preguntar a despacho mientras nadie avanzó | Entre 08:00 y 18:00, en día laborable, sale como máximo una consulta por hora si la tarea sigue sin avance |
| H-24 | Como miembro quiero que me recuerden en 4 horas | Creo un snooze de 4 horas. No entra al barrido. A las 4 horas recibo el aviso aunque ya hubiera notas |
| H-25 | Como miembro quiero registrar un incidente de una tarea con avance | Desde el menú elijo la tarea, dejo texto e imagen, y el barrido horario sigue sin incluirla |
| H-26 | Como miembro quiero confirmar el código que mandó Johan | La propuesta del chat queda en borrador hasta que confirmo. Recién ahí la atención ve el código |
| H-27 | Como administrador quiero ver si el bot está vivo | La pantalla muestra `listo`, `esperando QR` o `desconectado`, y la hora del último aviso enviado |
| H-28 | Como sistema quiero ignorar un número ajeno | Un teléfono no registrado no crea seguimientos |

### Aceptación de Fase 2

Recorrer con el número de laboratorio: tarea nueva → consulta a despacho simulada → nota con foto → ausencia en el barrido → incidente → snooze de prueba a 5 minutos en un ambiente de test (en producción el operador elige las horas). Comprobar que un segundo proceso del bot no toma la misma sesión.

## Fase 3

| Id | Historia | Criterio |
| --- | --- | --- |
| H-30 | Como operador quiero ver la venta de la COT | Con un único match en staging, la ficha muestra el estado y la fecha de lectura |
| H-31 | Como operador quiero ver el ticket | Igual para `#2139` en el modelo inventariado |
| H-32 | Como operador quiero resolver una búsqueda ambigua | Si hay dos documentos, elijo uno. El sistema no elige solo |
| H-33 | Como operador quiero seguir viendo la ficha si Odoo no responde | Se muestra el último estado y un aviso de fallo de lectura |

## Fase 4

| Id | Historia | Criterio |
| --- | --- | --- |
| H-40 | Como miembro quiero abrir las atenciones que dice el correo | Para cantidad 1 se propone una atención. Puedo abrir 2 si dejo motivo |
| H-41 | Como miembro quiero crear la MO con los materiales que elegí | Las cantidades confirmadas son las que recibe Odoo. El id queda en la atención |
| H-42 | Como miembro no quiero duplicar la MO | Dos confirmaciones seguidas dejan un solo `odooMoId` |
| H-43 | Como miembro quiero la constancia firmada | Sin foto de la MO no paso a espera de almacén. Sin foto de recepción no confirmo recibidos |
| H-44 | Como miembro quiero dejar constancia de que no hay stock | El incidente queda en la línea de tiempo y la atención sigue abierta |
| H-45 | Como miembro quiero saltar materiales | “No fue necesario”, con nota, habilita instalación y no crea MO |

## Fase 5

| Id | Historia | Criterio |
| --- | --- | --- |
| H-50 | Como miembro quiero registrar la instalación | Faltando chip, código o alguna foto mínima, no paso a prueba |
| H-51 | Como sistema quiero dejar la lectura del equipo | El conector del modelo guarda éxito, resumen y hora. Un fallo deja la atención en prueba |
| H-52 | Como administrador quiero autorizar una excepción | Puedo permitir el avance sin prueba. Queda mi usuario y el motivo |
| H-53 | Como miembro quiero entregar el acceso | Alta o asignación. La contraseña no aparece en logs. Un reintento no crea otro usuario |
| H-54 | Como comercial quiero el reporte y los accesos | Un correo con el PDF y los accesos. Un segundo cierre no reenvía |
| H-55 | Como despacho quiero el código instalado | Un aviso con COT y código. Reenvío solo si el operador lo pide, y queda auditado |
| H-56 | Como miembro quiero cerrar la tarea | Solo si todas las atenciones están cerradas o canceladas con motivo |

### Aceptación de Fase 5

Una atención de laboratorio recorre materiales no necesarios o MO de staging, evidencias, prueba simulada o real de un modelo, alta de usuario de prueba, un correo y un WhatsApp. Búsqueda en logs de la contraseña de prueba: cero coincidencias.

## Fase 6

| Id | Historia | Criterio |
| --- | --- | --- |
| H-60 | Como administrador quiero un tablero de salud | Sync, revisión pendiente, bot, errores de Odoo y de plataforma en una pantalla |
| H-61 | Como administrador quiero recuperar el sistema | Hay backup probado de base, archivos y sesión, y un runbook de restauración ejecutado una vez en limpio |
| H-62 | Como operador quiero menos falsos dudosos | Los hilos reales acumulados en revisión se clasifican con el diccionario o el extractor ajustado, y los casos nuevos equivalentes no vuelven a la cola |

## Fuera del backlog de esta versión

- Aplicación nativa.
- Usuarios de la web para comercial, despacho o almacén.
- API oficial de Meta.
- Watch push de Gmail.
- Más de una familia de máquina hasta cerrar la primera.
- Edición o borrado de correos importados.
