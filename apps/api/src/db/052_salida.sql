CREATE TABLE IF NOT EXISTS salida_whatsapp (
  id uuid PRIMARY KEY,
  telefono text NOT NULL UNIQUE,
  cuerpo text NOT NULL,
  contacto text NOT NULL,
  aviso_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salida_correo (
  id uuid PRIMARY KEY,
  direccion text NOT NULL,
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'fallo')),
  no_enviar_antes timestamptz NOT NULL,
  enviado_en timestamptz,
  error text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salida_correo_cola ON salida_correo (estado, no_enviar_antes);

DO $$
DECLARE
  nombre text;
BEGIN
  SELECT con.conname INTO nombre
  FROM pg_constraint con
  WHERE con.conrelid = 'aviso'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%tipo%';
  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aviso DROP CONSTRAINT %I', nombre);
  END IF;
END $$;

ALTER TABLE aviso ADD CONSTRAINT aviso_tipo_check CHECK (
  tipo IN (
    'tarea_nueva', 'reprogramacion', 'prueba', 'consulta_despacho', 'aviso_snooze',
    'apertura_despacho', 'asignacion_despacho', 'consulta_lote', 'consulta_chip', 'fabricacion',
    'salida'
  )
);
