import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { OdooServicio } from '../odoo/servicio';
import { clasificarModem } from './clasificar';

export type Modem = {
  id: string;
  serie: string;
  producto: string;
  estado: string;
  orden_mo: string;
  chip: string;
  salida: string;
  cantidad: number;
  fecha: string | null;
};

const TAMANO = 40;

export class ModemsService {
  private readonly odoo: OdooServicio;

  constructor(private readonly conexiones: Conexiones) {
    this.odoo = new OdooServicio(conexiones);
  }

  async listar(pagina: number, busqueda = '', estado = ''): Promise<{ modems: Modem[]; total: number; pagina: number; paginas: number; resumen: { disponibles: number; fabricados: number; salidas: number; producto: string } }> {
    const filtro = patron(busqueda);
    const donde = `WHERE ($2::text = '' OR estado = $2) AND ($1::text IS NULL OR serie ILIKE $1 ESCAPE '\\' OR orden_mo ILIKE $1 ESCAPE '\\' OR chip ILIKE $1 ESCAPE '\\' OR salida ILIKE $1 ESCAPE '\\')`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM modem ${donde}`, [filtro, estado]);
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const filas = await this.conexiones.pg.query<Modem>(
      `SELECT id, serie, producto, estado, orden_mo, chip, salida, cantidad::float8 AS cantidad,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha
       FROM modem
       ${donde}
       ORDER BY CASE estado WHEN 'fabricado' THEN 0 WHEN 'salida' THEN 1 ELSE 2 END, ocupado_en DESC NULLS LAST, serie
       LIMIT $3 OFFSET $4`,
      [filtro, estado, TAMANO, (actual - 1) * TAMANO],
    );
    return { modems: filas.rows, total, pagina: actual, paginas, resumen: await this.resumen() };
  }

  async ver(id: string): Promise<Modem & { movimientos: Array<{ fecha: string | null; referencia: string; desde: string; hacia: string; cantidad: number | null; estado: string }> }> {
    const fila = await this.conexiones.pg.query<Modem>(
      `SELECT id, serie, producto, estado, orden_mo, chip, salida, cantidad::float8 AS cantidad,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS fecha
       FROM modem WHERE id = $1`,
      [id],
    );
    const modem = fila.rows[0];
    if (!modem) throw new NotFoundException('Ese módem ya no está.');
    const movimientos = await this.conexiones.pg.query<{ fecha: string | null; referencia: string; desde: string; hacia: string; cantidad: number | null; estado: string }>(
      `SELECT to_char(cuando AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS fecha, referencia, desde, hacia, cantidad::float8 AS cantidad, estado
       FROM modem_movimiento WHERE modem_id = $1 ORDER BY cuando`,
      [id],
    );
    return { ...modem, movimientos: movimientos.rows.map((movimiento) => ({ ...movimiento, desde: limpio(movimiento.desde), hacia: limpio(movimiento.hacia) })) };
  }

  async consultar(): Promise<{ leidos: number; disponibles: number; fabricados: number; salidas: number; producto: string; aviso: string }> {
    const lectura = await this.odoo.modemsDe();
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(`DELETE FROM modem`);
      let disponibles = 0;
      let fabricados = 0;
      let salidas = 0;
      for (const equipo of lectura.equipos) {
        if (!equipo.serie) continue;
        const clase = clasificarModem(equipo.cantidad, equipo.movimientos);
        if (clase.estado === 'disponible') disponibles += 1;
        else if (clase.estado === 'fabricado') fabricados += 1;
        else salidas += 1;
        const id = randomUUID();
        await cliente.query(
          `INSERT INTO modem (id, odoo_id, serie, producto, estado, orden_mo, chip, salida, cantidad, ocupado_en, leido_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
          [
            id,
            equipo.odooId,
            equipo.serie,
            lectura.producto,
            clase.estado,
            clase.orden,
            clase.orden ? lectura.chipPorOrden[clase.orden] ?? '' : '',
            clase.salida,
            equipo.cantidad,
            instante(clase.cuando),
          ],
        );
        for (const movimiento of equipo.movimientos) {
          await cliente.query(
            `INSERT INTO modem_movimiento (id, modem_id, odoo_linea, cuando, referencia, desde, hacia, cantidad, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (odoo_linea) DO NOTHING`,
            [randomUUID(), id, movimiento.odooId, instante(movimiento.fecha), movimiento.referencia, movimiento.desde, movimiento.hacia, movimiento.cantidad, movimiento.estado],
          );
        }
      }
      await cliente.query('COMMIT');
      return { leidos: lectura.equipos.length, disponibles, fabricados, salidas, producto: lectura.producto, aviso: lectura.aviso };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  private async resumen(): Promise<{ disponibles: number; fabricados: number; salidas: number; producto: string }> {
    const cuentas = await this.conexiones.pg.query<{ estado: string; total: string }>(`SELECT estado, count(*)::text AS total FROM modem GROUP BY estado`);
    const producto = await this.conexiones.pg.query<{ producto: string }>(`SELECT producto FROM modem LIMIT 1`);
    const numero = (estado: string) => Number(cuentas.rows.find((fila) => fila.estado === estado)?.total ?? 0);
    return { disponibles: numero('disponible'), fabricados: numero('fabricado'), salidas: numero('salida'), producto: producto.rows[0]?.producto ?? '' };
  }
}

function patron(busqueda: string): string | null {
  const texto = busqueda.trim().replace(/[%_\\]/g, '\\$&');
  return texto ? `%${texto}%` : null;
}

function limpio(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

function instante(fecha: string | null): string | null {
  if (!fecha) return null;
  const normal = fecha.includes('T') ? fecha : fecha.replace(' ', 'T');
  return /z$/i.test(normal) || /[+-]\d{2}/.test(normal) ? normal : `${normal}Z`;
}
