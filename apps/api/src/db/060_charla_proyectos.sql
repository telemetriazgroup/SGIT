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

ALTER TABLE charla ADD CONSTRAINT charla_paso_check CHECK (
  paso IN (
    'menu', 'recientes', 'busca', 'confirma', 'resultados', 'cot',
    'pregunta_imagen', 'espera_imagen', 'nota', 'pregunta_resumen', 'resumen', 'detalle',
    'internos', 'proyectos', 'decisiones', 'asunto', 'decision',
    'despacho_oferta', 'despacho_detalle', 'despacho_menu', 'despacho_recogiendo', 'despacho_validar',
    'respuesta_despacho', 'consulta_despacho', 'corroborar_lectura',
    'chip_menu', 'chip_foto', 'hilos', 'hilo', 'fabricacion'
  )
);
