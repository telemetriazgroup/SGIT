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

ALTER TABLE aviso ADD CONSTRAINT aviso_tipo_check CHECK (tipo IN ('tarea_nueva', 'reprogramacion', 'prueba'));
ALTER TABLE aviso ALTER COLUMN tarea_id DROP NOT NULL;
