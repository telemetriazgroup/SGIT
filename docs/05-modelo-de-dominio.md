# Modelo de dominio

## Vista de conjunto

```text
Buzon 1──* MensajeCorreo *──* Adjunto
              │
              │ clasificacion
              ▼
           Tarea 1──* SituacionHilo
              │ 1
              │ * 
              ├──* Seguimiento
              ├──* Incidente
              ├──* Recordatorio
              └──* AtencionTelemetria 1──0..1 OrdenFabricacion 1──* LineaMaterial
                                              │
                                              ├──* Evidencia
                                              ├── 0..1 PruebaConexion
                                              └── 0..1 CuentaPlataforma
```

Odoo no se modela como entidad local completa. Se guardan referencias (`odooSaleId`, `odooTicketId`, `odooMoId`) y una copia de los campos que la operación necesita ver sin volver a preguntar en cada pantalla.

## Entidades

### Buzón

Cuenta Gmail conectada. Guarda el correo, el refresh token cifrado, el `historyId`, la última sync exitosa y el estado (`ok`, `reintentando`, `requiere_reautorizacion`).

### Mensaje de correo

| Campo | Notas |
| --- | --- |
| `gmailMessageId`, `gmailThreadId` | Identidad externa |
| de, para, cc, fecha, asunto | Cabecera |
| `html`, `texto` | Cuerpo |
| `htmlSeguro` | Para render en la app, con `cid` resueltos |
| clasificación | `evento_desarrollo`, `revisar`, `ajeno` |
| extracción | JSON más fragmentos de origen |
| estado de réplica | `completo` o `incompleto` |

Inmutable después de importado. Una nueva corrección humana no pisa el HTML.

### Adjunto

Archivo de Gmail o foto subida por el equipo. Tipo: `gmail`, `inline`, `seguimiento`, `incidente`, `mo_firmada`, `recepcion_almacen`, `instalacion`. Metadatos: nombre, mime, tamaño, hash, ruta en el almacén.

### Tarea

Expediente de una COT.

| Campo | Origen típico |
| --- | --- |
| `cot` | Asunto, normalizada |
| `ticketVentas` | Asunto |
| descripción, lugar, cliente | Tramo final del asunto |
| cantidad de telemetrías | Bloque ZTRACK |
| contenedor (texto y cantidad) | Bloque DESPACHO |
| temperatura, producto | Datos del cuerpo, opcionales |
| comercial: nombre, cargo, correo, teléfono | Firma |
| cita vigente: fecha, hora, dirección, mapa | Bloque de entrega |
| `odooSaleId`, `odooTicketId` | Resolución posterior |
| estado | Ver máquina de estados |
| responsable | Miembro que la toma |

### Situación de hilo

Un mensaje del hilo ya vinculado. Tipos: `origen`, `informativa`, `avance_de_area`, `reprogramacion`, `incidente_reportado`. Guarda el resumen, el mensaje fuente y, si aplica, la cita que reemplazó.

### Seguimiento

Nota del equipo sobre la atención del día a día. Autor, canal, texto, imágenes. Es el hecho que saca la tarea del recordatorio horario. Ejemplos del caso: “Johan dice que no hay equipo asignado”, “Angie dice que la máquina está en reparación”.

### Incidente

Hecho anormal, registrable en cualquier estado no archivado. Tipo (despacho, técnica, almacén, transporte, instalación, plataforma, otro), texto, imágenes, atención opcional. Entra al anexo de cierre.

### Recordatorio

`horario` (generado por el barrido) o `snooze` (pedido por el operador, con `recordarEn`). Estado: `pendiente`, `enviado`, `cancelado`.

### Atención de telemetría

Una unidad a instalar dentro de la tarea.

| Campo | Notas |
| --- | --- |
| secuencia | 1..N dentro de la tarea |
| código de equipo, máquina, modelo, chip, contenedor | Los confirma el equipo |
| estado | Máquina de abajo |
| motivo si la cantidad difiere del correo | Texto obligatorio |

### Orden de fabricación

| Campo | Notas |
| --- | --- |
| `odooMoId` | Nulo hasta que Odoo acepta |
| clave de idempotencia | Por atención |
| estado local | `borrador`, `creada`, `foto_solicitud`, `incidente_almacen`, `recibida`, `no_necesaria` |
| líneas | Producto Odoo, descripción, cantidad pedida, cantidad recibida |

### Evidencia

Foto o archivo ligado a la atención y a un paso: solicitud de MO, recepción, dispositivo, contenedor, máquina, chip, prueba.

### Prueba de conexión

Modelo usado para elegir el conector, instante, éxito o fallo, resumen y respuesta cruda acotada (sin secretos).

### Cuenta de plataforma

Tipo `alta` o `asignacion`, identificador de cuenta, usuario, secreto cifrado, quién la generó y cuándo se entregó al comercial.

### Diccionario de clasificación

Término, peso, activo, y si exige combinarse con otra señal. Editable por el administrador.

### Usuario SGIT

Nombre, teléfono de WhatsApp (para atar el chat al miembro), rol (`operador`, `administrador`), activo.

## Estados de la tarea

```text
detectada ──▶ en_seguimiento ──▶ en_atencion ──▶ lista_para_cierre ──▶ cerrada
    │                │                 │
    └────▶ en_validacion ┘             └──▶ (vuelve a en_seguimiento si se pausa)
                 │
                 └── al vencer el snooze, se recuerda y sigue en_validacion
                      hasta que alguien la mueve
```

| Estado | Significado |
| --- | --- |
| `detectada` | Nació del correo. Todavía no hay nota del equipo. Entra al barrido horario |
| `en_validacion` | El equipo pidió que le recuerden en N horas. Fuera del barrido hasta el vencimiento |
| `en_seguimiento` | Hay al menos un avance. Fuera del barrido horario. Puede seguir recibiendo incidentes |
| `en_atencion` | Hay al menos una atención abierta |
| `lista_para_cierre` | Todas las atenciones cerradas o canceladas. Falta la confirmación y los envíos |
| `cerrada` | Avisos de cierre registrados |
| `cancelada` | La operación no se instalará. Motivo obligatorio. No se avisa usuario de plataforma |

## Estados de la atención

```text
por_iniciar
    ├─▶ materiales_no_necesarios ─────────────▶ en_instalacion
    └─▶ materiales_en_solicitud
            ├─▶ esperando_almacen ──▶ materiales_recibidos ──▶ en_instalacion
            └─▶ incidente_almacen (sigue esperando o se reintenta)
en_instalacion ──▶ en_prueba ──▶ en_plataforma ──▶ cerrada
cualquier estado previo al cierre ──▶ cancelada
```

| Transición | Condición |
| --- | --- |
| A `materiales_en_solicitud` | MO creada en Odoo |
| A `esperando_almacen` | Foto de la MO firmada cargada |
| A `materiales_recibidos` | Foto de recepción y confirmación |
| A `en_instalacion` | Materiales recibidos o no necesarios |
| A `en_prueba` | Evidencia mínima de instalación completa |
| A `en_plataforma` | Prueba exitosa, o excepción de administrador |
| A `cerrada` | Cuenta de plataforma creada o asignada |
| A `cancelada` | Motivo. Si había MO abierta, hay que definir su destino en Odoo antes de cancelar |

## Línea de tiempo

La ficha no tiene varias “historias” sueltas. Proyecta en orden cronológico:

1. Mensaje origen y sus situaciones de hilo.
2. Cambios de cita.
3. Seguimientos e incidentes.
4. Cambios de estado de tarea y de cada atención.
5. MO, fotos y errores de Odoo.
6. Prueba de conexión.
7. Alta de usuario (sin la contraseña en claro).
8. Envíos a despacho y al comercial.

## Correspondencia con el correo de ejemplo

| Dato del caso | Dónde queda |
| --- | --- |
| `COT 10020263623` | `Tarea.cot` |
| `TICKET DE VENTAS #2139` | `Tarea.ticketVentas` |
| Alquiler reefer 40 RH + transporte | `Tarea.descripcion` |
| MAKRO HUACHO | `Tarea.lugar` |
| MAKRO SUPERMAYORISTA S.A. | `Tarea.cliente` |
| 01 contenedor Reefer 40rh … | `Tarea.contenedorTexto` |
| 12/09/2026, 10 AM | Cita vigente |
| Ave San Martin 580, Huacho + mapa | Cita vigente |
| −21 °C, congelados | `Tarea.temperatura`, `Tarea.producto` |
| Bloque ZTRACK, 1 und | Clasificación alta y `cantidadTelemetrias = 1` |
| Olinda Lopez, comercial4@zgroup.com.pe, +51 981 322 944 | Comercial |
| Replies posteriores del mismo hilo | Situaciones, misma tarea |

## Lo que hay que descubrir en Odoo antes de modelar los id

El caso nombra “módulo de venta” y “servicio externo como ticket o tarea”. El nombre técnico del modelo (`sale.order`, `project.task`, `helpdesk.ticket` u otro) se fija en un inventario de la base real, en la Fase 0. Hasta entonces los campos `odooSaleId` y `odooTicketId` existen, y la pantalla muestra “sin vínculo” si la búsqueda no encuentra un único documento.
