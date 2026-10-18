CREATE TABLE IF NOT EXISTS asignacion_archivo (
  id uuid PRIMARY KEY,
  asignacion_id uuid NOT NULL REFERENCES asignacion_despacho (id) ON DELETE CASCADE,
  clave text NOT NULL,
  mime text NOT NULL,
  nombre text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aviso ADD COLUMN IF NOT EXISTS referencia_id uuid;

ALTER TABLE turno_despacho ADD COLUMN IF NOT EXISTS pregunta text;

CREATE TABLE IF NOT EXISTS aviso_adjunto (
  id uuid PRIMARY KEY,
  aviso_id uuid NOT NULL REFERENCES aviso (id) ON DELETE CASCADE,
  clave text NOT NULL,
  mime text NOT NULL,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0
);
