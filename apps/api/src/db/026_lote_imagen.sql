CREATE TABLE IF NOT EXISTS nota_archivo (
  id uuid PRIMARY KEY,
  nota_id uuid NOT NULL REFERENCES nota_bitacora (id) ON DELETE CASCADE,
  clave text NOT NULL,
  mime text NOT NULL,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lote_imagen (
  id uuid PRIMARY KEY,
  telefono text NOT NULL,
  tarea_id uuid,
  tipo text NOT NULL,
  clave text NOT NULL,
  mime text NOT NULL,
  nombre text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS codigo_ocr text;
ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS tipo_ocr text;
ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS confianza double precision;
ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS imagen_externa text;
ALTER TABLE asignacion_archivo ADD COLUMN IF NOT EXISTS codigo_firme text;

ALTER TABLE asignacion_despacho ADD COLUMN IF NOT EXISTS procesando_en timestamptz;

CREATE TABLE IF NOT EXISTS lectura_aprendida (
  codigo_ocr text PRIMARY KEY,
  codigo_firme text NOT NULL,
  tipo text NOT NULL,
  veces int NOT NULL DEFAULT 1,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  nombre text;
BEGIN
  SELECT con.conname INTO nombre
  FROM pg_constraint con
  WHERE con.conrelid = 'aviso'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%tipo%';
  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aviso DROP CONSTRAINT %I', nombre);
  END IF;
END $$;

ALTER TABLE aviso ADD CONSTRAINT aviso_tipo_check CHECK (
  tipo IN (
    'tarea_nueva', 'reprogramacion', 'prueba', 'consulta_despacho', 'aviso_snooze',
    'apertura_despacho', 'asignacion_despacho', 'consulta_lote', 'consulta_chip'
  )
);
