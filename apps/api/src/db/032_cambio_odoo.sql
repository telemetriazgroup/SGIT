CREATE TABLE IF NOT EXISTS cambio_odoo (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  clase text NOT NULL CHECK (clase IN ('venta', 'ticket')),
  texto text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cambio_odoo_tarea ON cambio_odoo (tarea_id, creado_en);
