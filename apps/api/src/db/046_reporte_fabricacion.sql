ALTER TABLE fabricacion ADD COLUMN IF NOT EXISTS reporte_clave text NOT NULL DEFAULT '';
ALTER TABLE fabricacion ADD COLUMN IF NOT EXISTS reporte_huella text NOT NULL DEFAULT '';
