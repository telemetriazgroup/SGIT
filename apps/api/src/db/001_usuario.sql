CREATE TABLE IF NOT EXISTS usuario (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  correo text NOT NULL UNIQUE,
  contrasena_hash text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('operador', 'administrador')),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
