ALTER TABLE salida_whatsapp DROP CONSTRAINT IF EXISTS salida_whatsapp_telefono_key;

CREATE INDEX IF NOT EXISTS salida_whatsapp_telefono ON salida_whatsapp (telefono, creado_en DESC);
