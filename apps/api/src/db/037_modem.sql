CREATE TABLE IF NOT EXISTS modem (
  id uuid PRIMARY KEY,
  odoo_id integer NOT NULL,
  serie text NOT NULL,
  producto text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'disponible',
  orden_mo text NOT NULL DEFAULT '',
  chip text NOT NULL DEFAULT '',
  salida text NOT NULL DEFAULT '',
  cantidad numeric NOT NULL DEFAULT 0,
  ocupado_en timestamptz,
  leido_en timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS modem_odoo_unica ON modem (odoo_id);
CREATE UNIQUE INDEX IF NOT EXISTS modem_serie_unica ON modem (serie);

CREATE TABLE IF NOT EXISTS modem_movimiento (
  id uuid PRIMARY KEY,
  modem_id uuid NOT NULL REFERENCES modem (id) ON DELETE CASCADE,
  odoo_linea integer NOT NULL,
  cuando timestamptz,
  referencia text NOT NULL DEFAULT '',
  desde text NOT NULL DEFAULT '',
  hacia text NOT NULL DEFAULT '',
  cantidad numeric,
  estado text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS modem_linea_unica ON modem_movimiento (odoo_linea);
