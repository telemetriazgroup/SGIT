ALTER TABLE aviso ADD COLUMN IF NOT EXISTS primer_fallo_en timestamptz;
ALTER TABLE aviso ADD COLUMN IF NOT EXISTS intentos int NOT NULL DEFAULT 0;
ALTER TABLE aviso ADD COLUMN IF NOT EXISTS ultimo_error text;

DO $$
DECLARE
  nombre text;
BEGIN
  SELECT con.conname INTO nombre
  FROM pg_constraint con
  WHERE con.conrelid = 'aviso'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%estado%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%tipo%';
  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aviso DROP CONSTRAINT %I', nombre);
  END IF;
END $$;

ALTER TABLE aviso ADD CONSTRAINT aviso_estado_check CHECK (estado IN ('pendiente', 'enviado', 'cerrado'));

CREATE TABLE IF NOT EXISTS evento_bot (
  id uuid PRIMARY KEY,
  aviso_id uuid,
  tarea_id uuid,
  destino text NOT NULL,
  tipo text NOT NULL DEFAULT '',
  motivo text NOT NULL,
  cuerpo text NOT NULL DEFAULT '',
  intentos int NOT NULL DEFAULT 0,
  abierto_en timestamptz NOT NULL,
  cerrado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evento_bot_fecha ON evento_bot (cerrado_en DESC);
