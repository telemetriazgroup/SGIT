ALTER TABLE tarea ADD COLUMN IF NOT EXISTS campana boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS tienda (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  clave text NOT NULL,
  orden integer,
  cadena text NOT NULL DEFAULT '',
  nombre text NOT NULL,
  contacto text NOT NULL DEFAULT '',
  celular text NOT NULL DEFAULT '',
  entrega_fecha date,
  entrega_hora text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  tamano text NOT NULL DEFAULT '',
  direccion text NOT NULL DEFAULT '',
  mapa text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_seguimiento', 'resuelta')),
  codigo_equipo text,
  odoo_id integer,
  odoo_nombre text NOT NULL DEFAULT '',
  odoo_estado text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, clave)
);

CREATE TABLE IF NOT EXISTS servicio_odoo (
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  odoo_id integer NOT NULL,
  nombre text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  tienda_id uuid REFERENCES tienda (id) ON DELETE SET NULL,
  PRIMARY KEY (tarea_id, odoo_id)
);

ALTER TABLE nota_bitacora ADD COLUMN IF NOT EXISTS tienda_id uuid REFERENCES tienda (id) ON DELETE SET NULL;
