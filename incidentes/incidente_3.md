# Incidente 3: el PDF de la orden y las fotos de despacho no llegan al chat

Fecha: 11 de noviembre de 2026, 11:30. Servidor `ztrackperu2025`, proyecto en `/home/ztrack/mongo/Proyectos/SGIT`. La pantalla es `https://ztrack.app/SGIT/`. El chat es el de la cotización 10020264411 · 10020264412 · 10020264414, REDONDOS, PLAZA VEA CHICLAYO, hilo 1, orden ZGROU/MO/06841.

## Qué se vio

El técnico pide el PDF de la orden ya confirmada. El bot contesta «Te mando el reporte de ZGROU/MO/06841» y vuelve a pintar el menú. El archivo no aparece en el teléfono.

Lo mismo pasa con las fotos que manda despacho. En el chat solo queda el texto de que despacho envió algo. Las imágenes no llegan.

En el registro del bot, a las 11:30, el aviso del reporte se cierra así:

```text
Un aviso no salió. hacia 51977738855: se cerró tras 3 minutos sin salir. Data passed to getter must include an id property (it's how we memoize) but got undefined
Fabricación · 5 intentos · Reporte de orden de producción ZGROU/MO/06841
```

El mismo corte se repite hacia 51977738852. La impresión en papel sí sale: «Quedó enviado. La impresora lo tiene en impresión.» Ese camino no pasa por WhatsApp.

## El texto del menú y el archivo van por caminos distintos

La frase «Te mando el reporte» es la respuesta al mensaje que el técnico acaba de escribir. Esa respuesta usa el chat que ya está abierto y por eso el texto sí llega.

El PDF no va en esa respuesta. `pedirReporte` lo guarda y crea un aviso de tipo `fabricacion` con el archivo en `aviso_adjunto`. Las fotos de despacho hacen lo mismo: un aviso `asignacion_despacho` con el texto y las imágenes aparte. El proceso `sgit-bot` saca ese aviso de la cola y lo manda con `WWebJS.sendMessage` dentro de la página de WhatsApp, con `waitUntilMsgSent: true`.

WhatsApp arma el mensaje y después busca su id para esperar el acuse. El id no viene. La página tira `Data passed to getter must include an id property`. El aviso vuelve a la cola, se reintenta unos 45 segundos y, a los 3 minutos o a los 5 intentos, queda cerrado. El teléfono nunca recibe el archivo. Es el mismo corte del incidente 1, ahora sobre el PDF y las fotos, no solo sobre un texto a otro número.

En las fotos el corte se agrava: el envío de la imagen iba con el texto vacío y el cuerpo del aviso salía en un segundo mensaje. Si la imagen fallaba, el segundo mensaje no se intentaba, o el texto salía solo. Como el cuerpo de la imagen iba vacío, el bot no podía reconocer que el archivo ya estaba en el chat y lo daba por no enviado.

## Confirmado a las 11:57

El menú nuevo ya está en el teléfono. Al elegir «1. Ver el PDF de la orden» el bot escribe «Ahí va el PDF de ZGROU/MO/06841» y repite el menú. El archivo no aparece. La impresora sí recibe el PDF, porque ese camino no entra a WhatsApp.

La API sí arma el archivo: esa frase solo se escribe cuando el PDF ya está leído y va junto a la respuesta. El bot intenta mandarlo como documento y, al fallar, manda solo el texto. Por eso se lee que lo envía y el archivo no está.

El corte es de los archivos, no del chat. WhatsApp Web, al preparar una imagen o un PDF, devuelve un modelo con un campo interno `__x_id`. La librería lo mezcla con el mensaje y ese campo pisa el id real. Al crear el mensaje, la página tira `Data passed to getter must include an id property (it's how we memoize) but got undefined`. Un texto no lleva ese modelo, y por eso el menú sí sale. La misma librería lo tiene anotado en el arreglo `delete message.__x_id` (whatsapp-web.js, envío de media, 2026).

## Qué queda hecho

El PDF que el técnico pide dentro del chat sale en la respuesta a su mensaje, como documento, no como un aviso de la cola. Al confirmar la orden pasa lo mismo: llega el PDF y la pregunta «¿La imprimo?». `si` manda la copia a la impresora. `menu` vuelve al menú del hilo. `0` vuelve al menú general.

Si la orden ya está confirmada, al entrar al hilo el chat dice el número de la orden. El menú de fabricación ya no ofrece pedir insumo ni agregar o modificar. Ofrece ver el PDF, imprimir, el reporte de instalación, volver al hilo o el menú general.

En la cola, el envío ya no espera el acuse (`waitUntilMsgSent: false`). La primera foto o el PDF llevan el texto como pie. Antes de cada archivo, el bot quita `__x_id` del modelo que devuelve WhatsApp, que es lo que pisaba el id del mensaje. Con eso el PDF pedido en el chat y las fotos de despacho usan el mismo arreglo.

Los avisos que ya se cerraron a las 11:30 no se reintentan. Hay que pedir el PDF otra vez desde el menú de la orden, después de copiar este cambio al servidor y reiniciar la API y `sgit-bot`.
