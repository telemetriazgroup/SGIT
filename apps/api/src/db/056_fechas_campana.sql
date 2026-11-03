CREATE INDEX IF NOT EXISTS mensaje_correo_hilo_fecha ON mensaje_correo (gmail_thread_id, fecha DESC, creado_en DESC);

CREATE TABLE IF NOT EXISTS plantilla_campana (
  id uuid PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true,
  columnas jsonb NOT NULL DEFAULT '[]',
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plantilla_campana (id, nombre, columnas)
VALUES (
  gen_random_uuid(),
  'Cronograma',
  '[
    {"alias":"n","campo":"orden"},
    {"alias":"cadena","campo":"cadena"},
    {"alias":"tienda","campo":"tienda"},
    {"alias":"contacto","campo":"contacto"},
    {"alias":"celular","campo":"celular"},
    {"alias":"fecha de entrega","campo":"entregaFecha"},
    {"alias":"hora de entrega","campo":"entregaHora"},
    {"alias":"status","campo":"status"},
    {"alias":"tamano reefer","campo":"tamano"},
    {"alias":"direccion de entrega","campo":"direccion"},
    {"alias":"maps","campo":"mapa"},
    {"alias":"mapa","campo":"mapa"}
  ]'::jsonb
)
ON CONFLICT (nombre) DO NOTHING;
