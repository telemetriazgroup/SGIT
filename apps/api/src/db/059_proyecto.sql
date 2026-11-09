ALTER TABLE tarea ADD COLUMN IF NOT EXISTS proyecto boolean NOT NULL DEFAULT false;

ALTER TABLE hilo_atencion ADD COLUMN IF NOT EXISTS clase text NOT NULL DEFAULT 'telemetria';
ALTER TABLE hilo_atencion DROP CONSTRAINT IF EXISTS hilo_atencion_clase_check;
ALTER TABLE hilo_atencion ADD CONSTRAINT hilo_atencion_clase_check
  CHECK (clase IN ('telemetria', 'infraestructura', 'hmi'));
