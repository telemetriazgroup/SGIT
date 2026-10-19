CREATE TABLE IF NOT EXISTS chip_orden (
  chip_id uuid PRIMARY KEY REFERENCES chip (id) ON DELETE CASCADE,
  odoo_id integer,
  nombre text NOT NULL DEFAULT '',
  copia jsonb NOT NULL DEFAULT '{}'::jsonb,
  leido_en timestamptz
);

CREATE TABLE IF NOT EXISTS chip_orden_imagen (
  id uuid PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES chip (id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'image/png',
  contenido bytea NOT NULL
);
