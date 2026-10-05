CREATE TABLE IF NOT EXISTS mensaje_whatsapp (
  id uuid PRIMARY KEY,
  direccion text NOT NULL CHECK (direccion IN ('enviado', 'recibido')),
  telefono text NOT NULL,
  texto text NOT NULL,
  aviso_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensaje_whatsapp_fecha ON mensaje_whatsapp (creado_en DESC);
