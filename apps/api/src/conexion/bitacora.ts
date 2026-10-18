import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

export type ServicioConexion = 'gmail' | 'whatsapp';
export type NivelConexion = 'info' | 'fallo';

export async function anotarConexion(pg: Pool, servicio: ServicioConexion, nivel: NivelConexion, texto: string): Promise<void> {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!limpio) return;
  try {
    await pg.query(
      `INSERT INTO bitacora_conexion (id, servicio, nivel, texto) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), servicio, nivel, limpio],
    );
    await pg.query(
      `DELETE FROM bitacora_conexion
       WHERE id IN (
         SELECT id FROM bitacora_conexion WHERE servicio = $1 ORDER BY creado_en DESC OFFSET 80
       )`,
      [servicio],
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'no se pudo guardar';
    console.error(`Bitácora de conexión: ${mensaje}`);
  }
}
