ALTER TABLE charla ADD COLUMN IF NOT EXISTS pendiente jsonb;

DO $$
DECLARE
  nombre text;
BEGIN
  FOR nombre IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'charla' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%paso%'
  LOOP
    EXECUTE format('ALTER TABLE charla DROP CONSTRAINT %I', nombre);
  END LOOP;
END $$;

UPDATE charla
SET paso = 'menu', tarea_id = NULL, lista = '[]'::jsonb, pendiente = NULL
WHERE paso IN ('elige_incidente', 'elige_pendiente', 'elige_mias');
