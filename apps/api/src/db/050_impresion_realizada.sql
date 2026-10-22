CREATE TABLE IF NOT EXISTS impresion_realizada (
  id uuid PRIMARY KEY,
  via text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  clave text NOT NULL DEFAULT '',
  external_id text NOT NULL DEFAULT '',
  trabajo_id text NOT NULL DEFAULT '',
  estado text NOT NULL,
  respuesta text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  autor text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS impresion_realizada_fecha ON impresion_realizada (creado_en DESC);
