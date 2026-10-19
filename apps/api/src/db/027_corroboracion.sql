ALTER TABLE aviso ADD COLUMN IF NOT EXISTS tomado_en timestamptz;

ALTER TABLE asignacion_despacho ADD COLUMN IF NOT EXISTS validacion text;
ALTER TABLE asignacion_despacho ADD COLUMN IF NOT EXISTS validada_en timestamptz;

ALTER TABLE asignacion_despacho DROP CONSTRAINT IF EXISTS asignacion_despacho_validacion_check;
ALTER TABLE asignacion_despacho ADD CONSTRAINT asignacion_despacho_validacion_check
  CHECK (validacion IS NULL OR validacion IN ('pendiente', 'validada', 'sin_validar'));

CREATE TABLE IF NOT EXISTS movimiento_despacho (
  id uuid PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES tarea (id) ON DELETE CASCADE,
  asignacion_id uuid REFERENCES asignacion_despacho (id) ON DELETE SET NULL,
  tipo text NOT NULL,
  actor text NOT NULL,
  detalle text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimiento_despacho_tarea ON movimiento_despacho (tarea_id, creado_en);

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
    'internos', 'decisiones', 'asunto', 'decision',
    'despacho_oferta', 'despacho_detalle', 'despacho_menu', 'despacho_recogiendo', 'despacho_validar',
    'respuesta_despacho', 'consulta_despacho', 'corroborar_lectura',
    'chip_menu', 'chip_foto', 'hilos', 'hilo'
  )
);
