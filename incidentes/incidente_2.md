# Incidente 2: la lista de tareas consulta una columna que Postgres no tiene

Fecha: 9 de noviembre de 2026, 22:55 UTC. Servidor `ztrackperu2025`, proyecto en `/home/ztrack/mongo/Proyectos/SGIT`. La pantalla es `https://ztrack.app/SGIT/`.

## Qué se vio

Al abrir Tareas, la API responde error y la lista no carga. En el registro de `api-1` queda:

```text
ERROR [ExceptionsHandler] error: column abierta.archivada does not exist
code: 42703
routine: errorMissingColumn
at async TareasService.listar (/app/apps/api/src/tareas/tareas.service.ts:177:23)
```

Postgres, en `postgres-1`, repite el mismo fallo a las 22:55:57 UTC: `column abierta.archivada does not exist at character 1166`. El código `42703` es columna inexistente. No es un permiso ni un corte de red.

La consulta que falla es el listado de tareas. Pide el conteo de tiendas así:

```sql
(SELECT count(*)::int FROM tienda WHERE tienda.tarea_id = tarea.id AND NOT tienda.archivada) AS locales
```

Y la fecha urgente de la campaña sale de `tienda abierta` con `AND NOT abierta.archivada`. Esa condición está en `joinUrgente` (`apps/api/src/tareas/prioridad.ts`). El listado la usa para ordenar. Las dos lecturas asumen que `tienda.archivada` ya existe.

## Por qué la columna no está

`archivada` se agrega en `apps/api/src/db/061_tienda_archivada.sql`:

```sql
ALTER TABLE tienda ADD COLUMN IF NOT EXISTS archivada boolean NOT NULL DEFAULT false;
```

Ese archivo entra al arrancar el API. `PrepararBase` lee `apps/api/src/db/*.sql` en `onModuleInit`, antes de atender peticiones. El proceso que contestó a las 22:55 ya ejecuta el código nuevo (el SQL del registro incluye `archivada` y `tarea.proyecto`), pero la tabla `tienda` sigue sin la columna. La migración 061 no se aplicó en ese arranque: el archivo no estaba en la carpeta del servidor cuando `PrepararBase` corrió, o el proceso recargó el TypeScript sin volver a pasar por el alta de la base.

Mientras la columna falte, cualquier lista que arme la fecha urgente o cuente tiendas activas cae igual. Inventario y conciliación, que también leen `archivada`, quedan en el mismo estado en cuanto se consultan.

## Qué lo deja bien

`061_tienda_archivada.sql` tiene que estar en el servidor, junto al resto de `apps/api/src/db/`. Después se reinicia el servicio `api` para que `PrepararBase` ejecute el `ALTER TABLE`. `IF NOT EXISTS` no borra tiendas ni cambia las que ya están: todas quedan con `archivada = false`.

Recargar solo el TypeScript no crea la columna. El alta ocurre al iniciar el módulo, no en cada consulta.

## Estado

| Hecho | Relación |
| --- | --- |
| Lista de tareas, 22:55 UTC | Falla. Postgres no tiene `tienda.archivada`. |
| Código en marcha | Ya filtra tiendas archivadas en el conteo y en la fecha urgente. |
| Migración `061_tienda_archivada.sql` | Escrita. No aplicada en la base que atendió esa consulta. |
| Tiendas ya guardadas | Siguen. Al aplicar la migración nacen como no archivadas. |
