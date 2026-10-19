CREATE TABLE IF NOT EXISTS hilo_atencion (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  orden integer NOT NULL,
  estado text NOT NULL DEFAULT 'abierto',
  lleva_telemetria boolean,
  contenedor text,
  maquina text,
  despacho_texto text,
  chip_imei text,
  chip_celular text,
  despacho_validado boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, orden)
);

ALTER TABLE hilo_atencion DROP CONSTRAINT IF EXISTS hilo_atencion_estado_check;
ALTER TABLE hilo_atencion ADD CONSTRAINT hilo_atencion_estado_check
  CHECK (estado IN ('abierto', 'listo'));

CREATE INDEX IF NOT EXISTS hilo_atencion_tarea ON hilo_atencion (tarea_id, orden);

ALTER TABLE nota_bitacora ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;

ALTER TABLE consulta_chip ADD COLUMN IF NOT EXISTS hilo_id uuid REFERENCES hilo_atencion (id) ON DELETE SET NULL;

ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS orden_equipo integer;

CREATE TABLE IF NOT EXISTS equipo_despacho (
  id uuid PRIMARY KEY,
  asignacion_id uuid NOT NULL REFERENCES asignacion_despacho (id) ON DELETE CASCADE,
  orden integer NOT NULL,
  texto text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente',
  UNIQUE (asignacion_id, orden)
);

ALTER TABLE equipo_despacho DROP CONSTRAINT IF EXISTS equipo_despacho_estado_check;
ALTER TABLE equipo_despacho ADD CONSTRAINT equipo_despacho_estado_check
  CHECK (estado IN ('pendiente', 'recibido'));
