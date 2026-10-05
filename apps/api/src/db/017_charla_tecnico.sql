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
WHERE paso IN ('elige_tarea', 'elige_accion', 'nota_seguimiento', 'nota_incidente');

ALTER TABLE charla ADD CONSTRAINT charla_paso_check CHECK (
  paso IN (
    'menu', 'recientes', 'busca', 'confirma', 'resultados', 'cot',
    'pregunta_imagen', 'espera_imagen', 'nota', 'pregunta_resumen', 'resumen', 'detalle'
  )
);
