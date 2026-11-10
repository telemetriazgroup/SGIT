ALTER TABLE genset_dispositivo ADD COLUMN IF NOT EXISTS carreta text NOT NULL DEFAULT '';
ALTER TABLE genset_dispositivo ADD COLUMN IF NOT EXISTS serie_maquina text NOT NULL DEFAULT '';
ALTER TABLE genset_dispositivo ADD COLUMN IF NOT EXISTS codigo_genset text NOT NULL DEFAULT '';
ALTER TABLE genset_dispositivo ADD COLUMN IF NOT EXISTS observaciones text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS genset_foto (
  id uuid PRIMARY KEY,
  imei text NOT NULL REFERENCES genset_dispositivo (imei) ON DELETE CASCADE,
  clave text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'image/jpeg',
  subida_en timestamptz NOT NULL DEFAULT now(),
  subida_por text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS genset_foto_imei ON genset_foto (imei, subida_en);
