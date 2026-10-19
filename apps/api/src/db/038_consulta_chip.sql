CREATE TABLE IF NOT EXISTS consulta_chip (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  tecnico_telefono text NOT NULL,
  tecnico_nombre text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente',
  imei text NOT NULL DEFAULT '',
  celular text NOT NULL DEFAULT '',
  detalle text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now(),
  leido_en timestamptz
);

CREATE INDEX IF NOT EXISTS consulta_chip_pendiente ON consulta_chip (estado, creado_en);
