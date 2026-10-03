# SGIT — Sistema de Gestión de Instalación de Telemetrías

Sistema operativo del área de desarrollo de ZGroup para detectar solicitudes de telemetría que llegan por Gmail, convertirlas en tareas únicas por cotización y acompañarlas hasta la instalación, la prueba de conexión y la entrega de accesos.

La casuística de origen está en [`caso_sgit.md`](caso_sgit.md). El cliente de WhatsApp ya usado en la operación está descrito en [`bot_wattsap.md`](bot_wattsap.md).

## Qué resuelve

Hoy la solicitud nace en un correo de “ASIGNAR Y DESPACHAR”, se mezcla con despacho, almacén, técnica, transporte y SSOMA, y el área de desarrollo tiene que detectar a mano el bloque ZTRACK, perseguir el código del equipo y cerrar la instalación con evidencias y usuarios de plataforma.

SGIT hace cuatro cosas:

1. Replica el buzón relevante y clasifica los correos que involucran telemetría.
2. Abre **una tarea por cotización (COT)** y cuelga en ella todo el hilo posterior, sin duplicar.
3. Coordina al equipo (3 o 4 personas) por la aplicación y por el bot de WhatsApp.
4. Ejecuta la atención: materiales en Odoo, instalación, prueba de conexión, usuario de plataforma y aviso a despacho y al comercial.

## Cómo leer esta documentación

| Documento | Para qué sirve |
| --- | --- |
| [Visión y alcance](docs/01-vision-y-alcance.md) | Problema, límites del sistema, principios y lo que queda fuera |
| [Casos de uso](docs/02-casos-de-uso.md) | Actores y casos, con flujos de los críticos |
| [Reglas de negocio](docs/03-reglas-de-negocio.md) | Idempotencia, recordatorios, cierre y extracción del correo |
| [Arquitectura](docs/04-arquitectura.md) | Módulos, stack, procesos y estructura del repositorio |
| [Modelo de dominio](docs/05-modelo-de-dominio.md) | Entidades, estados y relaciones |
| [Integraciones](docs/06-integraciones.md) | Gmail, Odoo, WhatsApp, API de conexión y plataforma |
| [Flujos operativos](docs/07-flujos-operativos.md) | Recorrido de punta a punta con el correo de ejemplo |
| [Plan y fases](docs/08-plan-y-fases.md) | Orden de construcción, entregables y dependencias |
| [Sprints](sprint_sgit.md) | 16 sprints, entregable de cada viernes y pruebas por proceso |
| [Requisitos, riesgos y seguridad](docs/09-requisitos-riesgos-seguridad.md) | Lo no funcional, amenazas y controles |
| [Backlog y aceptación](docs/10-backlog-y-criterios-de-aceptacion.md) | Historias iniciales y definición de hecho |
| [Ejemplo de correo](docs/ejemplos/correo-cot-10020263623.md) | Fixture del caso real para diseñar el parser |

## Decisiones que ordenan todo el diseño

- La unidad de trabajo es la **cotización (COT)**, no el mensaje de correo.
- Cada respuesta del hilo es una **situación** de la misma tarea: avance, reprogramación o incidente de otra área.
- El bloque **ZTRACK** es la señal fuerte de que el correo nos convoca.
- Odoo sigue siendo el sistema de ventas, tickets y fabricación. SGIT orquesta la instalación y guarda la evidencia.
- El bot usa `whatsapp-web.js` (sesión de WhatsApp Web), en un proceso aparte del API, con envíos espaciados.
- Las tareas con avance salen del recordatorio horario. Un incidente nuevo siempre se puede registrar.
- Zona horaria de operación: `America/Lima`. Ventana de consulta automática: 08:00 a 18:00.

## Estructura prevista del repositorio

```text
SGIT/
├── caso_sgit.md
├── bot_wattsap.md
├── README.md
├── docs/
├── fixtures/emails/          # correos reales anonimizados para el parser
├── apps/
│   ├── api/                  # dominio, sync, Odoo, reportes
│   ├── web/                  # operación del equipo
│   └── bot/                  # whatsapp-web.js, menús, outbox
└── packages/
    └── shared/               # contratos y tipos compartidos
```

La implementación de `apps/` empieza en la Fase 0 del [plan](docs/08-plan-y-fases.md). El corte semanal está en [sprint_sgit.md](sprint_sgit.md).

## Sprint 0

El esqueleto local ya está: API, web de ingreso, bot hasta el QR, PostgreSQL, Redis y almacén de archivos. Cómo levantarlo está en [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md). El acta que el área tiene que completar y firmar está en [docs/acta-descubrimientos.md](docs/acta-descubrimientos.md).
