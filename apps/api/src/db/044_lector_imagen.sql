ALTER TABLE situacion_hilo ADD COLUMN IF NOT EXISTS cita_nueva jsonb;

CREATE TABLE IF NOT EXISTS configuracion_imagen (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url text NOT NULL DEFAULT '',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
