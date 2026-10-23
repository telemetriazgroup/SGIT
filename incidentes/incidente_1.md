# Incidente 1: el bot contesta, pero no escribe a otro número

Fecha: 23 de octubre de 2026, servidor `ztrackperu2025`, proyecto en `/home/ztrack/mongo/Proyectos/SGIT`. La pantalla es `https://ztrack.app/SGIT/`.

## Qué se vio

El bot sigue respondiendo a quien le escribe. El administrador abre una cotización, entra a Área despacho y el menú vuelve. A las 11:06, en la cotización 10020264253 (CINCO MILLAS SAC), eligió regularizar el contenedor y mandó la foto de las puertas. El bot contestó: «No pude leer un código en la foto. Escríbelo o manda otra imagen.» Esa foto no quedó en la ficha.

A la vez, un mensaje iniciado por el sistema hacia otro número no sale. En Prueba de envío, el texto a 51929467505 quedó en la cola («Quedó en la cola. Sale en unos segundos.») y no llegó al teléfono. El registro de conexión, después de reiniciar `sgit-bot` y ver «Sesión lista», siguió anotando:

```text
Un aviso no salió hacia 51908947564: Data passed to getter must include an id property (it's how we memoize) but got undefined
```

Durante el reinicio también apareció `Cannot read properties of undefined (reading 'getChat')` y `Execution context was destroyed`. Eso es la página de WhatsApp cerrándose. Al quedar la sesión lista, el error del aviso volvió.

## No hay un bloqueo hacia la API

El mensaje que la persona escribe sí entra al sistema. La API lo recibe y arma la respuesta. Por eso el menú y el texto «No pude leer un código» salen en el mismo chat.

El corte está al revés: cuando SGIT quiere abrir otro chat y escribir primero (prueba de línea, aviso a despacho, compartir un dato), WhatsApp Web no abre ese chat. El aviso se guarda en la cola `aviso` y el proceso lo reintenta. No es un rechazo de la API ni un permiso del sistema.

## Por qué un número traba a los demás

La cola saca el aviso más antiguo. El que falla, el de 51908947564, se suelta y vuelve a quedar primero. La prueba a 51929467505 y cualquier aviso posterior esperan detrás. Reiniciar `sgit-bot` no los desbloquea: al arrancar, el mismo aviso vuelve a fallar y ocupa el turno.

WhatsApp ya no resuelve un destino armado como `número@c.us`. El chat de quien acaba de escribir sí existe en la sesión, y por eso la respuesta inmediata funciona. Un número al que el sistema le habla por la cola no pasa por ese chat y el envío se cae en la página de WhatsApp, antes de salir.

## La foto de validar no se guardó por otra razón

Esa foto sí llegó. Si la API no la hubiera recibido, el bot no habría dicho que no pudo leer un código.

El guardado está después de la lectura. En la regularización de contenedor o máquina, el sistema llama al lector y solo entonces escribe la nota y el archivo. Si el lector no devuelve un código, contesta el error y no llama al guardado. La imagen se descarta. No queda en la cotización ni en las impresiones ni en la bitácora de la tarea.

No se arregla reiniciando el bot ni la API. En ese mismo paso se escribe el número, o se manda otra foto donde el código se vea de frente.

## Qué no hay que hacer

No reiniciar `sgit-bot` en cada aviso fallido. El registro ya se repite solo, una vez por minuto, mientras el mismo aviso sigue en la cola. Un reinicio automático en ese error cierra la página de WhatsApp y, al volver, el envío sigue igual.

Comprobar la línea no debe pedir otro reinicio de la sesión si el mensaje no salió en un minuto. Ese reinicio fue el que dejó `getChat` vacío a las 11:20.

## Estado

| Hecho | Relación |
| --- | --- |
| Respuesta en el chat de quien escribe | Funciona. La API recibe y contesta. |
| Prueba y avisos a otro número | No salen. WhatsApp rechaza el destino y la cola no avanza. |
| Foto de regularizar el contenedor, 11:06, COT 10020264253 | Llegó. No se guardó porque no hubo código leído. |
