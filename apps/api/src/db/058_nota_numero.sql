ALTER TABLE chip ADD COLUMN IF NOT EXISTS situacion text NOT NULL DEFAULT '';
ALTER TABLE chip ADD COLUMN IF NOT EXISTS comentario text NOT NULL DEFAULT '';
ALTER TABLE chip DROP CONSTRAINT IF EXISTS chip_situacion_check;
ALTER TABLE chip ADD CONSTRAINT chip_situacion_check
  CHECK (situacion IN ('', 'activo', 'observacion', 'suspendido', 'baja'));

ALTER TABLE modem ADD COLUMN IF NOT EXISTS situacion text NOT NULL DEFAULT '';
ALTER TABLE modem ADD COLUMN IF NOT EXISTS comentario text NOT NULL DEFAULT '';
ALTER TABLE modem DROP CONSTRAINT IF EXISTS modem_situacion_check;
ALTER TABLE modem ADD CONSTRAINT modem_situacion_check
  CHECK (situacion IN ('', 'activo', 'observacion', 'suspendido', 'baja'));
