# Requisitos no funcionales, riesgos y seguridad

## Requisitos no funcionales

| Id | Tema | Criterio |
| --- | --- | --- |
| RNF-01 | Frescura del buzón | Un correo nuevo queda importado en menos de 5 minutos más el tiempo de descarga de sus adjuntos, con la sync sana |
| RNF-02 | Idempotencia | Repetir una sync, un click de MO o un alta de usuario no duplica tarea, fabricación ni cuenta |
| RNF-03 | Disponibilidad de la ficha | Registrar seguimiento, incidente y fotos en la web funciona con el bot caído y con Odoo caído (Odoo muestra el último estado) |
| RNF-04 | Un solo bot | Una sola instancia con la sesión de WhatsApp. Un segundo proceso no arranca si ya hay líder |
| RNF-05 | Ventana horaria | El barrido no dispara fuera de 08:00–18:00 `America/Lima` ni en días no laborables configurados |
| RNF-06 | Tamaño | Adjuntos de correo y fotos de campo hasta el límite que se fije con el equipo (partida sugerida: 25 MB por archivo). Por encima, el mensaje queda incompleto y avisado |
| RNF-07 | Histórico | La carga inicial por fechas puede tardar; no bloquea la sync de lo reciente |
| RNF-08 | Auditoría | Autor, canal y fecha en bitácora y en acciones de credenciales, cierre, reapertura y excepción de prueba |
| RNF-09 | Retención | Correos y evidencias se conservan al menos el tiempo que el área legal indique. Partida de trabajo: mientras la operación esté vigente más 24 meses, revisable |
| RNF-10 | Idioma y zona | Interfaz en español. Fechas de correo `dd/mm/aaaa`. Relojes de negocio en Lima |
| RNF-11 | Uso en campo | La web de la ficha, la carga de fotos y el menú del bot se pueden usar desde el teléfono |
| RNF-12 | Observabilidad | Última sync, estado del bot y último error de cada integración, visibles para el administrador |

## Seguridad y datos personales

El sistema guarda correos comerciales, teléfonos, DNI solo si viene en un adjunto del hilo, fotos de instalaciones en tiendas de clientes y **contraseñas de la plataforma de monitoreo**.

| Control | Aplicación |
| --- | --- |
| Acceso a la web | Usuarios nominados del equipo. Sesión con vencimiento. Rol administrador aparte del operador |
| Buzón | Un refresh token cifrado. La app nunca pide la contraseña de Gmail |
| Odoo | Usuario técnico con lectura de lo necesario y alta de MO, sin administración de la base |
| WhatsApp | Solo números registrados escriben en tareas. El resto recibe rechazo y no se procesa el contenido como orden |
| Adjuntos | Se sirven autenticados, no por URL pública adivinable |
| HTML del correo | Se muestra saneado. Las imágenes salen del almacén propio |
| Contraseña de plataforma | Cifrada en base. Fuera de logs, traces y bitácora. Visible en el alta y dentro del reporte enviado. Reenvío auditado |
| Reportes | El PDF al comercial es el medio de entrega. No se replica la contraseña en el chat del equipo |
| Backups | Cifrados. La sesión de WhatsApp se trata como un secreto |
| Entornos | Staging no usa el buzón productivo ni crea usuarios reales de clientes |
| Secretos de desarrollo | Variables de entorno o almacén de secretos. Nada de tokens en git |

El correo de ejemplo incluye el teléfono y el correo de una persona del equipo comercial. Los fixtures que se copien al repositorio se anonimizan; el ejemplo de documentación puede conservar la forma del caso porque ya está en `caso_sgit.md`, y los archivos de prueba automáticos usan datos ficticios.

## Riesgos

| Id | Riesgo | Efecto | Tratamiento |
| --- | --- | --- | --- |
| RG-01 | WhatsApp Web cambia y `whatsapp-web.js` se desconecta | Se caen avisos y el menú | Web equivalente para la bitácora. Runbook de QR. Una sola sesión. Evaluar API oficial de Meta solo si el corte se vuelve frecuente |
| RG-02 | La sesión se usa como difusor y el número se restringe | Pérdida del canal | Outbox con pausa, destinatarios cerrados, sin campañas |
| RG-03 | Dos procesos del bot | Sesión inválida | Candado de líder |
| RG-04 | El parser falla con variantes del asunto | Tareas mal armadas o ruido | Cola `revisar`, campos con fragmento de origen, corrección que no pisa el humano, afinado en Fase 6 con hilos reales |
| RG-05 | Reenvíos con otra COT o sin COT | Duplicado o correo huérfano | RN-01 a RN-05. Ambiguo va a revisión |
| RG-06 | Cuota o token de Gmail | Buzón atrasado | Colas separadas, backoff, estado visible, el `historyId` no avanza a medias |
| RG-07 | Modelo Odoo distinto al supuesto | Lectura o MO contra el objeto equivocado | Fase 0 bloquea el desarrollo de los clientes Odoo hasta el inventario. No se hardcodea un modelo “de manual” sin ver la base |
| RG-08 | Doble click crea dos MO o dos usuarios | Material de más, dos accesos | Claves de idempotencia |
| RG-09 | Contraseña en un log o en un chat interno | Acceso de un cliente expuesto | RNF de secretos, revisión de logs en la prueba de Fase 5 |
| RG-10 | El comercial cambia la plantilla del correo | Cae la extracción | Diccionario y secciones configurables. El cuerpo completo sigue en la ficha |
| RG-11 | Foto o adjunto enorme | Sync trabada | Límite por archivo y mensaje `incompleto` reintentable |
| RG-12 | La API del equipo no está documentada a tiempo | No se puede declarar el cierre real | Fase 5 no se cierra con un conector simulado en producción. El resto del sistema sí opera |
| RG-13 | Feriados o domingos con barrido | Hostigamiento al equipo | Calendario laborable explícito |
| RG-14 | Operador registra como hecho un comentario de pasillo sin fuente | Bitácora engañosa | El texto es libre, como pide el caso, y queda el autor. No se presenta como dato de Odoo |

## Privacidad operativa del bot

El proceso guarda la sesión de un WhatsApp real. Quien administra el servidor puede, en principio, usar esa sesión. Mitigación: servidor acotado, backup cifrado, el número es el del área y no un WhatsApp personal de un empleado, y el runbook dice quién puede ver el QR.

## Cumplimiento práctico

No se diseña un módulo legal aparte. Sí se deja rastro de quién vio y quién reenvió credenciales de cliente, y se puede exportar la línea de tiempo de una COT si la operación o una auditoría interna la pide.

## Preguntas abiertas que la Fase 0 cierra

1. ¿Qué casilla se sincroniza: un buzón compartido del área o la casilla de una persona?
2. ¿El ticket de servicio externo es tarea de proyecto, mesa de ayuda u otro modelo?
3. ¿La MO debe nacer confirmada o en borrador para que almacén la procese?
4. ¿Qué familias de máquina entran en el primer conector?
5. ¿El usuario de plataforma lo crea siempre SGIT o a veces solo se asigna una cuenta de la cadena (Makro)?
6. ¿El reporte al comercial sale solo por correo?
7. ¿Qué feriados observa el barrido?
8. ¿Cuántos meses de histórico se cargan en el piloto?
