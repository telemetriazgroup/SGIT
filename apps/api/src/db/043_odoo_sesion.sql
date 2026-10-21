ALTER TABLE configuracion_odoo ADD COLUMN IF NOT EXISTS sesion_usuario text NOT NULL DEFAULT '';
ALTER TABLE configuracion_odoo ADD COLUMN IF NOT EXISTS sesion_clave text NOT NULL DEFAULT '';
