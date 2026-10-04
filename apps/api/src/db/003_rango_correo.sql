CREATE TABLE IF NOT EXISTS rango_correo (
  id uuid PRIMARY KEY,
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
