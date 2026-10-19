ALTER TABLE hilo_atencion ADD COLUMN IF NOT EXISTS chip_estado text;

ALTER TABLE hilo_atencion DROP CONSTRAINT IF EXISTS hilo_chip_estado_check;
ALTER TABLE hilo_atencion ADD CONSTRAINT hilo_chip_estado_check
  CHECK (chip_estado IS NULL OR chip_estado IN ('disponible', 'ocupado'));
