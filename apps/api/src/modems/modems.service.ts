import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { OdooServicio } from '../odoo/servicio';
import { armarOrden, marcaDeOrden, type CopiaOrden } from '../chips/orden';
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
  situacion: string;
  comentario: string;
};

const SITUACIONES = ['', 'activo', 'observacion', 'suspendido', 'baja'];

const TAMANO = 40;
const CINCO_MINUTOS = 5 * 60 * 1000;
const ORDENES_POR_VUELTA = 12;

export class PulsoModems {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ocupado = false;

  constructor(private readonly conexiones: Conexiones) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.correr();
    }, CINCO_MINUTOS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async correr(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    const servicio = new ModemsService(this.conexiones);
    const pasos = [() => servicio.consultar(), () => servicio.vigilarOrdenes(), () => servicio.completarOrdenes()];
    try {
      for (const paso of pasos) {
        try {
          await paso();
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : 'falló la sincronización de módems';
          console.error(`M2M: ${mensaje}`);
        }
      }
    } finally {
      this.ocupado = false;
    }
  }
}

export class ModemsService {
  private readonly odoo: OdooServicio;

  constructor(private readonly conexiones: Conexiones) {
    this.odoo = new OdooServicio(conexiones);
  }

  async listar(pagina: number, busqueda = '', estado = ''): Promise<{ modems: Modem[]; total: number; pagina: number; paginas: number; resumen: { disponibles: number; fabricados: number; salidas: number; producto: string } }> {
    const filtro = patron(busqueda);
    const donde = `WHERE ($2::text = '' OR estado = $2) AND ($1::text IS NULL OR serie ILIKE $1 ESCAPE '\\' OR orden_mo ILIKE $1 ESCAPE '\\' OR chip ILIKE $1 ESCAPE '\\' OR salida ILIKE $1 ESCAPE '\\' OR comentario ILIKE $1 ESCAPE '\\')`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM modem ${donde}`, [filtro, estado]);
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const filas = await this.conexiones.pg.query<Modem>(
      `SELECT id, serie, producto, estado, orden_mo, chip, salida, cantidad::float8 AS cantidad,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha,
              situacion, comentario
       FROM modem
       ${donde}
       ORDER BY CASE estado WHEN 'fabricado' THEN 0 WHEN 'salida' THEN 1 ELSE 2 END, ocupado_en DESC NULLS LAST, serie
       LIMIT $3 OFFSET $4`,
      [filtro, estado, TAMANO, (actual - 1) * TAMANO],
    );
    return { modems: filas.rows, total, pagina: actual, paginas, resumen: await this.resumen() };
  }

  async anotar(id: string, situacion: string, comentario: string): Promise<Modem> {
    const marca = situacion.trim();
    if (!SITUACIONES.includes(marca)) throw new BadRequestException('El estado es activo, en observación, suspendido o de baja.');
    const texto = comentario.trim().slice(0, 500);
    const resultado = await this.conexiones.pg.query(`UPDATE modem SET situacion = $2, comentario = $3 WHERE id = $1`, [id, marca, texto]);
    if ((resultado.rowCount ?? 0) === 0) throw new NotFoundException('Ese módem ya no está.');
    return this.uno(id);
  }

  async ver(id: string): Promise<Modem & { movimientos: Array<{ fecha: string | null; referencia: string; desde: string; hacia: string; cantidad: number | null; estado: string }>; orden: (CopiaOrden & { leido_en: string | null }) | null }> {
    const fila = await this.conexiones.pg.query<Modem>(
      `SELECT id, serie, producto, estado, orden_mo, chip, salida, cantidad::float8 AS cantidad,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS fecha,
              situacion, comentario
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
    const orden = await this.ordenGuardada(id);
    return { ...modem, movimientos: movimientos.rows.map((movimiento) => ({ ...movimiento, desde: limpio(movimiento.desde), hacia: limpio(movimiento.hacia) })), orden };
  }

  async consultar(): Promise<{ leidos: number; disponibles: number; fabricados: number; salidas: number; producto: string; aviso: string }> {
    const lectura = await this.odoo.modemsDe();
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      let disponibles = 0;
      let fabricados = 0;
      let salidas = 0;
      const vistos: number[] = [];
      for (const equipo of lectura.equipos) {
        if (!equipo.serie) continue;
        const clase = clasificarModem(equipo.cantidad, equipo.movimientos);
        if (clase.estado === 'disponible') disponibles += 1;
        else if (clase.estado === 'fabricado') fabricados += 1;
        else salidas += 1;
        vistos.push(equipo.odooId);
        const chip = clase.orden ? lectura.chipPorOrden[clase.orden] ?? '' : '';
        const porOdoo = await cliente.query<{ id: string; orden_mo: string }>(`SELECT id, orden_mo FROM modem WHERE odoo_id = $1`, [equipo.odooId]);
        const porSerie = porOdoo.rows[0] ? null : await cliente.query<{ id: string; orden_mo: string }>(`SELECT id, orden_mo FROM modem WHERE serie = $1`, [equipo.serie]);
        const previo = porOdoo.rows[0] ?? porSerie?.rows[0];
        const id = previo?.id ?? randomUUID();
        if (previo && previo.orden_mo !== clase.orden) {
          await cliente.query(`DELETE FROM modem_orden_imagen WHERE modem_id = $1`, [id]);
          await cliente.query(`DELETE FROM modem_orden WHERE modem_id = $1`, [id]);
        }
        if (previo) {
          await cliente.query(`DELETE FROM modem WHERE serie = $1 AND id <> $2`, [equipo.serie, id]);
          await cliente.query(
            `UPDATE modem SET odoo_id = $2, serie = $3, producto = $4, estado = $5, orden_mo = $6, chip = $7, salida = $8, cantidad = $9, ocupado_en = $10, leido_en = now() WHERE id = $1`,
            [id, equipo.odooId, equipo.serie, lectura.producto, clase.estado, clase.orden, chip, clase.salida, equipo.cantidad, instante(clase.cuando)],
          );
        } else {
          await cliente.query(
            `INSERT INTO modem (id, odoo_id, serie, producto, estado, orden_mo, chip, salida, cantidad, ocupado_en, leido_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
            [id, equipo.odooId, equipo.serie, lectura.producto, clase.estado, clase.orden, chip, clase.salida, equipo.cantidad, instante(clase.cuando)],
          );
        }
        const lineas = equipo.movimientos.map((movimiento) => movimiento.odooId);
        await cliente.query(`DELETE FROM modem_movimiento WHERE modem_id = $1 AND NOT (odoo_linea = ANY($2::int[]))`, [id, lineas]);
        for (const movimiento of equipo.movimientos) {
          await cliente.query(
            `INSERT INTO modem_movimiento (id, modem_id, odoo_linea, cuando, referencia, desde, hacia, cantidad, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (odoo_linea) DO UPDATE SET modem_id = EXCLUDED.modem_id, cuando = EXCLUDED.cuando, referencia = EXCLUDED.referencia, desde = EXCLUDED.desde, hacia = EXCLUDED.hacia, cantidad = EXCLUDED.cantidad, estado = EXCLUDED.estado`,
            [randomUUID(), id, movimiento.odooId, instante(movimiento.fecha), movimiento.referencia, movimiento.desde, movimiento.hacia, movimiento.cantidad, movimiento.estado],
          );
        }
      }
      if (vistos.length > 0) await cliente.query(`DELETE FROM modem WHERE NOT (odoo_id = ANY($1::int[]))`, [vistos]);
      await cliente.query('COMMIT');
      return { leidos: lectura.equipos.length, disponibles, fabricados, salidas, producto: lectura.producto, aviso: lectura.aviso };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async verOrden(id: string, forzar = false): Promise<CopiaOrden & { leido_en: string | null }> {
    const modem = await this.uno(id);
    if (!modem.orden_mo) throw new BadRequestException('Ese módem no tiene una orden de fabricación.');
    if (!forzar) {
      const guardada = await this.ordenGuardada(modem.id);
      if (guardada?.nombre) return guardada;
    }
    const leida = await this.odoo.ordenDe(modem.orden_mo);
    if (!leida) throw new NotFoundException('Odoo no tiene esa orden.');
    await this.conexiones.pg.query(`DELETE FROM modem_orden_imagen WHERE modem_id = $1`, [modem.id]);
    const notas = [];
    for (const nota of leida.notas) {
      const imagenes = [];
      for (const imagen of nota.imagenes) {
        const imagenId = randomUUID();
        await this.conexiones.pg.query(`INSERT INTO modem_orden_imagen (id, modem_id, nombre, mime, contenido) VALUES ($1, $2, $3, $4, $5)`, [
          imagenId,
          modem.id,
          imagen.nombre.slice(0, 180),
          imagen.mime.slice(0, 80),
          imagen.datos,
        ]);
        imagenes.push({ id: imagenId, nombre: imagen.nombre, mime: imagen.mime });
      }
      notas.push({ fecha: nota.fecha, autor: nota.autor, texto: nota.texto, imagenes });
    }
    const copia = armarOrden(
      {
        nombre: leida.nombre,
        estado: leida.estado,
        producto: leida.producto,
        cantidad: leida.cantidad,
        produciendo: leida.produciendo,
        inicio: leida.inicio,
        fin: leida.fin,
        responsable: leida.responsable,
        lista: leida.lista,
        serie: leida.serie || modem.serie,
      },
      leida.componentes,
      notas,
    );
    const marca = marcaDeOrden(leida.escritoEn, leida.notas.map((nota) => nota.fecha));
    await this.conexiones.pg.query(
      `INSERT INTO modem_orden (modem_id, odoo_id, nombre, copia, leido_en, marca) VALUES ($1, $2, $3, $4::jsonb, now(), $5)
       ON CONFLICT (modem_id) DO UPDATE SET odoo_id = EXCLUDED.odoo_id, nombre = EXCLUDED.nombre, copia = EXCLUDED.copia, leido_en = now(), marca = EXCLUDED.marca`,
      [modem.id, leida.id, leida.nombre, JSON.stringify(copia), marca],
    );
    const guardada = await this.ordenGuardada(modem.id);
    if (!guardada) throw new NotFoundException('No se pudo guardar la orden.');
    return guardada;
  }

  async imagenesDeOrden(id: string): Promise<Array<{ id: string; mime: string; datos: string }>> {
    const imagenes = await this.conexiones.pg.query<{ id: string; mime: string; contenido: Buffer }>(
      `SELECT id, mime, contenido FROM modem_orden_imagen WHERE modem_id = $1`,
      [id],
    );
    return imagenes.rows.map((imagen) => ({ id: imagen.id, mime: imagen.mime, datos: bufferDe(imagen.contenido).toString('base64') }));
  }

  async vigilarOrdenes(): Promise<{ revisadas: number; actualizadas: number }> {
    const filas = await this.conexiones.pg.query<{ modem_id: string; odoo_id: number; marca: string }>(
      `SELECT modem_id, odoo_id, COALESCE(marca, '') AS marca FROM modem_orden WHERE odoo_id IS NOT NULL`,
    );
    if (filas.rows.length === 0) return { revisadas: 0, actualizadas: 0 };
    let marcas: Map<number, string>;
    try {
      marcas = await this.odoo.marcasDeOrdenes(filas.rows.map((fila) => fila.odoo_id));
    } catch {
      return { revisadas: filas.rows.length, actualizadas: 0 };
    }
    let actualizadas = 0;
    for (const fila of filas.rows) {
      const marca = marcas.get(fila.odoo_id) ?? '';
      if (!marca || marca === fila.marca) continue;
      if (!fila.marca) {
        await this.conexiones.pg.query(`UPDATE modem_orden SET marca = $2 WHERE modem_id = $1 AND marca = ''`, [fila.modem_id, marca]);
        continue;
      }
      try {
        await this.verOrden(fila.modem_id, true);
        actualizadas += 1;
      } catch {
        continue;
      }
    }
    return { revisadas: filas.rows.length, actualizadas };
  }

  async completarOrdenes(): Promise<number> {
    const filas = await this.conexiones.pg.query<{ id: string }>(
      `SELECT m.id
       FROM modem m
       WHERE m.orden_mo <> ''
         AND NOT EXISTS (SELECT 1 FROM modem_orden o WHERE o.modem_id = m.id AND o.nombre <> '')
       LIMIT $1`,
      [ORDENES_POR_VUELTA],
    );
    let hechas = 0;
    for (const fila of filas.rows) {
      try {
        await this.verOrden(fila.id, true);
        hechas += 1;
      } catch {
        continue;
      }
    }
    return hechas;
  }

  private async uno(id: string): Promise<Modem> {
    const fila = await this.conexiones.pg.query<Modem>(
      `SELECT id, serie, producto, estado, orden_mo, chip, salida, cantidad::float8 AS cantidad,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha,
              situacion, comentario
       FROM modem WHERE id = $1`,
      [id],
    );
    if (!fila.rows[0]) throw new NotFoundException('Ese módem ya no está.');
    return fila.rows[0];
  }

  private async ordenGuardada(modemId: string): Promise<(CopiaOrden & { leido_en: string | null }) | null> {
    const fila = await this.conexiones.pg.query<{ copia: CopiaOrden; leido_en: Date | null }>(
      `SELECT copia, leido_en FROM modem_orden WHERE modem_id = $1`,
      [modemId],
    );
    const guardada = fila.rows[0];
    if (!guardada?.copia?.nombre) return null;
    return {
      ...guardada.copia,
      pasos: guardada.copia.pasos ?? [],
      ficha: guardada.copia.ficha ?? [],
      componentes: guardada.copia.componentes ?? [],
      notas: guardada.copia.notas ?? [],
      leido_en: guardada.leido_en ? new Date(guardada.leido_en).toISOString() : null,
    };
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

function bufferDe(contenido: Buffer | string): Buffer {
  if (Buffer.isBuffer(contenido)) return contenido;
  return Buffer.from(contenido, 'base64');
}

function instante(fecha: string | null): string | null {
  if (!fecha) return null;
  const normal = fecha.includes('T') ? fecha : fecha.replace(' ', 'T');
  return /z$/i.test(normal) || /[+-]\d{2}/.test(normal) ? normal : `${normal}Z`;
}
