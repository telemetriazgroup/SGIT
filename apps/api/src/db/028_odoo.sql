CREATE TABLE IF NOT EXISTS lectura_odoo (
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  clase text NOT NULL CHECK (clase IN ('venta', 'ticket')),
  vinculo text NOT NULL CHECK (vinculo IN ('unico', 'sin_vinculo', 'ambiguo')),
  odoo_id integer,
  estado text,
  candidatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  aviso text,
  leido_en timestamptz NOT NULL DEFAULT now(),
  fallo_en timestamptz,
  PRIMARY KEY (tarea_id, clase)
);

CREATE TABLE IF NOT EXISTS vinculo_odoo (
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  clase text NOT NULL CHECK (clase IN ('venta', 'ticket')),
  odoo_id integer NOT NULL,
  PRIMARY KEY (tarea_id, clase)
);
