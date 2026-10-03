# Integraciones

Cuatro sistemas externos más el canal WhatsApp. Cada uno tiene un contrato mínimo, un dueño del dato y un modo de fallo que la tarea debe mostrar sin perder el trabajo ya capturado.

## 1. Gmail

**Para qué.** Traer el buzón, conservar la réplica y, en el cierre, enviar el reporte al comercial.

**Cómo.** API de Gmail con OAuth 2.0 de la cuenta operativa. No se usa contraseña de aplicación ni IMAP como camino principal: los adjuntos, el hilo y el historial incremental salen de la API.

**Alcances.**

| Momento | Alcance |
| --- | --- |
| Fases 1 a 4 | Lectura del buzón |
| Fase 5 | Envío, limitado al reporte de cierre desde la cuenta autorizada |

**Ciclo.**

- Carga inicial por fechas, pedida por un administrador.
- Luego, cada 5 minutos, cambios desde el `historyId`.
- Adjuntos e imágenes inline en el almacén de archivos.
- Idempotencia por id de mensaje.

**Límites a respetar.** Cuota diaria de la API, tamaño de adjuntos y backfill. La sync reciente no espera a que termine un histórico grande: son colas distintas.

**Si falla.** La tarea no se pierde porque aún no nació. El buzón queda `reintentando` y la web lo muestra. Si el refresh token caduca, el estado pasa a `requiere_reautorizacion` y el administrador repite el consentimiento.

## 2. Odoo

**Para qué.**

| Necesidad del caso | Uso |
| --- | --- |
| COT ligada al módulo de venta | Leer estado y evolución de la cotización / pedido |
| Ticket de ventas en servicio externo | Leer el ticket o la tarea |
| MO de fabricación | Crear desde la atención |
| Lista de materiales | Leerla, dejar que el operador elija y cantidades, replicarla en SGIT y mandarla en la MO |

**Cómo.** API externa de Odoo (XML-RPC o JSON-RPC, la que exponga la instancia) con un usuario técnico de permisos mínimos: lectura de ventas y servicio, creación de fabricaciones sobre los productos de telemetría.

**Resolución de la COT.** Buscar por el número normalizado en la referencia que el comercial ya usa. Si hay cero o más de un documento, la tarea muestra el conflicto y el operador vincula a mano. No se elige “el primero”.

**Resolución del ticket.** Igual, por el número `#2139` en el modelo que el inventario de Fase 0 identifique.

**Fabricación.**

1. SGIT lista las listas de materiales aplicables a instalación de telemetría.
2. El operador ajusta líneas.
3. Alta de `mrp.production` (o el modelo real equivalente) con clave de idempotencia.
4. Se guarda `odooMoId` y se genera el PDF local para firma. Si Odoo ya imprime un formato oficial, se usa ese PDF y SGIT solo lo archiva junto con la foto firmada.

**Si falla.** La atención sigue en solicitud de materiales, con el mensaje de Odoo visible. Reintentar no crea una segunda MO.

**Dato que manda.** Estado comercial y existencias: Odoo. Evidencia firmada, incidente de almacén y decisión de “no fue necesario”: SGIT.

## 3. WhatsApp (`whatsapp-web.js`)

**Para qué.** Avisar tareas nuevas, consultar a despacho, recordar, recibir seguimientos, fotos e incidentes, y avisar el cierre a despacho.

**Cómo.** El proceso `apps/bot` levanta Chromium, restaura `sessions/wwebjs` con LocalAuth y usa el número ya vinculado. El detalle del cliente está en [`bot_wattsap.md`](../bot_wattsap.md).

**Mapa de chats.**

| Chat | Uso |
| --- | --- |
| Cada miembro del equipo, identificado por su teléfono | Avisos y menú operativo |
| Despacho (Johan) | Pregunta de código y máquina; aviso de instalación lista |
| Comercial | Solo si en Fase 5 se decide un aviso corto además del correo. El reporte con accesos sale por email |

**Menú del miembro.**

1. Pendientes sin avance.
2. Mis tareas.
3. Registrar incidente (elige tarea).
4. Poner en validación (elige tarea y horas).
5. Abrir en la web la atención completa.

**Consulta a despacho.** Mensaje con COT, cliente, lugar y fecha, pidiendo código y máquina. Máximo uno por hora dentro de la ventana, y solo mientras RN-42 se cumpla.

**Entrada.** Texto e imagen se convierten en seguimiento o incidente del miembro cuyo número está registrado. Un número desconocido no escribe en tareas; el bot responde que no está habilitado.

**Salida.** Tabla outbox: destino, cuerpo, media, `noEnviarAntes`. El worker respeta una pausa entre envíos para no comportarse como un difusor.

**Si falla.** Sesión caída: estado visible y QR de revinculación para el administrador. Los avisos quedan en outbox y salen al reconectar. La operación por la web no depende del bot.

**Límite conocido.** Es un cliente no oficial. Un cambio de WhatsApp Web puede cortar la sesión. Por eso la web cubre los mismos registros de seguimiento e incidente, y el runbook de reconexión forma parte de la Fase 2.

## 4. API de conexión del equipo

**Para qué.** Después de instalar, dejar asentada la lectura real según el modelo de máquina (en el ejemplo, familias Magnum Plus / Thermo King o Starcool).

**Cómo.** Un conector por familia de modelo. La atención elige el conector a partir del modelo cargado. La llamada usa el identificador del equipo o del chip, no un barrido de toda la flota.

**Resultado que se guarda.** Hora de la consulta, éxito o fallo, valores devueltos (temperatura y los puntos que el conector declare) y un extracto de la respuesta. Eso es la “toma de datos” del caso.

**Si falla.** La atención permanece en `en_prueba`. El operador puede reintentar. Cerrar sin prueba exige la excepción auditada de RN-62.

El contrato concreto (URL, autenticación, campos) se escribe cuando se tenga la especificación de cada plataforma de máquina. El diseño deja la interfaz estable:

```text
probar(modelo, identificadorEquipo) → { ok, resumen, lecturas, crudo }
```

## 5. API de plataforma de usuarios

**Para qué.** Al terminar la prueba, dejar al cliente con acceso: usuario nuevo con contraseña generada, o asignación a una cuenta que ya existe.

**Cómo.**

- Alta: la plataforma devuelve el usuario y la contraseña inicial. SGIT la cifra, la muestra una vez en pantalla y la incluye en el reporte al comercial.
- Asignación: el operador busca la cuenta existente y confirma. No se regenera contraseña salvo acción explícita.

**Idempotencia.** La misma atención no pide dos altas. Un reintento consulta si el alta anterior llegó a crearse antes de pedir otra.

**Si falla.** La atención queda en `en_plataforma`. No se avisa al comercial a medias: o salen accesos y reporte juntos, o no sale el cierre.

## Matriz de responsabilidad

| Dato | Sistema dueño | SGIT guarda |
| --- | --- | --- |
| Correo y adjuntos | Gmail | Réplica para operar aunque el mensaje se archive |
| Estado de la venta y del ticket | Odoo | Id y último estado leído |
| Stock y MO contable | Odoo | Id de MO, líneas pedidas, fotos |
| Código que despacho asigna | Lo dice despacho; lo confirma desarrollo | Código confirmado en la atención |
| Evidencias, incidentes, cita operativa | SGIT | Fuente de verdad |
| Usuario de monitoreo | Plataforma | Referencia, secreto cifrado, constancia de entrega |
| Lectura de prueba | API del equipo | Copia de esa toma |

## Secretos

| Secreto | Dónde |
| --- | --- |
| Refresh token de Gmail | Secreto cifrado de la aplicación |
| Credencial del usuario técnico de Odoo | Secreto de entorno |
| Sesión de WhatsApp | Disco del bot, backup cifrado, un solo proceso |
| Tokens de API de equipo y de plataforma | Secreto de entorno |
| Contraseña entregada al cliente | Campo cifrado en `CuentaPlataforma`, nunca en logs |

## Orden de aparición en el plan

Gmail en Fase 1, WhatsApp en Fase 2, lectura Odoo en Fase 3, escritura de MO en Fase 4, APIs de equipo y plataforma más el correo de cierre en Fase 5. Así cada fase se puede probar con el sistema anterior ya estable, y un conector que aún no existe no bloquea la bandeja ni la bitácora.
