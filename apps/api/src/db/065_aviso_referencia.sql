ALTER TABLE aviso ADD COLUMN IF NOT EXISTS referencia text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS aviso_referencia_reciente ON aviso (referencia, creado_en DESC) WHERE referencia <> '';
