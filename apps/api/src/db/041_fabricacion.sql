CREATE TABLE IF NOT EXISTS fabricacion (
  id uuid PRIMARY KEY,
  hilo_id uuid NOT NULL UNIQUE REFERENCES hilo_atencion (id) ON DELETE CASCADE,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  odoo_id integer,
  nombre text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'borrador',
  token text NOT NULL UNIQUE,
  materiales jsonb NOT NULL DEFAULT '[]',
  chip_celular text NOT NULL DEFAULT '',
  chip_imei text NOT NULL DEFAULT '',
  modem_serie text NOT NULL DEFAULT '',
  ejecutor text NOT NULL DEFAULT '',
  reutilizada boolean NOT NULL DEFAULT false,
  telefono text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fabricacion DROP CONSTRAINT IF EXISTS fabricacion_estado_check;
ALTER TABLE fabricacion ADD CONSTRAINT fabricacion_estado_check
  CHECK (estado IN ('borrador', 'propuesta', 'confirmada', 'incidente'));
