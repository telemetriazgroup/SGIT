CREATE TABLE IF NOT EXISTS buzon (
  id uuid PRIMARY KEY,
  correo text NOT NULL UNIQUE,
  refresh_token_cifrado text,
  history_id text,
  ultima_sync_ok timestamptz,
  estado text NOT NULL DEFAULT 'sin_conectar',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mensaje_correo (
  id uuid PRIMARY KEY,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text NOT NULL,
  de text NOT NULL DEFAULT '',
  para text NOT NULL DEFAULT '',
  cc text NOT NULL DEFAULT '',
  fecha timestamptz,
  asunto text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  texto text NOT NULL DEFAULT '',
  html_seguro text NOT NULL DEFAULT '',
  replica text NOT NULL DEFAULT 'incompleto',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adjunto_correo (
  id uuid PRIMARY KEY,
  mensaje_id uuid NOT NULL REFERENCES mensaje_correo (id),
  gmail_attachment_id text NOT NULL,
  content_id text,
  nombre text NOT NULL,
  mime text NOT NULL,
  tamano integer NOT NULL DEFAULT 0,
  clave_almacen text,
  tipo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  UNIQUE (mensaje_id, gmail_attachment_id)
);

CREATE INDEX IF NOT EXISTS mensaje_correo_fecha ON mensaje_correo (fecha DESC);
