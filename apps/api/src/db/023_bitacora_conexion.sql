CREATE TABLE IF NOT EXISTS bitacora_conexion (
  id uuid PRIMARY KEY,
  servicio text NOT NULL CHECK (servicio IN ('gmail', 'whatsapp')),
  nivel text NOT NULL CHECK (nivel IN ('info', 'fallo')),
  texto text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bitacora_conexion_reciente ON bitacora_conexion (creado_en DESC);

ALTER TABLE sesion_bot ADD COLUMN IF NOT EXISTS olvidar boolean NOT NULL DEFAULT false;
