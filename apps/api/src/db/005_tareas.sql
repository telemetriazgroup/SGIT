ALTER TABLE mensaje_correo ADD COLUMN IF NOT EXISTS clasificacion text;
ALTER TABLE mensaje_correo ADD COLUMN IF NOT EXISTS extraccion jsonb;

CREATE TABLE IF NOT EXISTS termino_diccionario (
  id uuid PRIMARY KEY,
  termino text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO termino_diccionario (id, termino)
VALUES
  (gen_random_uuid(), 'eusebio'),
  (gen_random_uuid(), 'luis'),
  (gen_random_uuid(), 'telemetria'),
  (gen_random_uuid(), 'ztrack'),
  (gen_random_uuid(), 'usuario y contrasena'),
  (gen_random_uuid(), 'acceso a la plataforma')
ON CONFLICT (termino) DO NOTHING;

CREATE TABLE IF NOT EXISTS tarea (
  id uuid PRIMARY KEY,
  cot text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'detectada',
  ticket text,
  descripcion text,
  lugar text,
  cliente text,
  cantidad integer,
  temperatura text,
  producto text,
  contenedor text,
  comercial_nombre text,
  comercial_cargo text,
  comercial_correo text,
  comercial_telefono text,
  cita_fecha date,
  cita_hora text,
  cita_direccion text,
  cita_mapa text,
  cita_parcial_fecha date,
  cita_parcial_hora text,
  fragmentos jsonb NOT NULL DEFAULT '{}',
  mensaje_id uuid REFERENCES mensaje_correo (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);
