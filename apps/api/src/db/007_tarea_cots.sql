ALTER TABLE tarea ADD COLUMN IF NOT EXISTS cots text[] NOT NULL DEFAULT '{}';
UPDATE tarea SET cots = ARRAY[cot] WHERE cots = '{}' AND cot <> '';
