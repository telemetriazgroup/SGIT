import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { clienteHttp, type ClienteGenset } from './cliente';
import {
  conexionDe,
  esImei,
  esTramaNueva,
  firmaDeTrama,
  isoDe,
  leerLista,
  leerTrama,
  sinSecretos,
  vistaDeTrama,
  type ConexionGenset,
  type TramaVista,
} from './lectura';

const DIEZ_MINUTOS = 10 * 60 * 1000;

export type DispositivoGenset = {
  imei: string;
  estado: number;
  tipo: string;
  fecha: string | null;
  ultimo_dato: string | null;
  last_ip: string | null;
  secured: boolean;
  presente: boolean;
  conexion: ConexionGenset;
  tramas: number;
  consultado_en: string | null;
  consultado_por: string;
};

export type ListaGenset = {
  dispositivos: DispositivoGenset[];
  total: number;
  en_linea: number;
  recientes: number;
  sin_reporte: number;
  sincronizado_en: string | null;
  coleccion: string;
  aviso: string;
};

export type ConsultaGenset = {
  imei: string;
  nueva: boolean;
  mensaje: string;
  trama: TramaVista | null;
  historial: TramaVista[];
};

type FilaDispositivo = {
  imei: string;
  estado: number;
  tipo: string;
  fecha: Date | string | null;
  ultimo_dato: Date | string | null;
  last_ip: string | null;
  secured: boolean;
  presente: boolean;
  consultado_en: Date | string | null;
  consultado_por: string;
  tramas: number;
};

type FilaTrama = {
  id: string;
  consultado_en: Date | string;
  consultado_por: string;
  crudo: Record<string, unknown>;
};

export class PulsoGenset {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly genset: GensetService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.genset.sincronizar().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'falló la lista de generadores';
        console.error(`GENSET: ${mensaje}`);
      });
    }, DIEZ_MINUTOS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export class GensetService {
  private vuelo: Promise<ListaGenset> | null = null;
  private readonly cliente: ClienteGenset;

  constructor(
    private readonly conexiones: Conexiones,
    cliente?: ClienteGenset,
  ) {
    this.cliente = cliente ?? clienteHttp();
  }

  async listar(busqueda = ''): Promise<ListaGenset> {
    const filas = await this.conexiones.pg.query<FilaDispositivo>(
      `SELECT imei, estado, tipo, fecha, ultimo_dato, last_ip, secured, presente,
              consultado_en, consultado_por,
              (SELECT count(*)::int FROM genset_trama t WHERE t.imei = d.imei) AS tramas
       FROM genset_dispositivo d
       ORDER BY presente DESC, ultimo_dato DESC NULLS LAST, imei`,
    );
    const meta = await this.conexiones.pg.query<{ consultado_en: Date | string | null; coleccion: string; aviso: string }>(
      `SELECT consultado_en, coleccion, aviso FROM genset_lista WHERE id = true`,
    );
    const ahora = new Date();
    const texto = busqueda.trim();
    const dispositivos = filas.rows
      .map((fila) => this.dispositivo(fila, ahora))
      .filter((equipo) => !texto || equipo.imei.includes(texto));
    const cabecera = meta.rows[0];
    return {
      dispositivos,
      total: dispositivos.length,
      en_linea: dispositivos.filter((equipo) => equipo.conexion === 'en_linea').length,
      recientes: dispositivos.filter((equipo) => equipo.conexion === 'reciente').length,
      sin_reporte: dispositivos.filter((equipo) => equipo.conexion === 'sin_reporte').length,
      sincronizado_en: iso(cabecera?.consultado_en ?? null),
      coleccion: cabecera?.coleccion ?? '',
      aviso: cabecera?.aviso ?? '',
    };
  }

  async sincronizar(): Promise<ListaGenset> {
    if (this.vuelo) return this.vuelo;
    this.vuelo = this.bajarLista().finally(() => {
      this.vuelo = null;
    });
    return this.vuelo;
  }

  async historial(imei: string): Promise<ConsultaGenset> {
    const limpio = imei.trim();
    if (!esImei(limpio)) throw new BadRequestException('El IMEI tiene que ser numérico.');
    const existe = await this.conexiones.pg.query(`SELECT 1 FROM genset_dispositivo WHERE imei = $1`, [limpio]);
    if ((existe.rowCount ?? 0) === 0) throw new NotFoundException('Ese IMEI no está en la lista de generadores.');
    const historial = await this.leerHistorial(limpio);
    return { imei: limpio, nueva: false, mensaje: '', trama: historial[0] ?? null, historial };
  }

  async consultar(imei: string, correo: string): Promise<ConsultaGenset> {
    const limpio = imei.trim();
    if (!esImei(limpio)) throw new BadRequestException('El IMEI tiene que ser numérico.');
    const cuerpo = await this.cliente.live(limpio);
    const leida = leerTrama(cuerpo, limpio);
    if ('error' in leida) throw new BadGatewayException(leida.error);
    const crudo = sinSecretos(leida.data);
    const firma = firmaDeTrama(crudo);
    const nueva = await this.guardarSiCambia(limpio, firma, correo, crudo);
    const historial = await this.leerHistorial(limpio);
    return { imei: limpio, nueva, mensaje: leida.mensaje, trama: historial[0] ?? null, historial };
  }

  private async bajarLista(): Promise<ListaGenset> {
    const cuerpo = await this.cliente.listar();
    const leida = leerLista(cuerpo);
    if ('error' in leida) throw new BadGatewayException(leida.error);
    const aviso = leida.dispositivos.length === 0 ? 'La lista llegó vacía. Se conservan los equipos ya guardados.' : '';
    await this.guardarLista(leida, aviso);
    return this.listar('');
  }

  private async guardarLista(lista: { coleccion: string; mes: number | null; anio: number | null; dispositivos: Array<{ imei: string; estado: number; fecha: string | null; tipo: string; ultimo_dato: string | null; last_ip: string | null; secured: boolean }> }, aviso: string): Promise<void> {
    const visto = new Date();
    const db = await this.conexiones.pg.connect();
    try {
      await db.query('BEGIN');
      if (lista.dispositivos.length > 0) await db.query(`UPDATE genset_dispositivo SET presente = false`);
      for (const equipo of lista.dispositivos) {
        await db.query(
          `INSERT INTO genset_dispositivo (imei, estado, fecha, tipo, ultimo_dato, last_ip, secured, presente, visto_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
           ON CONFLICT (imei) DO UPDATE SET
             estado = EXCLUDED.estado,
             fecha = EXCLUDED.fecha,
             tipo = EXCLUDED.tipo,
             ultimo_dato = EXCLUDED.ultimo_dato,
             last_ip = EXCLUDED.last_ip,
             secured = EXCLUDED.secured,
             presente = true,
             visto_en = EXCLUDED.visto_en`,
          [equipo.imei, equipo.estado, equipo.fecha, equipo.tipo, equipo.ultimo_dato, equipo.last_ip, equipo.secured, visto],
        );
      }
      await db.query(
        `INSERT INTO genset_lista (id, consultado_en, coleccion, mes, anio, total, aviso)
         VALUES (true, $1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           consultado_en = EXCLUDED.consultado_en,
           coleccion = EXCLUDED.coleccion,
           mes = EXCLUDED.mes,
           anio = EXCLUDED.anio,
           total = EXCLUDED.total,
           aviso = EXCLUDED.aviso`,
        [visto, lista.coleccion, lista.mes, lista.anio, lista.dispositivos.length, aviso],
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  private async guardarSiCambia(imei: string, firma: string, correo: string, crudo: Record<string, unknown>): Promise<boolean> {
    const estado = typeof crudo.estado === 'number' ? crudo.estado : null;
    const tipo = typeof crudo.tipo_dispositivo === 'string' ? crudo.tipo_dispositivo : '';
    const ultimo = isoDe(crudo.fecha);
    const secured = crudo.secured === true;
    const db = await this.conexiones.pg.connect();
    try {
      await db.query('BEGIN');
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [imei]);
      await db.query(
        `INSERT INTO genset_dispositivo (imei, estado, tipo, ultimo_dato, secured, presente, visto_en)
         VALUES ($1, COALESCE($2, 0), $3, $4, $5, false, now())
         ON CONFLICT (imei) DO NOTHING`,
        [imei, estado, tipo, ultimo, secured],
      );
      const previa = await db.query<{ firma: string }>(
        `SELECT firma FROM genset_trama WHERE imei = $1 ORDER BY consultado_en DESC LIMIT 1`,
        [imei],
      );
      const nueva = esTramaNueva(previa.rows[0]?.firma ?? null, firma);
      if (nueva) {
        await db.query(
          `INSERT INTO genset_trama (id, imei, firma, consultado_por, crudo) VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [randomUUID(), imei, firma, correo, JSON.stringify(crudo)],
        );
      }
      await db.query(
        `UPDATE genset_dispositivo SET
           consultado_en = now(),
           consultado_por = $2,
           estado = COALESCE($3, estado),
           tipo = CASE WHEN $4 <> '' THEN $4 ELSE tipo END,
           secured = $5,
           ultimo_dato = CASE
             WHEN $6::timestamptz IS NULL THEN ultimo_dato
             WHEN ultimo_dato IS NULL OR $6::timestamptz > ultimo_dato THEN $6::timestamptz
             ELSE ultimo_dato
           END
         WHERE imei = $1`,
        [imei, correo, estado, tipo, secured, ultimo],
      );
      await db.query('COMMIT');
      return nueva;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  private async leerHistorial(imei: string): Promise<TramaVista[]> {
    const filas = await this.conexiones.pg.query<FilaTrama>(
      `SELECT id, consultado_en, consultado_por, crudo
       FROM genset_trama
       WHERE imei = $1
       ORDER BY consultado_en DESC
       LIMIT 100`,
      [imei],
    );
    return filas.rows.map((fila) =>
      vistaDeTrama({
        id: fila.id,
        consultado_en: iso(fila.consultado_en) ?? '',
        consultado_por: fila.consultado_por,
        crudo: fila.crudo ?? {},
      }),
    );
  }

  private dispositivo(fila: FilaDispositivo, ahora: Date): DispositivoGenset {
    const ultimo = iso(fila.ultimo_dato);
    return {
      imei: fila.imei,
      estado: fila.estado,
      tipo: fila.tipo,
      fecha: iso(fila.fecha),
      ultimo_dato: ultimo,
      last_ip: fila.last_ip,
      secured: fila.secured,
      presente: fila.presente,
      conexion: conexionDe(ultimo, ahora),
      tramas: fila.tramas,
      consultado_en: iso(fila.consultado_en),
      consultado_por: fila.consultado_por,
    };
  }
}

function iso(valor: Date | string | null): string | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}
