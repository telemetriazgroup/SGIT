ALTER TABLE usuario ADD COLUMN IF NOT EXISTS consulta_despacho boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS asignacion_despacho (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  autor_correo text NOT NULL,
  autor_nombre text NOT NULL,
  texto text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'recogiendo',
  creado_en timestamptz NOT NULL DEFAULT now(),
  confirmada_en timestamptz
);

ALTER TABLE asignacion_despacho DROP CONSTRAINT IF EXISTS asignacion_despacho_estado_check;
ALTER TABLE asignacion_despacho ADD CONSTRAINT asignacion_despacho_estado_check
  CHECK (estado IN ('recogiendo', 'por_validar', 'confirmada', 'aceptada', 'reconsulta', 'descartada'));

CREATE TABLE IF NOT EXISTS turno_despacho (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  telefono_dueno text,
  estado text NOT NULL,
  abierto_en timestamptz NOT NULL DEFAULT now(),
  ultimo_mensaje_en timestamptz
);

ALTER TABLE turno_despacho DROP CONSTRAINT IF EXISTS turno_despacho_estado_check;
ALTER TABLE turno_despacho ADD CONSTRAINT turno_despacho_estado_check
  CHECK (estado IN ('en_cola', 'en_curso', 'cerrada', 'reconsulta'));

CREATE UNIQUE INDEX IF NOT EXISTS turno_despacho_en_curso
  ON turno_despacho ((true))
  WHERE estado = 'en_curso';

CREATE UNIQUE INDEX IF NOT EXISTS turno_despacho_abierto
  ON turno_despacho (tarea_id)
  WHERE estado IN ('en_cola', 'en_curso', 'reconsulta');
