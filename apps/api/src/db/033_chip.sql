CREATE TABLE IF NOT EXISTS chip (
  id uuid PRIMARY KEY,
  producto text NOT NULL,
  marca text NOT NULL DEFAULT '',
  imei text NOT NULL,
  celular text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chip_imei_unica ON chip (imei);
