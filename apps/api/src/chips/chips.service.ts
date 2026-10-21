import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { OdooServicio } from '../odoo/servicio';
import { filasDeExcel } from './excel';
import { clasificar, type LineaSerie, type LoteSerie } from './inventario';
import { armarOrden, marcaDeOrden, type CopiaOrden } from './orden';
import { normalizarCelular, normalizarImei, textoPlano } from './normalizar';

export type Chip = {
  id: string;
  producto: string;
  marca: string;
  imei: string;
  celular: string;
  archivado: boolean;
  estado: string;
  telemetria: string;
  orden_mo: string;
  ocupado_fecha: string | null;
  creado_en: string;
};

export type ResumenChips = {
  disponibles: number;
  ocupados: number;
  sinDato: number;
  meses: Array<{ mes: string; total: number }>;
  dias: Array<{ dia: string; total: number }>;
};

export type CargaChips = {
  creados: number;
  reemplazados: number;
  conflictos: Array<{ fila: number; imei: string }>;
  rechazados: Array<{ fila: number; motivo: string }>;
};

const TAMANO = 40;

export class PulsoChips {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ocupado = false;

  constructor(private readonly conexiones: Conexiones) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.correr();
    }, 180_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async correr(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      await new ChipsService(this.conexiones).vigilarOrdenes();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'falló la vigilancia de órdenes';
      console.error(`Chips: ${mensaje}`);
    } finally {
      this.ocupado = false;
    }
  }
}

export class ChipsService {
  private readonly odoo: OdooServicio;

  constructor(private readonly conexiones: Conexiones) {
    this.odoo = new OdooServicio(conexiones);
  }

  async listar(pagina: number, busqueda = '', archivados = false, estado = '', mes = '', dia = ''): Promise<{ chips: Chip[]; total: number; pagina: number; paginas: number; resumen: ResumenChips }> {
    const filtro = patron(busqueda);
    const corteMes = /^\d{4}-\d{2}$/.test(mes) ? mes : '';
    const corteDia = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : '';
    const donde = `WHERE archivado = $2 AND ($3::text = '' OR estado = $3)
      AND ($4::text = '' OR to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $4)
      AND ($5::text = '' OR to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') = $5)
      AND ($1::text IS NULL OR producto ILIKE $1 ESCAPE '\\' OR marca ILIKE $1 ESCAPE '\\' OR imei ILIKE $1 ESCAPE '\\' OR celular ILIKE $1 ESCAPE '\\')`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM chip ${donde}`, [filtro, archivados, estado, corteMes, corteDia]);
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const filas = await this.conexiones.pg.query<Chip>(
      `SELECT id, producto, marca, imei, celular, archivado, estado, telemetria, orden_mo,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS ocupado_fecha, creado_en
       FROM chip
       ${donde}
       ORDER BY imei
       LIMIT $6 OFFSET $7`,
      [filtro, archivados, estado, corteMes, corteDia, TAMANO, (actual - 1) * TAMANO],
    );
    return { chips: filas.rows, total, pagina: actual, paginas, resumen: await this.resumen(archivados) };
  }

  async crear(entrada: EntradaChip, reemplazar = false): Promise<Chip> {
    const limpio = exigir(entrada);
    const otro = await this.porImei(limpio.imei);
    if (otro) {
      if (!reemplazar) throw conflicto();
      await this.reescribir(otro.id, limpio);
      return this.uno(otro.id);
    }
    const id = randomUUID();
    try {
      await this.conexiones.pg.query(
        `INSERT INTO chip (id, producto, marca, imei, celular) VALUES ($1, $2, $3, $4, $5)`,
        [id, limpio.producto, limpio.marca, limpio.imei, limpio.celular],
      );
    } catch (error) {
      if (codigoPg(error) === '23505') throw conflicto();
      throw error;
    }
    return this.uno(id);
  }

  async editar(id: string, entrada: EntradaChip, reemplazar = false): Promise<Chip> {
    const actual = await this.uno(id);
    const limpio = exigir(entrada);
    const otro = await this.porImei(limpio.imei);
    if (otro && otro.id !== actual.id) {
      if (!reemplazar) throw conflicto();
      await this.conexiones.pg.query(`DELETE FROM chip WHERE id = $1`, [otro.id]);
    }
    await this.reescribir(actual.id, limpio);
    return this.uno(actual.id);
  }

  async archivar(id: string, archivado: boolean): Promise<Chip> {
    await this.uno(id);
    await this.conexiones.pg.query(`UPDATE chip SET archivado = $2 WHERE id = $1`, [id, archivado]);
    return this.uno(id);
  }

  async importar(contenido: Buffer, reemplazar = false): Promise<CargaChips> {
    let filas;
    try {
      filas = filasDeExcel(contenido);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'El Excel no se pudo leer.');
    }
    const rechazados: CargaChips['rechazados'] = [];
    const conflictos: CargaChips['conflictos'] = [];
    const vistos = new Map<string, number>();
    let creados = 0;
    let reemplazados = 0;
    for (const fila of filas) {
      const limpio = leer(fila.producto, fila.marca, fila.imei, fila.celular);
      if (typeof limpio === 'string') {
        rechazados.push({ fila: fila.fila, motivo: limpio });
        continue;
      }
      const repetido = vistos.get(limpio.imei);
      vistos.set(limpio.imei, fila.fila);
      const otro = await this.porImei(limpio.imei);
      if (repetido || otro) {
        if (!reemplazar) {
          conflictos.push({ fila: fila.fila, imei: limpio.imei });
          continue;
        }
        if (otro) await this.reescribir(otro.id, limpio);
        reemplazados += 1;
        continue;
      }
      try {
        await this.conexiones.pg.query(`INSERT INTO chip (id, producto, marca, imei, celular) VALUES ($1, $2, $3, $4, $5)`, [
          randomUUID(),
          limpio.producto,
          limpio.marca,
          limpio.imei,
          limpio.celular,
        ]);
        creados += 1;
      } catch (error) {
        if (codigoPg(error) === '23505') conflictos.push({ fila: fila.fila, imei: limpio.imei });
        else throw error;
      }
    }
    return { creados, reemplazados, conflictos, rechazados };
  }

  async consultarOdoo(): Promise<{ leidos: number; disponibles: number; ocupados: number; sinDato: number }> {
    const chips = await this.conexiones.pg.query<{ id: string; celular: string; estado: string; telemetria: string; orden_mo: string }>(
      `SELECT id, celular, estado, telemetria, orden_mo FROM chip WHERE NOT archivado`,
    );
    const inventario = await this.odoo.inventarioDe(chips.rows.map((chip) => chip.celular));
    const lotes = new Map<string, LoteSerie[]>();
    for (const lote of inventario.lotes) {
      const lista = lotes.get(lote.serie) ?? [];
      lista.push(lote);
      lotes.set(lote.serie, lista);
    }
    const lineas = new Map<number, LineaSerie[]>();
    for (const linea of inventario.lineas) {
      const lista = lineas.get(linea.loteId) ?? [];
      lista.push(linea);
      lineas.set(linea.loteId, lista);
    }
    let disponibles = 0;
    let ocupados = 0;
    let sinDato = 0;
    for (const chip of chips.rows) {
      const suyos = lotes.get(chip.celular) ?? [];
      const movimientos = suyos.flatMap((lote) => lineas.get(lote.id) ?? []);
      const lectura = clasificar(suyos, movimientos);
      if (lectura.estado === 'disponible') disponibles += 1;
      else if (lectura.estado === 'ocupado') ocupados += 1;
      else sinDato += 1;
      const cuando = instante(lectura.ocupadoEn);
      if (chip.estado !== lectura.estado || chip.telemetria !== lectura.telemetria || chip.orden_mo !== lectura.orden) {
        await this.conexiones.pg.query(`INSERT INTO chip_cambio (id, chip_id, texto) VALUES ($1, $2, $3)`, [
          randomUUID(),
          chip.id,
          textoEstado(lectura.estado, lectura.telemetria, lectura.orden),
        ]);
      }
      await this.conexiones.pg.query(
        `UPDATE chip SET estado = $2, telemetria = $3, orden_mo = $4, ocupado_en = $5, odoo_leido_en = now(), odoo_aviso = '' WHERE id = $1`,
        [chip.id, lectura.estado, lectura.telemetria, lectura.orden, cuando],
      );
      await this.conexiones.pg.query(`DELETE FROM chip_movimiento WHERE chip_id = $1`, [chip.id]);
      for (const movimiento of lectura.movimientos) {
        await this.conexiones.pg.query(
          `INSERT INTO chip_movimiento (id, chip_id, cuando, referencia, producto, desde, hacia, cantidad)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (chip_id, referencia, producto, desde, hacia) DO NOTHING`,
          [randomUUID(), chip.id, instante(movimiento.fecha), movimiento.referencia, movimiento.producto, movimiento.desde, movimiento.hacia, movimiento.cantidad],
        );
      }
    }
    return { leidos: chips.rows.length, disponibles, ocupados, sinDato };
  }

  async verOrden(id: string, forzar = false): Promise<CopiaOrden & { trazas: TrazaOrden[]; leido_en: string | null }> {
    const chip = await this.uno(id);
    if (!chip.orden_mo) throw new BadRequestException('Ese chip no tiene una orden de fabricación.');
    if (!forzar) {
      const guardada = await this.ordenGuardada(chip.id);
      if (guardada?.nombre) return guardada;
    }
    const leida = await this.odoo.ordenDe(chip.orden_mo);
    if (!leida) throw new NotFoundException('Odoo no tiene esa orden.');
    await this.conexiones.pg.query(`DELETE FROM chip_orden_imagen WHERE chip_id = $1`, [chip.id]);
    const notas = [];
    for (const nota of leida.notas) {
      const imagenes = [];
      for (const imagen of nota.imagenes) {
        const imagenId = randomUUID();
        await this.conexiones.pg.query(`INSERT INTO chip_orden_imagen (id, chip_id, nombre, mime, contenido) VALUES ($1, $2, $3, $4, $5)`, [
          imagenId,
          chip.id,
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
        serie: leida.serie || chip.celular,
      },
      leida.componentes,
      notas,
    );
    const marca = marcaDeOrden(leida.escritoEn, leida.notas.map((nota) => nota.fecha));
    await this.conexiones.pg.query(
      `INSERT INTO chip_orden (chip_id, odoo_id, nombre, copia, leido_en, marca) VALUES ($1, $2, $3, $4::jsonb, now(), $5)
       ON CONFLICT (chip_id) DO UPDATE SET odoo_id = EXCLUDED.odoo_id, nombre = EXCLUDED.nombre, copia = EXCLUDED.copia, leido_en = now(), marca = EXCLUDED.marca`,
      [chip.id, leida.id, leida.nombre, JSON.stringify(copia), marca],
    );
    const guardada = await this.ordenGuardada(chip.id);
    if (!guardada) throw new NotFoundException('No se pudo guardar la orden.');
    return guardada;
  }

  async imagenesDeOrden(id: string): Promise<Array<{ id: string; mime: string; datos: string }>> {
    const imagenes = await this.conexiones.pg.query<{ id: string; mime: string; contenido: Buffer }>(
      `SELECT id, mime, contenido FROM chip_orden_imagen WHERE chip_id = $1`,
      [id],
    );
    return imagenes.rows.map((imagen) => ({ id: imagen.id, mime: imagen.mime, datos: bufferDe(imagen.contenido).toString('base64') }));
  }

  async vigilarOrdenes(): Promise<{ revisadas: number; actualizadas: number }> {
    const filas = await this.conexiones.pg.query<{ chip_id: string; odoo_id: number; marca: string }>(
      `SELECT chip_id, odoo_id, COALESCE(marca, '') AS marca FROM chip_orden WHERE odoo_id IS NOT NULL`,
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
        await this.conexiones.pg.query(`UPDATE chip_orden SET marca = $2 WHERE chip_id = $1 AND marca = ''`, [fila.chip_id, marca]);
        continue;
      }
      try {
        await this.verOrden(fila.chip_id, true);
        actualizadas += 1;
      } catch {
        continue;
      }
    }
    return { revisadas: filas.rows.length, actualizadas };
  }

  private async ordenGuardada(chipId: string): Promise<(CopiaOrden & { trazas: TrazaOrden[]; leido_en: string | null }) | null> {
    const fila = await this.conexiones.pg.query<{ copia: CopiaOrden; leido_en: Date | null }>(
      `SELECT copia, leido_en FROM chip_orden WHERE chip_id = $1`,
      [chipId],
    );
    const guardada = fila.rows[0];
    if (!guardada?.copia?.nombre) return null;
    const copia = guardada.copia;
    const trazas = await this.conexiones.pg.query<TrazaOrden>(
      `SELECT referencia, producto, desde, hacia, cantidad, cuando AS fecha FROM chip_movimiento WHERE chip_id = $1 ORDER BY cuando`,
      [chipId],
    );
    return {
      ...copia,
      notas: copia.notas ?? [],
      trazas: trazas.rows.map((traza) => ({
        ...traza,
        producto: String(traza.producto ?? '').replace(/\s+/g, ' ').trim(),
        desde: String(traza.desde ?? '').replace(/\s+/g, ' ').trim(),
        hacia: String(traza.hacia ?? '').replace(/\s+/g, ' ').trim(),
        fecha: traza.fecha ? new Date(traza.fecha).toISOString() : null,
      })),
      leido_en: guardada.leido_en ? new Date(guardada.leido_en).toISOString() : null,
    };
  }

  private async resumen(archivados: boolean): Promise<ResumenChips> {
    const cuentas = await this.conexiones.pg.query<{ estado: string; total: string }>(
      `SELECT estado, count(*)::text AS total FROM chip WHERE archivado = $1 GROUP BY estado`,
      [archivados],
    );
    const meses = await this.conexiones.pg.query<{ mes: string; total: string }>(
      `SELECT to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') AS mes, count(*)::text AS total
       FROM chip
       WHERE archivado = $1 AND estado = 'ocupado' AND ocupado_en IS NOT NULL
       GROUP BY 1
       ORDER BY 1`,
      [archivados],
    );
    const dias = await this.conexiones.pg.query<{ dia: string; total: string }>(
      `SELECT to_char(serie.dia, 'YYYY-MM-DD') AS dia, coalesce(cuenta.total, 0)::text AS total
       FROM generate_series(
         (timezone('America/Lima', now()))::date - 6,
         (timezone('America/Lima', now()))::date,
         interval '1 day'
       ) AS serie(dia)
       LEFT JOIN (
         SELECT (ocupado_en AT TIME ZONE 'America/Lima')::date AS dia, count(*) AS total
         FROM chip
         WHERE archivado = $1 AND estado = 'ocupado' AND ocupado_en IS NOT NULL
         GROUP BY 1
       ) cuenta ON cuenta.dia = serie.dia::date
       ORDER BY serie.dia`,
      [archivados],
    );
    const numero = (estado: string) => Number(cuentas.rows.find((fila) => fila.estado === estado)?.total ?? 0);
    return {
      disponibles: numero('disponible'),
      ocupados: numero('ocupado'),
      sinDato: numero('sin_dato'),
      meses: meses.rows.map((fila) => ({ mes: fila.mes, total: Number(fila.total) })),
      dias: dias.rows.map((fila) => ({ dia: fila.dia, total: Number(fila.total) })),
    };
  }

  private async porImei(imei: string): Promise<{ id: string } | null> {
    const fila = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM chip WHERE imei = $1`, [imei]);
    return fila.rows[0] ?? null;
  }

  private async uno(id: string): Promise<Chip> {
    const fila = await this.conexiones.pg.query<Chip>(
      `SELECT id, producto, marca, imei, celular, archivado, estado, telemetria, orden_mo,
              to_char(ocupado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS ocupado_fecha, creado_en
       FROM chip WHERE id = $1`,
      [id],
    );
    if (!fila.rows[0]) throw new NotFoundException('Ese chip ya no está.');
    return fila.rows[0];
  }

  private async reescribir(id: string, chip: ChipLimpio): Promise<void> {
    await this.conexiones.pg.query(
      `UPDATE chip SET producto = $2, marca = $3, imei = $4, celular = $5, archivado = false WHERE id = $1`,
      [id, chip.producto, chip.marca, chip.imei, chip.celular],
    );
  }
}

type TrazaOrden = { referencia: string; producto: string; desde: string; hacia: string; cantidad: number | null; fecha: string | null };
type EntradaChip = { producto?: string; marca?: string; imei?: string; celular?: string };
type ChipLimpio = { producto: string; marca: string; imei: string; celular: string };

function exigir(entrada: EntradaChip): ChipLimpio {
  const limpio = leer(entrada.producto ?? '', entrada.marca ?? '', entrada.imei ?? '', entrada.celular ?? '');
  if (typeof limpio === 'string') throw new BadRequestException(limpio);
  return limpio;
}

function bufferDe(contenido: Buffer | string): Buffer {
  if (Buffer.isBuffer(contenido)) return contenido;
  return Buffer.from(contenido, 'base64');
}

function textoEstado(estado: string, telemetria: string, orden: string): string {
  if (estado === 'disponible') return 'Sigue disponible como chip.';
  if (estado === 'sin_dato') return 'Odoo no tiene ese celular como número de serie.';
  return `Ocupado en ${telemetria || 'una telemetría'}${orden ? ` (${orden})` : ''}.`;
}

function instante(fecha: string | null): string | null {
  if (!fecha) return null;
  const normal = fecha.includes('T') ? fecha : fecha.replace(' ', 'T');
  return /z$/i.test(normal) || /[+-]\d{2}/.test(normal) ? normal : `${normal}Z`;
}

function conflicto(): ConflictException {
  return new ConflictException('Ese IMEI ya está cargado. Elimina el otro para guardar este.');
}

function leer(producto: string, marca: string, imei: string, celular: string): { producto: string; marca: string; imei: string; celular: string } | string {
  const nombre = textoPlano(producto);
  const casa = textoPlano(marca);
  if (!nombre || !casa) return 'Falta el producto o la marca.';
  if (/e/i.test(imei) || imei.includes('.')) return 'El IMEI llegó como número y puede perder dígitos. En el Excel esa columna tiene que ser texto.';
  const serie = normalizarImei(imei);
  const numero = normalizarCelular(celular);
  if (!serie) return 'El IMEI no es válido.';
  if (!numero) return 'El celular no es válido.';
  return { producto: nombre.slice(0, 160), marca: casa.slice(0, 80), imei: serie, celular: numero };
}

function patron(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  return `%${limpio.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

function codigoPg(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
}
