CREATE TABLE IF NOT EXISTS modem_orden (
  modem_id uuid PRIMARY KEY REFERENCES modem (id) ON DELETE CASCADE,
  odoo_id integer,
  nombre text NOT NULL DEFAULT '',
  copia jsonb NOT NULL DEFAULT '{}'::jsonb,
  leido_en timestamptz,
  marca text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS modem_orden_imagen (
  id uuid PRIMARY KEY,
  modem_id uuid NOT NULL REFERENCES modem (id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'image/png',
  contenido bytea NOT NULL
);
