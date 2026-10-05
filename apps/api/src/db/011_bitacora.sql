ALTER TABLE tarea ADD COLUMN IF NOT EXISTS responsable_correo text;
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS responsable_nombre text;
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS recordar_en timestamptz;

DO $$ BEGIN
  ALTER TABLE tarea ADD CONSTRAINT tarea_estado
    CHECK (estado IN ('detectada', 'en_seguimiento', 'en_validacion'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS nota_bitacora (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('seguimiento', 'incidente', 'anulacion')),
  canal text NOT NULL CHECK (canal IN ('web', 'whatsapp')),
  texto text NOT NULL,
  autor_correo text NOT NULL,
  autor_nombre text NOT NULL,
  archivo_clave text,
  archivo_nombre text,
  archivo_mime text,
  anula_id uuid REFERENCES nota_bitacora (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nota_bitacora_tarea ON nota_bitacora (tarea_id, creado_en);

CREATE TABLE IF NOT EXISTS recordatorio (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('horario', 'snooze')),
  recordar_en timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'cancelado')),
  hora_bucket text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recordatorio_hora_unica
  ON recordatorio (tarea_id, hora_bucket)
  WHERE tipo = 'horario';

CREATE TABLE IF NOT EXISTS feriado (
  fecha date PRIMARY KEY,
  motivo text NOT NULL
);
