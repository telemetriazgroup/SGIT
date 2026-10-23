# Caso: grupo de WhatsApp de asignaciones

Grupo **Asignaciones Zgroup**. Ahí el encargado de despacho publica las fotos de los contenedores. El grupo tiene varios miembros (en la revisión del 23 de octubre de 2026 se veían 24) y ya acumula cientos de archivos. No es el chat privado del bot.

La idea es agregar al grupo el número de WhatsApp que ya usa el bot, para que vea esos mensajes. Hoy no lo hace: en `apps/bot/src/main.ts` todo mensaje de grupo se descarta (`from` termina en `@g.us`) antes de llamar a la API. Aunque agreguen el número, el bot no lee el grupo hasta que ese filtro tenga un camino aparte.

## Qué se quiere

1. El bot entra solo a este grupo. No a cualquier grupo donde lo agreguen.
2. Detecta cuando alguien menciona nuestro número. En el chat lo llaman `@telemetriaz` (también se vio escrito `@telemtriz`). La mención que vale es el contacto, no el texto escrito: WhatsApp manda el identificador en `mentionedIds`.
3. Lo mismo si mencionan otro número que dejemos anotado.
4. Si quien escribe es un usuario con rol despacho y teléfono guardado, se mira si mandó texto, una imagen o las dos.
5. Si hay imagen de contenedor, se lee con el mismo lector que ya usa el privado.
6. Se registra lo que pase en el grupo desde el día en que el bot entre: quién, a qué hora, el texto, si había imagen, a quién mencionó y qué código salió de la foto. No se baja el historial viejo.

El autor de un mensaje de grupo suele llegar como identificador interno, no como celular. Hay que resolverlo al número, igual que ya se hace en el chat privado, y recién ahí compararlo con las cuentas de despacho.

## Qué no debe pasar

El mensaje de grupo no entra a la charla privada. La charla está armada por teléfono y por menú. Si el grupo pasara por ese mismo camino, el bot contestaría dentro de Asignaciones Zgroup y mezclaría la conversación de cada persona.

El bot no responde en el grupo. Solo observa, lee y registra. La pregunta al encargado sigue saliendo por el privado.

Una foto del grupo no cierra sola la cotización. En los mensajes vistos no viene el número de COT. La foto queda como envío del encargado. Se ata a una cotización cuando el mismo mensaje trae el número o el cliente, o cuando el encargado sigue respondiendo por el privado.

## Pregunta privada al encargado

Esa pregunta no cambia de canal. Cuando el técnico pide el contenedor y la máquina, el bot se lo escribe al coordinador de despacho en su chat. El texto ya no lleva solo el número.

```
El equipo técnico pregunta por la cotización 10020264263:
Cliente: …
Fecha a despacho: 23/10/2026
Hay 1 hilo pendiente. Envíame el contenedor y la máquina. Confirma ahora el equipo 1.
La asignación anterior fue:
todavía no hay
Responde con texto o con fotos. Pueden ser varias juntas. Escribe ok cuando termines.
```

La fecha a despacho es la misma de la lista de tareas: la entrega urgente de la tienda si la cotización tiene una abierta, y si no, la cita. Si no hay ninguna, dice «sin fecha». El texto lo arma la API en `textoReconsultaDespacho`.

## Estado

| Parte | Estado |
| --- | --- |
| Cliente y fecha a despacho en la pregunta privada | Hecho en la API. Entra cuando esa API está en servicio. |
| Escuchar el grupo, la mención y el registro | Documentado. No implementado. |
