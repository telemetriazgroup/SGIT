DROP INDEX IF EXISTS chip_celular_unica;

ALTER TABLE chip ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;
