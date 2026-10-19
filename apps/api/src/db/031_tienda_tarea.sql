ALTER TABLE tarea ADD COLUMN IF NOT EXISTS padre_id uuid REFERENCES tarea (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tarea_padre_idx ON tarea (padre_id);

ALTER TABLE tienda ADD COLUMN IF NOT EXISTS tarea_hija_id uuid REFERENCES tarea (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tienda_hija_unica ON tienda (tarea_hija_id) WHERE tarea_hija_id IS NOT NULL;

DO $$
DECLARE
  nombre text;
BEGIN
  FOR nombre IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'tienda' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE tienda DROP CONSTRAINT %I', nombre);
  END LOOP;
END $$;

ALTER TABLE tienda ADD CONSTRAINT tienda_estado_check
  CHECK (estado IN ('pendiente', 'en_seguimiento', 'atendida', 'resuelta'));
