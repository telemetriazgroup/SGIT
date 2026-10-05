CREATE TABLE IF NOT EXISTS asunto_interno (
  gmail_thread_id text PRIMARY KEY,
  estado text NOT NULL DEFAULT 'por_atender',
  respuesta text NOT NULL DEFAULT '',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
