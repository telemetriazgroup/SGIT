ALTER TABLE tarea ADD COLUMN IF NOT EXISTS codigo_equipo text;
ALTER TABLE tarea ADD COLUMN IF NOT EXISTS maquina_equipo text;

ALTER TABLE recordatorio ADD COLUMN IF NOT EXISTS autor_correo text;

CREATE TABLE IF NOT EXISTS borrador_equipo (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  maquina text NOT NULL DEFAULT '',
  autor_correo text NOT NULL,
  autor_nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'descartado')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS borrador_equipo_pendiente
  ON borrador_equipo (tarea_id)
  WHERE estado = 'pendiente';
