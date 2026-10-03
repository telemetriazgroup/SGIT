# Documentación SGIT

Índice del diseño. El resumen ejecutivo y la estructura del repositorio están en el [README de la raíz](../README.md). La casuística original sigue en [`caso_sgit.md`](../caso_sgit.md).

| # | Documento | Contenido |
| --- | --- | --- |
| 1 | [Visión y alcance](01-vision-y-alcance.md) | Problema, usuarios, qué entra y qué no, principios |
| 2 | [Casos de uso](02-casos-de-uso.md) | Actores y UC-01 a UC-30 |
| 3 | [Reglas de negocio](03-reglas-de-negocio.md) | COT única, clasificación, recordatorios, materiales, cierre |
| 4 | [Arquitectura](04-arquitectura.md) | Procesos, módulos, stack, idempotencia |
| 5 | [Modelo de dominio](05-modelo-de-dominio.md) | Entidades y estados de tarea y atención |
| 6 | [Integraciones](06-integraciones.md) | Gmail, Odoo, WhatsApp, API de equipo, plataforma |
| 7 | [Flujos operativos](07-flujos-operativos.md) | Recorrido con la COT 10020263623 |
| 8 | [Plan y fases](08-plan-y-fases.md) | Fases 0 a 6 y dependencias |
| | [Sprints](../sprint_sgit.md) | Entregable mínimo y pruebas de cada sprint |
| | [Puesta en marcha](puesta-en-marcha.md) | Cómo levantar el sprint 0 |
| | [Acta de descubrimientos](acta-descubrimientos.md) | Modelos, casilla, feriados y firmas del sprint 0 |
| 9 | [Requisitos, riesgos y seguridad](09-requisitos-riesgos-seguridad.md) | No funcionales, secretos, riesgos, preguntas de la Fase 0 |
| 10 | [Backlog y aceptación](10-backlog-y-criterios-de-aceptacion.md) | Historias H-00 a H-62 |
| | [Correo de ejemplo](ejemplos/correo-cot-10020263623.md) | Fixture del extractor |

## Glosario

| Término | Significado en SGIT |
| --- | --- |
| COT | Número de cotización de la operación. Clave de la tarea. En el ejemplo, `10020263623` |
| Ticket de ventas | Número del servicio externo en Odoo. Se consulta; no identifica la tarea |
| ZTRACK | Sección del correo que pide asignar la telemetría y devolver los accesos. Señal principal de que el mensaje nos convoca |
| Tarea | Expediente único de una COT |
| Situación | Cada correo posterior del hilo, colgado de esa tarea |
| Seguimiento | Nota del equipo de desarrollo, con autor y foto opcional. Saca la tarea del recordatorio horario |
| Incidente | Hecho anormal registrable en cualquier momento, aunque ya haya avance |
| Atención | Una unidad de telemetría dentro de la tarea, con sus materiales, fotos y cierre |
| MO | Orden de fabricación en Odoo para pedir los materiales de una atención |
| Snooze | “En validación, recuérdame en N horas” |
| Plataforma | Sistema donde el cliente entra a ver la telemetría. Al cierre se crea o se asigna su usuario |
| Despacho | Johan y su área. Se les pide código y máquina, y al final se les avisa que ya pueden asignar el equipo |

## Orden de lectura sugerido

1. Visión y alcance, para fijar el límite del sistema.
2. Flujos operativos, para ver el caso de punta a punta.
3. Reglas de negocio, que son el contrato de implementación.
4. Modelo, arquitectura e integraciones, para construir.
5. Plan, backlog y riesgos, para ordenar el trabajo y la Fase 0.
