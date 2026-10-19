ALTER TABLE lectura_odoo ADD COLUMN IF NOT EXISTS copia jsonb;

CREATE TABLE IF NOT EXISTS configuracion_odoo (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url text NOT NULL DEFAULT '',
  db text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  clave text NOT NULL DEFAULT '',
  modelo_venta text NOT NULL DEFAULT 'sale.order',
  campo_cot text NOT NULL DEFAULT 'name',
  modelo_tarea text NOT NULL DEFAULT 'project.task',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
