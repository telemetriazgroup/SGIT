ALTER TABLE chip ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'sin_dato';
ALTER TABLE chip ADD COLUMN IF NOT EXISTS telemetria text NOT NULL DEFAULT '';
ALTER TABLE chip ADD COLUMN IF NOT EXISTS orden_mo text NOT NULL DEFAULT '';
ALTER TABLE chip ADD COLUMN IF NOT EXISTS ocupado_en timestamptz;
ALTER TABLE chip ADD COLUMN IF NOT EXISTS odoo_leido_en timestamptz;
ALTER TABLE chip ADD COLUMN IF NOT EXISTS odoo_aviso text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS chip_cambio (
  id uuid PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES chip (id) ON DELETE CASCADE,
  texto text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chip_cambio_chip ON chip_cambio (chip_id, creado_en);

CREATE TABLE IF NOT EXISTS chip_movimiento (
  id uuid PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES chip (id) ON DELETE CASCADE,
  cuando timestamptz,
  referencia text NOT NULL DEFAULT '',
  producto text NOT NULL DEFAULT '',
  desde text NOT NULL DEFAULT '',
  hacia text NOT NULL DEFAULT '',
  cantidad numeric,
  UNIQUE (chip_id, referencia, producto, desde, hacia)
);
