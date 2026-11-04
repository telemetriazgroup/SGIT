import type { Pool } from 'pg';

type Consulta = Pick<Pool, 'query'>;

const PASOS = [
  `ALTER TABLE chip ADD COLUMN IF NOT EXISTS situacion text`,
  `ALTER TABLE chip ADD COLUMN IF NOT EXISTS comentario text`,
  `UPDATE chip SET situacion = '' WHERE situacion IS NULL`,
  `UPDATE chip SET comentario = '' WHERE comentario IS NULL`,
  `ALTER TABLE chip ALTER COLUMN situacion SET DEFAULT ''`,
  `ALTER TABLE chip ALTER COLUMN comentario SET DEFAULT ''`,
  `ALTER TABLE chip ALTER COLUMN situacion SET NOT NULL`,
  `ALTER TABLE chip ALTER COLUMN comentario SET NOT NULL`,
  `ALTER TABLE chip DROP CONSTRAINT IF EXISTS chip_situacion_check`,
  `ALTER TABLE chip ADD CONSTRAINT chip_situacion_check CHECK (situacion IN ('', 'activo', 'observacion', 'suspendido', 'baja'))`,
  `ALTER TABLE modem ADD COLUMN IF NOT EXISTS situacion text`,
  `ALTER TABLE modem ADD COLUMN IF NOT EXISTS comentario text`,
  `UPDATE modem SET situacion = '' WHERE situacion IS NULL`,
  `UPDATE modem SET comentario = '' WHERE comentario IS NULL`,
  `ALTER TABLE modem ALTER COLUMN situacion SET DEFAULT ''`,
  `ALTER TABLE modem ALTER COLUMN comentario SET DEFAULT ''`,
  `ALTER TABLE modem ALTER COLUMN situacion SET NOT NULL`,
  `ALTER TABLE modem ALTER COLUMN comentario SET NOT NULL`,
  `ALTER TABLE modem DROP CONSTRAINT IF EXISTS modem_situacion_check`,
  `ALTER TABLE modem ADD CONSTRAINT modem_situacion_check CHECK (situacion IN ('', 'activo', 'observacion', 'suspendido', 'baja'))`,
];

let lista: Promise<void> | null = null;

export function asegurarNotaNumero(pg: Consulta): Promise<void> {
  lista ??= (async () => {
    for (const paso of PASOS) await pg.query(paso);
  })().catch((error: unknown) => {
    lista = null;
    throw error;
  });
  return lista;
}
