import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { dictaminar, referenciasCitadas, type Clase } from './clasificar';
import { extraer, type Extraccion } from './extraer';
import { AREAS, armarSeguimiento, resumenHilo, type ResumenHilo, type Seguimiento } from './seguimiento';
import { AlmacenCorreo } from '../buzon/almacen';
import { barridoCorre, entraHoraria } from './barrido';
import { evaluarCita, type Cita } from './cita';
import { cotsDe, normalizarFecha, plano } from './texto';
import { BotService } from '../bot/bot.service';
import { OdooServicio, type LecturaTarea } from '../odoo/servicio';
import { claveTienda, coincideTienda, tiendasDeHtml, tiendasDeTexto, type TiendaLeida } from './campana';
import { vincularHijas } from './hijas';
import { ajustarHilos, corregirEquipo, listarHilos } from './hilos';
import { FabricacionServicio } from '../fabricacion/servicio';
import { recibirFotoRegularizacion, registrarChip, registrarModem, releerFotoGuardada } from './regularizar';
import { joinUrgente, ordenFecha, ordenUrgente } from './prioridad';

export type ResultadoProceso = {
  mensajeId: string;
  clasificacion: Clase | 'archivado' | 'resuelto';
  cot: string | null;
  tareaId: string | null;
  creada: boolean;
  avisos: 0;
  motivo: 'dos cot' | 'sin referencia' | 'falta cot' | 'interna' | null;
};

type Autor = { correo: string; nombre: string };
type ArchivoNota = { nombre: string; mime: string; contenido: Buffer };

type FilaMensaje = {
  id: string;
  gmail_thread_id: string;
  asunto: string;
  de: string;
  texto: string;
  fecha: Date | string | null;
};

export class TareasService {
  private readonly odoo: OdooServicio;

  constructor(private readonly conexiones: Conexiones) {
    this.odoo = new OdooServicio(conexiones);
  }

  async procesarMensaje(id: string): Promise<ResultadoProceso> {
    const mensaje = await this.mensaje(id);
    if (!mensaje) throw new NotFoundException('No está ese correo.');
    return this.aplicar(mensaje);
  }

  async procesarHilo(id: string): Promise<{ resultados: ResultadoProceso[]; tareas: number }> {
    const ancla = await this.mensaje(id);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const hermanos = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM mensaje_correo
       WHERE gmail_thread_id = $1
       ORDER BY fecha ASC NULLS LAST, creado_en ASC`,
      [ancla.gmail_thread_id],
    );
    const resultados: ResultadoProceso[] = [];
    for (const hermano of hermanos.rows) {
      const mensaje = await this.mensaje(hermano.id);
      if (mensaje) resultados.push(await this.aplicar(mensaje));
    }
    const tareas = new Set(resultados.map((resultado) => resultado.tareaId).filter(Boolean));
    return { resultados, tareas: tareas.size };
  }

  async procesarPendientes(): Promise<{ mensajes: number; nuevas: number }> {
    const filas = await this.conexiones.pg.query<FilaMensaje>(
      `SELECT id, gmail_thread_id, asunto, de, texto, fecha
       FROM mensaje_correo
       WHERE clasificacion IS NULL AND replica = 'completo'
       ORDER BY fecha ASC NULLS LAST, creado_en ASC`,
    );
    if (filas.rows.length === 0) return { mensajes: 0, nuevas: 0 };
    const terminos = await this.terminosActivos();
    let nuevas = 0;
    for (const fila of filas.rows) {
      const resultado = await this.aplicar(fila, terminos);
      if (resultado.creada) nuevas += 1;
    }
    return { mensajes: filas.rows.length, nuevas };
  }

  private async resueltaQueCita(cot: string | null): Promise<string | null> {
    const numeros = (cot ?? '').split('+').filter((numero) => /^1002\d{7}$/.test(numero));
    if (numeros.length === 0) return null;
    const exacta = await this.conexiones.pg.query<{ id: string; estado: string }>(
      `SELECT id, estado FROM tarea WHERE cot = $1`,
      [cot],
    );
    if (exacta.rows[0]?.estado === 'resuelta') return exacta.rows[0].id;
    if (exacta.rows[0]) return null;
    const cubiertas = await this.conexiones.pg.query<{ id: string; cot: string; cots: string[] | null }>(
      `SELECT id, cot, cots FROM tarea
       WHERE estado = 'resuelta'
         AND (cot = ANY($1::text[]) OR cots && $1::text[])
       ORDER BY creado_en DESC`,
      [numeros],
    );
    const vistos = new Set<string>();
    for (const fila of cubiertas.rows) {
      if (numeros.includes(fila.cot)) vistos.add(fila.cot);
      for (const numero of fila.cots ?? []) {
        if (numeros.includes(numero)) vistos.add(numero);
      }
    }
    if (vistos.size === numeros.length && cubiertas.rows[0]) return cubiertas.rows[0].id;
    return null;
  }

  async procesarDesde(desde: Date): Promise<{
    mensajes: number;
    nuevas: number;
    repetidas: number;
    pendientes: number;
    otros: number;
  }> {
    const terminos = await this.terminosActivos();
    const filas = await this.conexiones.pg.query<FilaMensaje>(
      `SELECT id, gmail_thread_id, asunto, de, texto, fecha
       FROM mensaje_correo
       WHERE fecha >= $1
       ORDER BY fecha ASC NULLS LAST, creado_en ASC`,
      [desde],
    );
    const cuenta = { mensajes: filas.rows.length, nuevas: 0, repetidas: 0, pendientes: 0, otros: 0, internos: 0 };
    for (const fila of filas.rows) {
      const resultado = await this.aplicar(fila, terminos);
      if (resultado.clasificacion === 'otros') cuenta.otros += 1;
      else if (resultado.clasificacion === 'pendiente') cuenta.pendientes += 1;
      else if (resultado.clasificacion === 'interna') cuenta.internos += 1;
      else if (resultado.creada) cuenta.nuevas += 1;
      else cuenta.repetidas += 1;
    }
    await this.retirarSinEncargo();
    return cuenta;
  }

  async listar(pagina: number, busqueda = '', resueltas = false, verOcultas = true): Promise<PaginaTareas> {
    const cuentas = await this.cuentas(verOcultas);
    const filtro = patronTexto(busqueda);
    const estado = resueltas ? `tarea.estado = 'resuelta'` : `tarea.estado <> 'resuelta'`;
    const donde = `WHERE ($1::text IS NULL
         OR cot ILIKE $1 ESCAPE '\\'
         OR coalesce(cliente, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(lugar, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(ticket, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(descripcion, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(comercial_nombre, '') ILIKE $1 ESCAPE '\\'
         OR array_to_string(cots, ' ') ILIKE $1 ESCAPE '\\'
         OR array_to_string(referencias, ' ') ILIKE $1 ESCAPE '\\'
         OR EXISTS (
           SELECT 1 FROM tienda buscada
           WHERE buscada.tarea_id = tarea.id
             AND (buscada.nombre ILIKE $1 ESCAPE '\\' OR buscada.cadena ILIKE $1 ESCAPE '\\')
         ))
       AND tarea.padre_id IS NULL
       AND tarea.cot <> '10000000000'
       AND ${estado}`;
    const publicada = `AND ($2::boolean OR EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text))`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM tarea ${donde} ${publicada}`, [filtro, verOcultas]);
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const resultado = await this.conexiones.pg.query<FilaTarea>(
      `SELECT tarea.id, tarea.cot, tarea.cots, tarea.referencias, tarea.estado, tarea.ticket, tarea.lugar, tarea.cliente, tarea.descripcion, tarea.cita_fecha, tarea.cita_hora,
              tarea.comercial_nombre, ult.fecha,
              tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora,
              (SELECT count(*)::int FROM tienda WHERE tienda.tarea_id = tarea.id) AS locales,
              EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text) AS habilitada
       FROM tarea
       LEFT JOIN LATERAL (
         SELECT max(c.fecha) AS fecha
         FROM mensaje_correo origen
         JOIN mensaje_correo c ON c.gmail_thread_id = origen.gmail_thread_id
         WHERE origen.id = tarea.mensaje_id
       ) ult ON true
       ${joinUrgente('tarea')}
       ${donde}
       AND ($4::boolean OR EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text))
       ORDER BY habilitada DESC, ${ordenUrgente('tarea')}
       LIMIT $2 OFFSET $3`,
      [filtro, TAMANO, (actual - 1) * TAMANO, verOcultas],
    );
    return { tareas: resultado.rows, total, pagina: actual, paginas, cuentas };
  }

  async sector(
    nombre: 'pendiente' | 'otros' | 'internos',
    pagina: number,
    area: string | null,
    busqueda = '',
    atencion: 'por_atender' | 'atendido' | 'resuelto' | null = null,
    verOcultas = true,
  ): Promise<PaginaSector> {
    const cuentas = await this.cuentas(verOcultas);
    const patron = patronArea(area);
    const texto = patronTexto(busqueda);
    const filtro =
      nombre === 'pendiente'
        ? 'h.pendiente AND NOT h.tarea AND NOT h.interna AND NOT h.archivado AND NOT h.resuelto'
        : nombre === 'internos'
          ? 'h.interna AND NOT h.tarea AND NOT h.archivado AND NOT h.resuelto'
          : 'NOT h.tarea AND NOT h.pendiente AND NOT h.interna AND NOT h.archivado AND NOT h.resuelto';
    const publicada =
      verOcultas || nombre === 'otros'
        ? ''
        : `AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = '${nombre === 'internos' ? 'interno' : 'decision'}' AND pub.clave = h.gmail_thread_id)`;
    const porArea = `AND ($1::text IS NULL OR EXISTS (
      SELECT 1 FROM mensaje_correo c
      WHERE c.gmail_thread_id = h.gmail_thread_id
        AND regexp_replace(
              regexp_replace(c.texto, '[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+', ' ', 'gi'),
              'ztrack telemetr(y|ia)', ' ', 'gi'
            ) ~* $1
    ))`;
    const porTexto = `AND ($2::text IS NULL OR EXISTS (
      SELECT 1 FROM mensaje_correo b
      WHERE b.gmail_thread_id = h.gmail_thread_id
        AND (coalesce(b.asunto, '') ILIKE $2 ESCAPE '\\' OR coalesce(b.de, '') ILIKE $2 ESCAPE '\\')
    ))`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(
      `WITH hilos AS (
         SELECT gmail_thread_id,
                bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'pendiente') AS pendiente,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'archivado') AS archivado,
                bool_or(clasificacion = 'resuelto') AS resuelto
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT count(*)::text AS total
       FROM hilos h
       LEFT JOIN asunto_interno a ON a.gmail_thread_id = h.gmail_thread_id
       WHERE ${filtro} ${porArea} ${porTexto} ${publicada}
         AND (
           ($3::text IS NULL AND coalesce(a.estado, 'por_atender') <> 'resuelto')
           OR coalesce(a.estado, 'por_atender') = $3
         )`,
      [patron, texto, atencion],
    );
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const resultado = await this.conexiones.pg.query<FilaSector>(
      `WITH hilos AS (
         SELECT gmail_thread_id,
                bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'pendiente') AS pendiente,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'archivado') AS archivado,
                bool_or(clasificacion = 'resuelto') AS resuelto
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT m.id, m.gmail_thread_id, m.asunto, m.de, m.fecha, m.correos,
              coalesce(a.estado, 'por_atender') AS atencion,
              EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = '${nombre === 'internos' ? 'interno' : nombre === 'pendiente' ? 'decision' : 'tarea'}' AND pub.clave = h.gmail_thread_id) AS habilitada
       FROM hilos h
       LEFT JOIN asunto_interno a ON a.gmail_thread_id = h.gmail_thread_id
       JOIN LATERAL (
         SELECT id, gmail_thread_id, asunto, de, fecha, creado_en,
                (SELECT count(*)::int FROM mensaje_correo c WHERE c.gmail_thread_id = h.gmail_thread_id) AS correos
         FROM mensaje_correo
         WHERE gmail_thread_id = h.gmail_thread_id
         ORDER BY fecha DESC NULLS LAST, creado_en DESC
         LIMIT 1
       ) m ON true
       WHERE ${filtro} ${porArea} ${porTexto} ${publicada}
         AND (
           ($3::text IS NULL AND coalesce(a.estado, 'por_atender') <> 'resuelto')
           OR coalesce(a.estado, 'por_atender') = $3
         )
       ORDER BY m.fecha DESC NULLS LAST, m.creado_en DESC
       LIMIT $4 OFFSET $5`,
      [patron, texto, atencion, TAMANO, (actual - 1) * TAMANO],
    );
    const correos = await this.conResumen(resultado.rows);
    return { correos, total, pagina: actual, paginas, cuentas, areas: [...AREAS] };
  }

  async resumenDeMensaje(
    id: string,
  ): Promise<
    ResumenHilo & {
      id: string;
      asunto: string;
      de: string;
      fecha: Date | null;
      atencion: 'por_atender' | 'atendido' | 'resuelto';
      respuesta: string;
      cierreArchivo: boolean;
      notas: NotaBitacora[];
    }
  > {
    const ancla = await this.mensaje(id);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const filas = await this.conexiones.pg.query<{ de: string; fecha: Date | null; asunto: string; texto: string }>(
      `SELECT de, fecha, asunto, texto
       FROM mensaje_correo
       WHERE gmail_thread_id = $1
       ORDER BY fecha ASC NULLS LAST, creado_en ASC
       LIMIT 40`,
      [ancla.gmail_thread_id],
    );
    const terminos = await this.terminosActivos();
    const resumen = resumenHilo(filas.rows, terminos);
    const ultimo = filas.rows.at(-1);
    const atencion = await this.leerAtencion(ancla.gmail_thread_id);
    const notas = await this.conexiones.pg.query<NotaBitacora>(
      `SELECT id, tarea_id, tipo, canal, texto, autor_nombre, autor_correo, archivo_nombre, archivo_mime, anula_id, creado_en
       FROM nota_bitacora WHERE gmail_thread_id = $1 ORDER BY creado_en`,
      [ancla.gmail_thread_id],
    );
    return { id, asunto: ultimo?.asunto ?? ancla.asunto, de: ultimo?.de ?? '', fecha: ultimo?.fecha ?? null, ...resumen, ...atencion, notas: notas.rows };
  }

  async ficha(id: string): Promise<(FilaTarea & { seguimiento: Seguimiento }) | null> {
    const resultado = await this.conexiones.pg.query<FilaTarea>(`SELECT * FROM tarea WHERE id = $1`, [id]);
    const tarea = resultado.rows[0];
    if (!tarea) return null;
    const guardados = Array.isArray(tarea.cots) ? tarea.cots.map(String) : [];
    const numeros = (guardados.length > 0 ? guardados : String(tarea.cot ?? '').split('+')).filter((numero) => /^\d{6,}$/.test(numero));
    if (numeros.length === 0) {
      return {
        ...tarea,
        seguimiento: { momento: null, areas: [], linea: [] },
        situaciones: await this.situacionesDe(tarea.id),
        ...(await this.capaBitacora(tarea)),
        borrador: await this.borradorDe(tarea.id),
        asignacion: await this.asignacionConfirmada(tarea.id),
        movimientos: await this.movimientosDespacho(tarea.id),
        hilos: await listarHilos(this.conexiones.pg, tarea.id),
        fabricaciones: await new FabricacionServicio(this.conexiones).deTarea(tarea.id),
        odoo: await this.odooDe(tarea),
        ...(await this.capaCampana(tarea)),
      };
    }
    const donde = numeros
      .map((_, indice) => `asunto ~ ('(^|[^0-9])' || $${indice + 1} || '([^0-9]|$)') OR texto ~ ('(^|[^0-9])' || $${indice + 1} || '([^0-9]|$)')`)
      .join(' OR ');
    const mensajes = await this.conexiones.pg.query<{ de: string; fecha: Date | null; asunto: string; texto: string }>(
      `SELECT de, fecha, asunto, texto
       FROM mensaje_correo
       WHERE ${donde}
       ORDER BY fecha ASC NULLS LAST, creado_en ASC
       LIMIT 80`,
      numeros,
    );
    const terminos = await this.terminosActivos();
    const situaciones = await this.situacionesDe(tarea.id);
    return {
      ...tarea,
      seguimiento: armarSeguimiento(mensajes.rows, terminos),
      situaciones,
      ...(await this.capaBitacora(tarea)),
      borrador: await this.borradorDe(tarea.id),
      asignacion: await this.asignacionConfirmada(tarea.id),
      movimientos: await this.movimientosDespacho(tarea.id),
      hilos: await listarHilos(this.conexiones.pg, tarea.id),
      fabricaciones: await new FabricacionServicio(this.conexiones).deTarea(tarea.id),
      odoo: await this.odooDe(tarea),
      ...(await this.capaCampana(tarea)),
    };
  }

  async vincularOdoo(tareaId: string, clase: string, odooId: number): Promise<void> {
    if (clase !== 'venta' && clase !== 'ticket') throw new BadRequestException('El vínculo es de venta o de ticket.');
    if (!Number.isInteger(odooId) || odooId <= 0) throw new BadRequestException('Elige un documento de la lista.');
    await this.conexiones.pg.query(
      `INSERT INTO vinculo_odoo (tarea_id, clase, odoo_id) VALUES ($1, $2, $3)
       ON CONFLICT (tarea_id, clase) DO UPDATE SET odoo_id = EXCLUDED.odoo_id`,
      [tareaId, clase, odooId],
    );
  }

  configuracionOdoo() {
    return this.odoo.publica();
  }

  guardarOdoo(entrada: { url?: string; db?: string; usuario?: string; clave?: string; sesionUsuario?: string; sesionClave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string }) {
    return this.odoo.guardar(entrada);
  }

  probarOdoo(entrada: { url?: string; db?: string; usuario?: string; clave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string }) {
    return this.odoo.probar(entrada);
  }

  actualizarOdoo(id: string) {
    return this.fichaConOdoo(id, true);
  }

  private async odooDe(tarea: FilaTarea): Promise<LecturaTarea | null> {
    const lectura = await this.odoo.deTarea({ id: tarea.id, cot: tarea.cot, ticket: tarea.ticket, estado: tarea.estado }, false);
    if (tarea.campana) await this.asimilarServicios(tarea, lectura?.venta.odoo_id ?? null);
    return lectura;
  }

  async marcarCampana(id: string): Promise<void> {
    const tarea = await this.conexiones.pg.query<{ cot: string }>(`SELECT cot FROM tarea WHERE id = $1`, [id]);
    if (!tarea.rows[0]) throw new NotFoundException('No está esa tarea.');
    await this.conexiones.pg.query(
      `UPDATE tarea SET campana = true, estado = CASE WHEN estado = 'resuelta' THEN 'en_seguimiento' ELSE estado END WHERE id = $1`,
      [id],
    );
    await this.incorporarTiendas(id, tarea.rows[0].cot);
  }

  async realizarTienda(tareaId: string, tiendaId: string, codigo: string): Promise<void> {
    await vincularHijas(this.conexiones.pg, tareaId);
    const resultado = await this.conexiones.pg.query(
      `UPDATE tienda SET estado = 'resuelta', codigo_equipo = COALESCE(NULLIF($3, ''), codigo_equipo) WHERE id = $1 AND tarea_id = $2`,
      [tiendaId, tareaId, codigo.trim()],
    );
    if (resultado.rowCount === 0) throw new NotFoundException('No está esa tienda.');
    await this.conexiones.pg.query(
      `UPDATE tarea SET estado = 'resuelta'
       WHERE id = (SELECT tarea_hija_id FROM tienda WHERE id = $1) AND estado <> 'resuelta'`,
      [tiendaId],
    );
  }

  async atenderTienda(tareaId: string, tiendaId: string): Promise<void> {
    await vincularHijas(this.conexiones.pg, tareaId);
    const resultado = await this.conexiones.pg.query(
      `UPDATE tienda SET estado = 'atendida' WHERE id = $1 AND tarea_id = $2 AND estado <> 'resuelta'`,
      [tiendaId, tareaId],
    );
    if (resultado.rowCount === 0) throw new NotFoundException('No está esa tienda.');
  }

  private async incorporarTiendas(tareaId: string, cot: string): Promise<number> {
    const mensajes = await this.conexiones.pg.query<{ html: string; texto: string }>(
      `SELECT html, texto FROM mensaje_correo
       WHERE asunto ~ ('(^|[^0-9])' || $1 || '([^0-9]|$)') OR texto ~ ('(^|[^0-9])' || $1 || '([^0-9]|$)')
       ORDER BY fecha ASC NULLS LAST`,
      [cot],
    );
    const leidas = new Map<string, TiendaLeida>();
    for (const mensaje of mensajes.rows) {
      const delHtml = tiendasDeHtml(mensaje.html ?? '');
      const lista = delHtml.length > 0 ? delHtml : tiendasDeTexto(mensaje.texto ?? '');
      for (const tienda of lista) leidas.set(claveTienda(tienda.cadena, tienda.tienda), tienda);
    }
    for (const tienda of leidas.values()) {
      await this.conexiones.pg.query(
        `INSERT INTO tienda (id, tarea_id, clave, orden, cadena, nombre, contacto, celular, entrega_fecha, entrega_hora, status, tamano, direccion, mapa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tarea_id, clave) DO UPDATE SET
           orden = COALESCE(EXCLUDED.orden, tienda.orden),
           contacto = CASE WHEN EXCLUDED.contacto <> '' THEN EXCLUDED.contacto ELSE tienda.contacto END,
           celular = CASE WHEN EXCLUDED.celular <> '' THEN EXCLUDED.celular ELSE tienda.celular END,
           entrega_fecha = COALESCE(EXCLUDED.entrega_fecha, tienda.entrega_fecha),
           entrega_hora = CASE WHEN EXCLUDED.entrega_hora <> '' THEN EXCLUDED.entrega_hora ELSE tienda.entrega_hora END,
           status = CASE WHEN EXCLUDED.status <> '' THEN EXCLUDED.status ELSE tienda.status END,
           tamano = CASE WHEN EXCLUDED.tamano <> '' THEN EXCLUDED.tamano ELSE tienda.tamano END,
           direccion = CASE WHEN EXCLUDED.direccion <> '' THEN EXCLUDED.direccion ELSE tienda.direccion END,
           mapa = CASE WHEN EXCLUDED.mapa <> '' THEN EXCLUDED.mapa ELSE tienda.mapa END`,
        [
          randomUUID(),
          tareaId,
          claveTienda(tienda.cadena, tienda.tienda),
          tienda.orden,
          tienda.cadena,
          tienda.tienda,
          tienda.contacto,
          tienda.celular,
          tienda.entregaFecha,
          tienda.entregaHora,
          tienda.status,
          tienda.tamano,
          tienda.direccion,
          tienda.mapa,
        ],
      );
    }
    await vincularHijas(this.conexiones.pg, tareaId);
    return leidas.size;
  }

  private async asimilarServicios(tarea: FilaTarea, ordenId: number | null): Promise<void> {
    try {
      const servicios = await this.odoo.listarServicios(String(tarea.cot ?? ''), ordenId);
      for (const servicio of servicios) {
        await this.conexiones.pg.query(
          `INSERT INTO servicio_odoo (tarea_id, odoo_id, nombre, estado)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tarea_id, odoo_id) DO UPDATE SET nombre = EXCLUDED.nombre, estado = EXCLUDED.estado`,
          [tarea.id, servicio.id, servicio.nombre, servicio.estado],
        );
      }
      const tiendas = await this.conexiones.pg.query<{ id: string; nombre: string }>(`SELECT id, nombre FROM tienda WHERE tarea_id = $1`, [tarea.id]);
      const libres = await this.conexiones.pg.query<{ odoo_id: number; nombre: string; estado: string }>(
        `SELECT odoo_id, nombre, estado FROM servicio_odoo WHERE tarea_id = $1 AND tienda_id IS NULL`,
        [tarea.id],
      );
      for (const servicio of libres.rows) {
        const coinciden = tiendas.rows.filter((tienda) => coincideTienda(servicio.nombre, tienda.nombre));
        if (coinciden.length !== 1) continue;
        await this.conexiones.pg.query(
          `UPDATE servicio_odoo SET tienda_id = $3 WHERE tarea_id = $1 AND odoo_id = $2 AND tienda_id IS NULL`,
          [tarea.id, servicio.odoo_id, coinciden[0].id],
        );
        await this.conexiones.pg.query(
          `UPDATE tienda SET odoo_id = $2, odoo_nombre = $3, odoo_estado = $4 WHERE id = $1 AND (odoo_id IS NULL OR odoo_id = $2)`,
          [coinciden[0].id, servicio.odoo_id, servicio.nombre, servicio.estado],
        );
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Odoo no respondió.';
      console.error(`Campaña: ${mensaje.slice(0, 200)}`);
    }
  }

  private async capaCampana(tarea: FilaTarea): Promise<{ campana: boolean; tiendas: TiendaGuardada[]; servicios: ServicioGuardado[] }> {
    if (!tarea.campana) return { campana: false, tiendas: [], servicios: [] };
    const faltan = await this.conexiones.pg.query(`SELECT 1 FROM tienda WHERE tarea_id = $1 AND tarea_hija_id IS NULL LIMIT 1`, [tarea.id]);
    if (faltan.rows[0]) await vincularHijas(this.conexiones.pg, tarea.id);
    const tiendas = await this.conexiones.pg.query<TiendaGuardada>(
      `SELECT id, orden, cadena, nombre, contacto, celular, entrega_fecha, entrega_hora, status, tamano, direccion, mapa, estado, codigo_equipo, odoo_id, odoo_nombre, odoo_estado
       FROM tienda WHERE tarea_id = $1 ORDER BY ${ordenFecha('entrega_fecha', 'orden NULLS LAST, nombre')}`,
      [tarea.id],
    );
    const notas = await this.conexiones.pg.query<{ id: string; tienda_id: string; tipo: string; texto: string; autor_nombre: string; creado_en: Date }>(
      `SELECT n.id, COALESCE(n.tienda_id, h.id) AS tienda_id, n.tipo, n.texto, n.autor_nombre, n.creado_en
       FROM nota_bitacora n
       LEFT JOIN tienda h ON h.tarea_hija_id = n.tarea_id AND h.tarea_id = $1
       WHERE n.tienda_id IN (SELECT id FROM tienda WHERE tarea_id = $1)
          OR h.id IS NOT NULL
       ORDER BY n.creado_en`,
      [tarea.id],
    );
    const servicios = await this.conexiones.pg.query<ServicioGuardado>(
      `SELECT odoo_id, nombre, estado, tienda_id FROM servicio_odoo WHERE tarea_id = $1 ORDER BY nombre`,
      [tarea.id],
    );
    return {
      campana: true,
      tiendas: tiendas.rows.map((tienda) => ({ ...tienda, notas: notas.rows.filter((nota) => nota.tienda_id === tienda.id) })),
      servicios: servicios.rows,
    };
  }

  private async fichaConOdoo(id: string, forzar: boolean) {
    const resultado = await this.conexiones.pg.query<FilaTarea>(`SELECT id, cot, ticket, estado FROM tarea WHERE id = $1`, [id]);
    const tarea = resultado.rows[0];
    if (!tarea) throw new NotFoundException('No está esa tarea.');
    await this.odoo.deTarea(tarea, forzar);
    return this.ficha(id);
  }

  async diccionario(): Promise<Array<{ id: string; termino: string; activo: boolean }>> {
    const resultado = await this.conexiones.pg.query<{ id: string; termino: string; activo: boolean }>(
      `SELECT id, termino, activo FROM termino_diccionario ORDER BY termino`,
    );
    return resultado.rows;
  }

  async agregarTermino(termino: string): Promise<{ id: string; termino: string; activo: boolean }> {
    const normalizado = plano(termino);
    if (!normalizado) throw new BadRequestException('Escribe un término.');
    const id = randomUUID();
    try {
      await this.conexiones.pg.query(
        `INSERT INTO termino_diccionario (id, termino, activo) VALUES ($1, $2, true)`,
        [id, normalizado],
      );
    } catch (error) {
      const codigo = (error as { code?: string }).code;
      if (codigo === '23505') throw new BadRequestException('Ese término ya está en el diccionario.');
      throw error;
    }
    return { id, termino: normalizado, activo: true };
  }

  async fijarTermino(id: string, activo: boolean): Promise<void> {
    const resultado = await this.conexiones.pg.query(`UPDATE termino_diccionario SET activo = $2 WHERE id = $1`, [id, activo]);
    if (resultado.rowCount === 0) throw new NotFoundException('No está ese término.');
  }

  async quitarTermino(id: string): Promise<void> {
    await this.conexiones.pg.query(`DELETE FROM termino_diccionario WHERE id = $1`, [id]);
  }

  private async aplicar(mensaje: FilaMensaje, terminos?: string[]): Promise<ResultadoProceso> {
    const activos = terminos ?? (await this.terminosActivos());
    const dictamen = dictaminar(mensaje.asunto, mensaje.texto, activos, mensaje.de ?? '');
    const manual = await this.destinoManual(mensaje.gmail_thread_id);
    const clasificacion = manual === 'evento' ? 'evento_desarrollo' : manual === 'resuelto' ? 'resuelto' : (manual ?? dictamen.clase);
    const lectura = extraer(mensaje.asunto, mensaje.texto, anioLima(mensaje.fecha));
    const numeros = cotsDe(mensaje.asunto);
    if (clasificacion === 'evento_desarrollo' && numeros.length > 0) {
      lectura.cot = { valor: [...numeros].sort().join('+'), fragmento: numeros.join(', ') };
    }
    const referencias = referenciasCitadas(mensaje.asunto, mensaje.texto, activos);
    await this.conexiones.pg.query(`UPDATE mensaje_correo SET clasificacion = $2, extraccion = $3::jsonb WHERE id = $1`, [
      mensaje.id,
      clasificacion,
      JSON.stringify(lectura),
    ]);
    if (clasificacion !== 'evento_desarrollo' || !lectura.cot.valor) {
      const anexa = await this.anexarPorHilo(mensaje, lectura);
      return { mensajeId: mensaje.id, clasificacion, cot: lectura.cot.valor, tareaId: anexa, creada: false, avisos: 0, motivo: dictamen.motivo };
    }
    const yaResuelta = await this.resueltaQueCita(lectura.cot.valor);
    if (yaResuelta) {
      await this.anotarSituacion(yaResuelta, mensaje, lectura);
      return { mensajeId: mensaje.id, clasificacion, cot: lectura.cot.valor, tareaId: yaResuelta, creada: false, avisos: 0, motivo: null };
    }
    const creada = await this.abrirTarea(mensaje.id, lectura, referencias);
    const existente = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = $1`, [lectura.cot.valor]);
    const tareaId = existente.rows[0]?.id ?? null;
    if (tareaId) await this.anotarSituacion(tareaId, mensaje, lectura);
    if (creada && tareaId) {
      await this.conexiones.pg.query(
        `INSERT INTO habilitado (clase, clave) VALUES ('tarea', $1) ON CONFLICT (clase, clave) DO NOTHING`,
        [tareaId],
      );
      await new BotService(this.conexiones).alNacer(tareaId);
    }
    return {
      mensajeId: mensaje.id,
      clasificacion,
      cot: lectura.cot.valor,
      tareaId,
      creada,
      avisos: 0,
      motivo: null,
    };
  }

  private async abrirTarea(mensajeId: string, lectura: Extraccion, referencias: string[]): Promise<boolean> {
    const cantidad = lectura.cantidad.valor ? Number(lectura.cantidad.valor) : null;
    const resultado = await this.conexiones.pg.query(
      `INSERT INTO tarea (
         id, cot, estado, ticket, descripcion, lugar, cliente, cantidad, temperatura, producto, contenedor,
         comercial_nombre, comercial_cargo, comercial_correo, comercial_telefono,
         cita_fecha, cita_hora, cita_direccion, cita_mapa, cita_parcial_fecha, cita_parcial_hora,
         fragmentos, mensaje_id, cots, referencias
       ) VALUES (
         $1,$2,'detectada',$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,
         $15,$16,$17,$18,$19,$20,
         $21::jsonb,$22,$23::text[],$24::text[]
       )
       ON CONFLICT (cot) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        lectura.cot.valor,
        lectura.ticket.valor,
        lectura.descripcion.valor,
        lectura.lugar.valor,
        lectura.cliente.valor,
        Number.isInteger(cantidad) ? cantidad : null,
        lectura.temperatura.valor,
        lectura.producto.valor,
        lectura.contenedor.valor,
        lectura.comercialNombre.valor,
        lectura.comercialCargo.valor,
        lectura.comercialCorreo.valor,
        lectura.comercialTelefono.valor,
        isoDe(lectura.fecha.fragmento, lectura.fecha.valor),
        lectura.hora.valor,
        lectura.direccion.valor,
        lectura.mapa.valor,
        isoDe(lectura.citaParcialFecha.fragmento, lectura.citaParcialFecha.valor),
        lectura.citaParcialHora.valor,
        JSON.stringify(lectura),
        mensajeId,
        lectura.cot.valor?.split('+') ?? [],
        referencias,
      ],
    );
    if ((resultado.rowCount ?? 0) > 0) return true;
    await this.completarTarea(lectura, referencias);
    return false;
  }

  private async completarTarea(lectura: Extraccion, referencias: string[]): Promise<void> {
    const cantidad = lectura.cantidad.valor ? Number(lectura.cantidad.valor) : null;
    const previa = await this.conexiones.pg.query<{ referencias: string[]; campos_corregidos: string[] }>(
      `SELECT referencias, campos_corregidos FROM tarea WHERE cot = $1`,
      [lectura.cot.valor],
    );
    const referenciasUnidas = unirReferencias(previa.rows[0]?.referencias ?? [], referencias);
    const protegidos = previa.rows[0]?.campos_corregidos ?? [];
    await this.conexiones.pg.query(
      `UPDATE tarea SET
         ticket = COALESCE(ticket, $2),
         descripcion = CASE
           WHEN 'descripcion' = ANY($21::text[]) THEN descripcion
           WHEN $3::text IS NULL THEN descripcion
           WHEN descripcion IS NULL OR descripcion ~* '^(cot\\.?\\s*)?1002\\d{7}$' OR descripcion ~* '^asignar y despachar' THEN $3
           ELSE descripcion
         END,
         lugar = CASE
           WHEN 'lugar' = ANY($21::text[]) THEN lugar
           WHEN lugar ~* 'alquiler|venta de|servicio de|instalaci' THEN $4
           WHEN lugar ~ '^[0-9]' THEN $4
           WHEN lugar IS NOT NULL AND lugar = $5 THEN $4
           WHEN lugar IS NULL THEN $4
           ELSE lugar
         END,
         cliente = CASE
           WHEN 'cliente' = ANY($21::text[]) THEN cliente
           WHEN cliente IS NULL THEN $5
           WHEN $5::text IS NOT NULL
             AND cliente !~* 's\\.?\\s*a|srl|eirl|b\\.?\\s*v|gobierno|sac|sa\\M'
             AND $5 ~* 's\\.?\\s*a|srl|eirl|b\\.?\\s*v|gobierno|sac|sa\\M'
             THEN $5
           ELSE cliente
         END,
         cantidad = COALESCE(cantidad, $6),
         temperatura = COALESCE(temperatura, $7),
         producto = CASE
           WHEN 'producto' = ANY($21::text[]) THEN producto
           WHEN $8::text IS NOT NULL AND producto ~* 'reefer|contenedor' AND $8 !~* 'reefer|contenedor' THEN $8
           ELSE COALESCE(producto, $8)
         END,
         contenedor = COALESCE(contenedor, $9),
         comercial_nombre = CASE
           WHEN 'comercial_nombre' = ANY($21::text[]) THEN comercial_nombre
           WHEN $10::text IS NOT NULL AND (
             comercial_nombre IS NULL
             OR comercial_nombre ~* 'excelente|https?://|que tenga|saludos|www\.'
           ) THEN $10
           ELSE COALESCE(comercial_nombre, $10)
         END,
         comercial_cargo = CASE
           WHEN 'comercial_cargo' = ANY($21::text[]) THEN comercial_cargo
           WHEN $11::text IS NOT NULL AND (
             comercial_cargo IS NULL
             OR comercial_cargo ~* 'https?://|www\.'
           ) THEN $11
           ELSE COALESCE(comercial_cargo, $11)
         END,
         comercial_correo = CASE WHEN 'comercial_correo' = ANY($21::text[]) THEN comercial_correo ELSE COALESCE(comercial_correo, $12) END,
         comercial_telefono = CASE
           WHEN 'comercial_telefono' = ANY($21::text[]) THEN comercial_telefono
           WHEN $13::text IS NOT NULL AND (
             comercial_telefono IS NULL
             OR comercial_telefono ~ '^1002[0-9]{7}$'
             OR comercial_telefono = cot
           ) THEN $13
           ELSE COALESCE(comercial_telefono, $13)
         END,
         cita_fecha = CASE WHEN 'cita_fecha' = ANY($21::text[]) THEN cita_fecha ELSE COALESCE(cita_fecha, $14) END,
         cita_hora = CASE
           WHEN 'cita_hora' = ANY($21::text[]) THEN cita_hora
           WHEN cita_fecha IS NULL AND $14::date IS NOT NULL AND $15::text IS NOT NULL THEN $15
           ELSE COALESCE(cita_hora, $15)
         END,
         cita_direccion = CASE WHEN 'cita_direccion' = ANY($21::text[]) THEN cita_direccion ELSE COALESCE(cita_direccion, $16) END,
         cita_mapa = COALESCE(cita_mapa, $17),
         cita_parcial_fecha = COALESCE(cita_parcial_fecha, $18),
         cita_parcial_hora = COALESCE(cita_parcial_hora, $19),
         referencias = $20::text[]
       WHERE cot = $1 AND estado = 'detectada'`,
      [
        lectura.cot.valor,
        lectura.ticket.valor,
        lectura.descripcion.valor,
        lectura.lugar.valor,
        lectura.cliente.valor,
        Number.isInteger(cantidad) ? cantidad : null,
        lectura.temperatura.valor,
        lectura.producto.valor,
        lectura.contenedor.valor,
        lectura.comercialNombre.valor,
        lectura.comercialCargo.valor,
        lectura.comercialCorreo.valor,
        lectura.comercialTelefono.valor,
        isoDe(lectura.fecha.fragmento, lectura.fecha.valor),
        lectura.hora.valor,
        lectura.direccion.valor,
        lectura.mapa.valor,
        isoDe(lectura.citaParcialFecha.fragmento, lectura.citaParcialFecha.valor),
        lectura.citaParcialHora.valor,
        referenciasUnidas,
        protegidos,
      ],
    );
    const campana = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = $1 AND campana`, [lectura.cot.valor]);
    if (campana.rows[0]) await this.incorporarTiendas(campana.rows[0].id, lectura.cot.valor ?? '');
  }

  private async retirarSinEncargo(): Promise<void> {
    await this.conexiones.pg.query(
      `DELETE FROM tarea t
       WHERE t.estado = 'detectada'
         AND t.cot <> '10000000000'
         AND t.padre_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM mensaje_correo m
           CROSS JOIN LATERAL unnest(CASE WHEN cardinality(t.cots) = 0 THEN ARRAY[t.cot] ELSE t.cots END) AS numero
           WHERE m.clasificacion = 'evento_desarrollo'
             AND (
               m.asunto ~ ('(^|[^0-9])' || numero || '([^0-9]|$)')
               OR m.texto ~ ('(^|[^0-9])' || numero || '([^0-9]|$)')
             )
         )`,
    );
  }

  private async terminosActivos(): Promise<string[]> {
    const resultado = await this.conexiones.pg.query<{ termino: string }>(
      `SELECT termino FROM termino_diccionario WHERE activo`,
    );
    return resultado.rows.map((fila) => fila.termino);
  }

  private async mensaje(id: string): Promise<FilaMensaje | null> {
    const resultado = await this.conexiones.pg.query<FilaMensaje>(
      `SELECT id, gmail_thread_id, asunto, de, texto, fecha FROM mensaje_correo WHERE id = $1`,
      [id],
    );
    return resultado.rows[0] ?? null;
  }

  async decidir(id: string, destino: 'otros' | 'interna' | 'archivado' | 'evento'): Promise<{ destino: 'otros' | 'interna' | 'archivado' | 'evento'; asunto: string }> {
    const ancla = await this.mensaje(id);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    if (estado.tarea) throw new BadRequestException('Esa cotización ya es una tarea.');
    if (destino === 'archivado') {
      if (estado.pendiente || estado.interna || estado.archivado) {
        throw new BadRequestException('Solo se archiva lo que está en Otros.');
      }
    } else if (destino === 'evento') {
      if (estado.tarea || estado.interna || estado.archivado || !estado.pendiente) {
        throw new BadRequestException('Solo se confirma lo que está pendiente de decisión.');
      }
      const cuerpos = await this.conexiones.pg.query<{ asunto: string }>(
        `SELECT asunto FROM mensaje_correo WHERE gmail_thread_id = $1`,
        [ancla.gmail_thread_id],
      );
      const numeros = cuerpos.rows.flatMap((fila) => cotsDe(fila.asunto));
      if (numeros.length === 0) throw new BadRequestException('Ese correo no trae cotización.');
    } else if (!estado.pendiente || estado.interna || estado.archivado) {
      throw new BadRequestException('Solo se mueve lo que está pendiente de decisión.');
    }
    await this.conexiones.pg.query(
      `INSERT INTO decision_hilo (gmail_thread_id, destino)
       VALUES ($1, $2)
       ON CONFLICT (gmail_thread_id) DO UPDATE
         SET destino = EXCLUDED.destino, actualizado_en = now()`,
      [ancla.gmail_thread_id, destino],
    );
    await this.conexiones.pg.query(`UPDATE mensaje_correo SET clasificacion = $2 WHERE gmail_thread_id = $1`, [
      ancla.gmail_thread_id,
      destino === 'evento' ? 'evento_desarrollo' : destino === 'interna' ? 'interna' : destino,
    ]);
    if (destino === 'interna') {
      await this.conexiones.pg.query(
        `INSERT INTO asunto_interno (gmail_thread_id, estado, respuesta)
         VALUES ($1, 'por_atender', '')
         ON CONFLICT (gmail_thread_id) DO NOTHING`,
        [ancla.gmail_thread_id],
      );
    }
    if (destino === 'evento') await this.procesarHilo(id);
    return { destino, asunto: ancla.asunto };
  }

  async guardarAtencion(id: string, estado: 'por_atender' | 'atendido', respuesta: string): Promise<{ atencion: 'por_atender' | 'atendido'; respuesta: string }> {
    const ancla = await this.mensaje(id);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const texto = respuesta.slice(0, 4000);
    await this.conexiones.pg.query(
      `INSERT INTO asunto_interno (gmail_thread_id, estado, respuesta)
       VALUES ($1, $2, $3)
       ON CONFLICT (gmail_thread_id) DO UPDATE
         SET estado = EXCLUDED.estado, respuesta = EXCLUDED.respuesta, actualizado_en = now()`,
      [ancla.gmail_thread_id, estado, texto],
    );
    return { atencion: estado, respuesta: texto };
  }

  private async destinoManual(hilo: string): Promise<'otros' | 'interna' | 'archivado' | 'evento' | 'resuelto' | null> {
    const resultado = await this.conexiones.pg.query<{ destino: string }>(
      `SELECT destino FROM decision_hilo WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const destino = resultado.rows[0]?.destino;
    if (destino === 'otros' || destino === 'interna' || destino === 'archivado' || destino === 'evento' || destino === 'resuelto') return destino;
    return null;
  }

  async corregir(id: string, campo: string, valor: string): Promise<void> {
    const columna = columnaDe(campo);
    const escrito = valorCampo(campo, valor);
    const resultado = await this.conexiones.pg.query(
      `UPDATE tarea
       SET ${columna} = $2,
           campos_corregidos = CASE
             WHEN $3 = ANY(campos_corregidos) THEN campos_corregidos
             ELSE array_append(campos_corregidos, $3)
           END
       WHERE id = $1`,
      [id, escrito, campo],
    );
    if (resultado.rowCount === 0) throw new NotFoundException('No está esa tarea.');
  }

  async releer(id: string, campo: string): Promise<void> {
    const columna = columnaDe(campo);
    const mensajes = await this.conexiones.pg.query<{ extraccion: Extraccion | null }>(
      `SELECT m.extraccion
       FROM situacion_hilo s
       JOIN mensaje_correo m ON m.id = s.mensaje_id
       WHERE s.tarea_id = $1
       ORDER BY m.fecha DESC NULLS LAST, m.creado_en DESC`,
      [id],
    );
    const hallado = mensajes.rows.map((fila) => valorExtraido(fila.extraccion, campo)).find((valor) => valor !== null && valor !== undefined);
    const resultado = await this.conexiones.pg.query(
      `UPDATE tarea SET ${columna} = $2, campos_corregidos = array_remove(campos_corregidos, $3) WHERE id = $1`,
      [id, hallado ?? null, campo],
    );
    if (resultado.rowCount === 0) throw new NotFoundException('No está esa tarea.');
  }

  async transferir(id: string, autor: Autor, correo: string): Promise<void> {
    await this.exigeVisible(autor.correo, 'tarea', id);
    const destino = await this.conexiones.pg.query<{ nombre: string; rol: string }>(
      `SELECT nombre, rol FROM usuario WHERE lower(correo) = lower($1) AND activo`,
      [correo.trim()],
    );
    const quien = destino.rows[0];
    if (!quien || (quien.rol !== 'tecnico' && quien.rol !== 'administrador' && quien.rol !== 'superusuario' && quien.rol !== 'operador')) {
      throw new BadRequestException('Esa cuenta no puede tomar la tarea.');
    }
    const actual = await this.filaTarea(id);
    await this.conexiones.pg.query(
      `UPDATE tarea SET responsable_correo = $2, responsable_nombre = $3 WHERE id = $1`,
      [id, correo.trim().toLowerCase(), quien.nombre],
    );
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre)
       VALUES ($1, $2, 'seguimiento', 'web', $3, $4, $5)`,
      [randomUUID(), id, `La tarea pasó de ${actual.responsable_nombre ?? 'nadie'} a ${quien.nombre}.`, autor.correo, autor.nombre],
    );
  }

  async archivarNota(tareaId: string, notaId: string, archivado: boolean): Promise<void> {
    const resultado = await this.conexiones.pg.query(
      `UPDATE nota_bitacora SET archivado = $3 WHERE id = $1 AND tarea_id = $2 AND tipo IN ('seguimiento', 'incidente')`,
      [notaId, tareaId, archivado],
    );
    if ((resultado.rowCount ?? 0) === 0) throw new NotFoundException('Esa nota no se puede archivar.');
  }

  async editarNota(tareaId: string, notaId: string, texto: string): Promise<void> {
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe el texto.');
    const resultado = await this.conexiones.pg.query(
      `UPDATE nota_bitacora SET texto = $3 WHERE id = $1 AND tarea_id = $2 AND tipo IN ('seguimiento', 'incidente') AND anula_id IS NULL`,
      [notaId, tareaId, limpio],
    );
    if ((resultado.rowCount ?? 0) === 0) throw new NotFoundException('Esa nota no se puede editar.');
  }

  async fijarHilos(id: string, cantidad: number, autor?: Autor): Promise<void> {
    try {
      await ajustarHilos(this.conexiones.pg, id, cantidad);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'No pude corregir los hilos.');
    }
    if (autor) {
      const tarea = await this.filaTarea(id);
      if (!tarea.responsable_correo) {
        await this.tomar(id, autor);
      }
    }
  }

  async corregirHilo(
    id: string,
    hiloId: string,
    datos: {
      contenedor?: string;
      maquina?: string;
      imei?: string;
      celular?: string;
      modem_serie?: string;
      modem_imei?: string;
      zona?: 'almacen' | 'tecnico' | 'despacho';
    },
    autor: { correo: string; nombre: string },
  ): Promise<void> {
    const hilos = await listarHilos(this.conexiones.pg, id);
    if (!hilos.some((hilo) => hilo.id === hiloId)) throw new NotFoundException('Ese hilo no está en la cotización.');
    const origen = datos.zona === 'almacen' ? 'almacén' : 'técnico';
    const imei = datos.imei?.replace(/\D/g, '') ?? '';
    const celular = datos.celular?.replace(/\D/g, '') ?? '';
    const modemSerie = datos.modem_serie?.trim() ?? '';
    const modemImei = datos.modem_imei?.replace(/\D/g, '') ?? '';
    let hecho = false;

    if (celular || imei) {
      const chip = await this.conexiones.pg.query<{ imei: string; celular: string; estado: string; telemetria: string }>(
        `SELECT imei, celular, estado, telemetria FROM chip
         WHERE NOT archivado AND (
           ($1 <> '' AND (imei = $1 OR imei LIKE '%' || $1))
           OR ($2 <> '' AND (celular = $2 OR celular LIKE '%' || $2))
         )
         ORDER BY CASE
           WHEN $1 <> '' AND imei = $1 THEN 0
           WHEN $2 <> '' AND celular = $2 THEN 1
           ELSE 2
         END`,
        [imei, celular],
      );
      const unico =
        chip.rows.length === 1
          ? chip.rows[0]
          : chip.rows.find((fila) => (imei && fila.imei === imei) || (celular && fila.celular === celular));
      if (!unico) {
        throw new BadRequestException(
          celular && !imei
            ? 'Ese número de chip no está en el catálogo.'
            : 'Ese IMEI o celular no está en los chips cargados.',
        );
      }
      await registrarChip(this.conexiones, hiloId, id, { ...unico, por: 'completo', pista: unico.imei }, autor, null, origen, 'web');
      hecho = true;
    }

    if (modemSerie || modemImei) {
      await registrarModem(this.conexiones, hiloId, id, { serie: modemSerie, imei: modemImei }, autor, null, origen, 'web');
      hecho = true;
    }

    if (datos.contenedor?.trim() || datos.maquina?.trim()) {
      await corregirEquipo(this.conexiones.pg, hiloId, { contenedor: datos.contenedor, maquina: datos.maquina });
      hecho = true;
    }

    if (!hecho) {
      throw new BadRequestException('Escribe el equipo, el chip, el módulo 4G o sube la foto.');
    }
  }

  async regularizarFoto(
    id: string,
    hiloId: string,
    autor: { correo: string; nombre: string },
    datos: { clase?: string; nombre?: string; mime?: string; contenido?: string; zona?: string },
  ): Promise<void> {
    const hilos = await listarHilos(this.conexiones.pg, id);
    if (!hilos.some((hilo) => hilo.id === hiloId)) throw new NotFoundException('Ese hilo no está en la cotización.');
    const clase =
      datos.clase === 'chip' || datos.clase === 'contenedor' || datos.clase === 'maquina' || datos.clase === 'modem'
        ? datos.clase
        : '';
    if (!clase) throw new BadRequestException('Indica si la foto es del chip, del módulo, del contenedor o de la máquina.');
    const contenido = Buffer.from(datos.contenido ?? '', 'base64');
    if (contenido.length === 0 || contenido.length > 4 * 1024 * 1024) throw new BadRequestException('La foto pasa de 4 MB.');
    const foto = { nombre: datos.nombre?.trim() || 'foto.jpg', mime: datos.mime || 'image/jpeg', contenido };
    const origen = datos.zona === 'almacen' ? 'almacén' : 'técnico';
    await recibirFotoRegularizacion(this.conexiones, id, hiloId, clase, autor, foto, 'web', origen);
  }

  async releerNota(id: string, notaId: string): Promise<string> {
    return releerFotoGuardada(this.conexiones, id, notaId);
  }

  async tecnicos(): Promise<Array<{ correo: string; nombre: string }>> {
    const filas = await this.conexiones.pg.query<{ correo: string; nombre: string }>(
      `SELECT correo, nombre FROM usuario WHERE activo AND rol IN ('tecnico', 'administrador', 'operador', 'superusuario') ORDER BY nombre`,
    );
    return filas.rows;
  }

  async tomar(id: string, autor: Autor): Promise<void> {
    await this.niegaDespacho(autor.correo);
    await this.exigeVisible(autor.correo, 'tarea', id);
    const tarea = await this.filaTarea(id);
    if (tarea.responsable_correo && tarea.responsable_correo !== autor.correo) {
      throw new BadRequestException(`La tarea ya la tomó ${tarea.responsable_nombre}.`);
    }
    await this.conexiones.pg.query(
      `UPDATE tarea SET responsable_correo = $2, responsable_nombre = $3 WHERE id = $1`,
      [id, autor.correo, autor.nombre],
    );
  }

  async anotar(
    id: string,
    autor: Autor,
    tipo: string,
    texto: string,
    archivo: ArchivoNota | null,
    canal: 'web' | 'whatsapp' = 'web',
    extras: ArchivoNota[] = [],
    tiendaId: string | null = null,
  ): Promise<void> {
    await this.niegaDespacho(autor.correo);
    if (tipo !== 'seguimiento' && tipo !== 'incidente') throw new BadRequestException('La nota es un seguimiento o un incidente.');
    await this.exigeVisible(autor.correo, 'tarea', id);
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe la nota.');
    await this.filaTarea(id);
    if (tiendaId) {
      const tienda = await this.conexiones.pg.query(`SELECT 1 FROM tienda WHERE id = $1 AND tarea_id = $2`, [tiendaId, id]);
      if ((tienda.rowCount ?? 0) === 0) throw new NotFoundException('No está esa tienda.');
      await vincularHijas(this.conexiones.pg, id);
    }
    const imagen = await this.prepararImagen(archivo);
    const notaId = randomUUID();
    const almacen = new AlmacenCorreo(this.conexiones);
    if (imagen) await almacen.guardar(imagen.clave(notaId), imagen.contenido, imagen.mime);
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (
         id, tarea_id, tienda_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [notaId, id, tiendaId, tipo, canal, limpio, autor.correo, autor.nombre, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
    );
    if (tiendaId) {
      await this.conexiones.pg.query(
        `UPDATE tienda SET estado = 'en_seguimiento' WHERE id = $1 AND estado = 'pendiente'`,
        [tiendaId],
      );
      await this.conexiones.pg.query(
        `UPDATE tarea SET estado = CASE WHEN estado IN ('resuelta', 'en_validacion') THEN estado ELSE 'en_seguimiento' END
         WHERE id = (SELECT tarea_hija_id FROM tienda WHERE id = $1) AND estado <> 'resuelta'`,
        [tiendaId],
      );
    }
    await this.guardarFotos(notaId, imagen, extras, almacen);
    if (tipo === 'seguimiento') {
      await this.conexiones.pg.query(
        `UPDATE tarea SET estado = CASE WHEN estado = 'en_validacion' THEN estado ELSE 'en_seguimiento' END WHERE id = $1 AND estado <> 'resuelta'`,
        [id],
      );
    }
  }

  async cerrarTarea(id: string, autor: Autor, texto: string, archivo: ArchivoNota | null, canal: 'web' | 'whatsapp' = 'web'): Promise<void> {
    await this.niegaDespacho(autor.correo);
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe por qué se cierra.');
    await this.exigeVisible(autor.correo, 'tarea', id);
    const tarea = await this.conexiones.pg.query<{ estado: string }>(`SELECT estado FROM tarea WHERE id = $1`, [id]);
    if (!tarea.rows[0]) throw new NotFoundException('No está esa tarea.');
    if (tarea.rows[0].estado === 'resuelta') throw new BadRequestException('Esta tarea ya está resuelta.');
    const abiertas = await this.conexiones.pg.query(
      `SELECT 1 FROM tienda WHERE tarea_id = $1 AND estado <> 'resuelta' AND EXISTS (SELECT 1 FROM tarea WHERE id = $1 AND campana)`,
      [id],
    );
    if ((abiertas.rowCount ?? 0) > 0) throw new BadRequestException('La campaña sigue abierta: quedan tiendas por realizar.');
    await this.insertarNota(id, null, 'cierre', canal, limpio, autor, archivo);
    await this.conexiones.pg.query(
      `UPDATE recordatorio SET estado = 'cancelado' WHERE tarea_id = $1 AND estado = 'pendiente'`,
      [id],
    );
    await this.conexiones.pg.query(`UPDATE tarea SET estado = 'resuelta', recordar_en = NULL WHERE id = $1`, [id]);
    await this.conexiones.pg.query(`UPDATE tienda SET estado = 'resuelta' WHERE tarea_hija_id = $1 AND estado <> 'resuelta'`, [id]);
  }

  async anotarEnHilo(
    mensajeId: string,
    autor: Autor,
    tipo: string,
    texto: string,
    archivo: ArchivoNota | null,
    canal: 'web' | 'whatsapp' = 'web',
    extras: ArchivoNota[] = [],
  ): Promise<void> {
    if (tipo !== 'seguimiento' && tipo !== 'incidente') throw new BadRequestException('La nota es un seguimiento o un incidente.');
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe la nota.');
    const hilo = await this.hiloAbierto(mensajeId, 'interna');
    await this.exigeVisible(autor.correo, 'interno', hilo);
    const tareaId = await this.tareaInterna();
    if (!tareaId) throw new BadRequestException('El asunto interno todavía no tiene ficha.');
    await this.insertarNota(tareaId, hilo, tipo, canal, limpio, autor, archivo, extras);
  }

  async cerrarHilo(mensajeId: string, autor: Autor, texto: string, archivo: ArchivoNota | null, canal: 'web' | 'whatsapp' = 'web'): Promise<void> {
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe por qué se cierra.');
    const ancla = await this.mensaje(mensajeId);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    if (estado.resuelto) throw new BadRequestException('Eso ya está resuelto.');
    if (estado.interna && !estado.tarea && !estado.archivado) await this.exigeVisible(autor.correo, 'interno', ancla.gmail_thread_id);
    else if (estado.pendiente && !estado.tarea && !estado.interna && !estado.archivado) await this.exigeVisible(autor.correo, 'decision', ancla.gmail_thread_id);
    const imagen = await this.prepararImagen(archivo);
    const notaId = randomUUID();
    if (imagen) await new AlmacenCorreo(this.conexiones).guardar(imagen.clave(notaId), imagen.contenido, imagen.mime);
    if (estado.interna && !estado.tarea && !estado.archivado) {
      await this.conexiones.pg.query(
        `INSERT INTO asunto_interno (gmail_thread_id, estado, respuesta, archivo_clave, archivo_nombre, archivo_mime)
         VALUES ($1, 'resuelto', $2, $3, $4, $5)
         ON CONFLICT (gmail_thread_id) DO UPDATE
           SET estado = 'resuelto', respuesta = EXCLUDED.respuesta,
               archivo_clave = EXCLUDED.archivo_clave, archivo_nombre = EXCLUDED.archivo_nombre,
               archivo_mime = EXCLUDED.archivo_mime, actualizado_en = now()`,
        [ancla.gmail_thread_id, limpio, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
      );
      const tareaId = await this.tareaInterna();
      if (tareaId) {
        await this.conexiones.pg.query(
          `INSERT INTO nota_bitacora (
             id, tarea_id, gmail_thread_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime
           ) VALUES ($1,$2,$3,'cierre',$4,$5,$6,$7,$8,$9,$10)`,
          [notaId, tareaId, ancla.gmail_thread_id, canal, limpio, autor.correo, autor.nombre, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
        );
      }
      return;
    }
    if (estado.pendiente && !estado.tarea && !estado.interna && !estado.archivado) {
      await this.conexiones.pg.query(
        `INSERT INTO decision_hilo (gmail_thread_id, destino, motivo, archivo_clave, archivo_nombre, archivo_mime)
         VALUES ($1, 'resuelto', $2, $3, $4, $5)
         ON CONFLICT (gmail_thread_id) DO UPDATE
           SET destino = 'resuelto', motivo = EXCLUDED.motivo,
               archivo_clave = EXCLUDED.archivo_clave, archivo_nombre = EXCLUDED.archivo_nombre,
               archivo_mime = EXCLUDED.archivo_mime, actualizado_en = now()`,
        [ancla.gmail_thread_id, limpio, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
      );
      await this.conexiones.pg.query(`UPDATE mensaje_correo SET clasificacion = 'resuelto' WHERE gmail_thread_id = $1`, [ancla.gmail_thread_id]);
      return;
    }
    throw new BadRequestException('Solo se cierra una tarea, un asunto interno o una decisión pendiente.');
  }

  async leerCierre(mensajeId: string): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
    const ancla = await this.mensaje(mensajeId);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const archivo = await this.conexiones.pg.query<{ archivo_clave: string | null; archivo_nombre: string | null; archivo_mime: string | null }>(
      `SELECT archivo_clave, archivo_nombre, archivo_mime FROM asunto_interno WHERE gmail_thread_id = $1
       UNION ALL
       SELECT archivo_clave, archivo_nombre, archivo_mime FROM decision_hilo WHERE gmail_thread_id = $1
       LIMIT 1`,
      [ancla.gmail_thread_id],
    );
    const fila = archivo.rows.find((candidato) => candidato.archivo_clave);
    if (!fila?.archivo_clave) throw new NotFoundException('Ese cierre no tiene archivo.');
    const bytes = await new AlmacenCorreo(this.conexiones).leer(fila.archivo_clave);
    return { nombre: fila.archivo_nombre ?? 'foto', mime: fila.archivo_mime ?? 'application/octet-stream', bytes };
  }

  async validar(id: string, horas: number, ahora = new Date(), autorCorreo: string | null = null): Promise<Date> {
    if (!Number.isInteger(horas) || horas < 1 || horas > 48) throw new BadRequestException('Las horas van de 1 a 48.');
    await this.filaTarea(id);
    const recordar = new Date(ahora.getTime() + horas * 60 * 60 * 1000);
    await this.conexiones.pg.query(
      `UPDATE recordatorio SET estado = 'cancelado' WHERE tarea_id = $1 AND tipo = 'snooze' AND estado = 'pendiente'`,
      [id],
    );
    await this.conexiones.pg.query(
      `INSERT INTO recordatorio (id, tarea_id, tipo, recordar_en, estado, hora_bucket, autor_correo)
       VALUES ($1,$2,'snooze',$3,'pendiente',$4,$5)`,
      [randomUUID(), id, recordar.toISOString(), recordar.toISOString(), autorCorreo],
    );
    await this.conexiones.pg.query(`UPDATE tarea SET estado = 'en_validacion', recordar_en = $2 WHERE id = $1`, [id, recordar.toISOString()]);
    return recordar;
  }

  async confirmarBorrador(id: string, autor: Autor): Promise<void> {
    await this.niegaDespacho(autor.correo);
    await this.exigeVisible(autor.correo, 'tarea', id);
    const pendiente = await this.borradorDe(id);
    if (!pendiente) throw new NotFoundException('No hay un borrador pendiente.');
    await this.conexiones.pg.query(
      `UPDATE tarea SET codigo_equipo = $2, maquina_equipo = $3 WHERE id = $1`,
      [id, pendiente.codigo, pendiente.maquina],
    );
    await this.conexiones.pg.query(`UPDATE borrador_equipo SET estado = 'confirmado' WHERE tarea_id = $1 AND estado = 'pendiente'`, [id]);
  }

  async descartarBorrador(id: string, autor: Autor): Promise<void> {
    await this.niegaDespacho(autor.correo);
    await this.exigeVisible(autor.correo, 'tarea', id);
    const resultado = await this.conexiones.pg.query(
      `UPDATE borrador_equipo SET estado = 'descartado' WHERE tarea_id = $1 AND estado = 'pendiente'`,
      [id],
    );
    if ((resultado.rowCount ?? 0) === 0) throw new NotFoundException('No hay un borrador pendiente.');
  }

  async anular(id: string, notaId: string, autor: Autor, texto: string): Promise<void> {
    await this.exigeVisible(autor.correo, 'tarea', id);
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe por qué se anula.');
    const nota = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM nota_bitacora WHERE id = $1 AND tarea_id = $2 AND tipo <> 'anulacion'`,
      [notaId, id],
    );
    if (!nota.rows[0]) throw new NotFoundException('No está esa nota.');
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre, anula_id)
       VALUES ($1,$2,'anulacion','web',$3,$4,$5,$6)`,
      [randomUUID(), id, limpio, autor.correo, autor.nombre, notaId],
    );
  }

  async barrido(ahora = new Date()): Promise<{ corre: boolean; horarias: string[]; vencidos: string[] }> {
    const feriados = await this.feriados();
    const corre = barridoCorre(ahora, feriados);
    const vencidos = await this.conexiones.pg.query<{ tarea_id: string }>(
      `UPDATE recordatorio SET estado = 'enviado'
       WHERE tipo = 'snooze' AND estado = 'pendiente' AND recordar_en <= $1
       RETURNING tarea_id`,
      [ahora.toISOString()],
    );
    return { corre, horarias: [], vencidos: vencidos.rows.map((fila) => fila.tarea_id) };
  }

  async leerArchivo(tareaId: string, notaId: string): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
    const nota = await this.conexiones.pg.query<{ archivo_clave: string | null; archivo_nombre: string | null; archivo_mime: string | null }>(
      `SELECT archivo_clave, archivo_nombre, archivo_mime FROM nota_bitacora WHERE id = $1 AND tarea_id = $2`,
      [notaId, tareaId],
    );
    const fila = nota.rows[0];
    if (!fila?.archivo_clave) throw new NotFoundException('Esa nota no tiene archivo.');
    const bytes = await new AlmacenCorreo(this.conexiones).leer(fila.archivo_clave);
    return { nombre: fila.archivo_nombre ?? 'foto', mime: fila.archivo_mime ?? 'application/octet-stream', bytes };
  }

  async leerArchivoNota(tareaId: string, notaId: string, archivoId: string): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
    const nota = await this.conexiones.pg.query<{ clave: string; nombre: string; mime: string }>(
      `SELECT f.clave, f.nombre, f.mime
       FROM nota_archivo f
       JOIN nota_bitacora n ON n.id = f.nota_id
       WHERE f.id = $1 AND n.id = $2 AND n.tarea_id = $3`,
      [archivoId, notaId, tareaId],
    );
    const fila = nota.rows[0];
    if (!fila) throw new NotFoundException('Esa nota no tiene esa imagen.');
    const bytes = await new AlmacenCorreo(this.conexiones).leer(fila.clave);
    return { nombre: fila.nombre, mime: fila.mime, bytes };
  }

  private async capaBitacora(tarea: FilaTarea): Promise<{ notas: NotaBitacora[]; en_barrido: boolean }> {
    const notas = await this.notasDe(tarea.id);
    const feriados = await this.feriados();
    const recordar = tarea.recordar_en instanceof Date ? tarea.recordar_en : tarea.recordar_en ? new Date(String(tarea.recordar_en)) : null;
    return {
      notas,
      en_barrido: entraHoraria(
        {
          estado: String(tarea.estado ?? ''),
          seguimiento: notas.some((nota) => nota.tipo === 'seguimiento'),
          recordarEn: recordar && !Number.isNaN(recordar.getTime()) ? recordar : null,
        },
        new Date(),
        feriados,
      ),
    };
  }

  private async notasDe(tareaId: string): Promise<NotaBitacora[]> {
    const resultado = await this.conexiones.pg.query<NotaBitacora>(
      `SELECT n.id, n.tipo, n.canal, n.texto, n.autor_nombre, n.autor_correo, n.archivo_nombre, n.archivo_mime, n.anula_id, n.archivado, n.creado_en,
              COALESCE(
                (SELECT json_agg(json_build_object('id', f.id, 'nombre', f.nombre) ORDER BY f.orden)
                 FROM nota_archivo f WHERE f.nota_id = n.id),
                '[]'::json
              ) AS imagenes
       FROM nota_bitacora n WHERE n.tarea_id = $1 AND n.tienda_id IS NULL ORDER BY n.creado_en`,
      [tareaId],
    );
    return resultado.rows;
  }

  private async feriados(): Promise<Set<string>> {
    const resultado = await this.conexiones.pg.query<{ fecha: string }>(`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM feriado`);
    return new Set(resultado.rows.map((fila) => fila.fecha));
  }

  private async filaTarea(id: string): Promise<{ responsable_correo: string | null; responsable_nombre: string | null }> {
    const resultado = await this.conexiones.pg.query<{ responsable_correo: string | null; responsable_nombre: string | null }>(
      `SELECT responsable_correo, responsable_nombre FROM tarea WHERE id = $1`,
      [id],
    );
    const fila = resultado.rows[0];
    if (!fila) throw new NotFoundException('No está esa tarea.');
    return fila;
  }

  private async guardarFotos(
    notaId: string,
    imagen: { nombre: string; mime: string; contenido: Buffer; clave: (id: string) => string } | null,
    extras: ArchivoNota[],
    almacen: AlmacenCorreo,
  ): Promise<void> {
    const fotos = [];
    if (imagen) fotos.push(imagen);
    for (const extra of extras) {
      const lista = await this.prepararImagen(extra);
      if (lista) fotos.push(lista);
    }
    for (const [orden, foto] of fotos.entries()) {
      const archivoId = randomUUID();
      const clave = orden === 0 && imagen ? imagen.clave(notaId) : `nota/${notaId}/${archivoId}`;
      if (!(orden === 0 && imagen)) await almacen.guardar(clave, foto.contenido, foto.mime);
      await this.conexiones.pg.query(
        `INSERT INTO nota_archivo (id, nota_id, clave, mime, nombre, orden) VALUES ($1,$2,$3,$4,$5,$6)`,
        [archivoId, notaId, clave, foto.mime, foto.nombre, orden],
      );
    }
  }

  private async prepararImagen(archivo: ArchivoNota | null): Promise<{ nombre: string; mime: string; contenido: Buffer; clave: (id: string) => string } | null> {
    if (!archivo) return null;
    const mime = archivo.mime.toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
      throw new BadRequestException('La foto tiene que ser una imagen.');
    }
    if (archivo.contenido.length === 0 || archivo.contenido.length > 4 * 1024 * 1024) {
      throw new BadRequestException('La foto pasa de 4 MB.');
    }
    const nombre = archivo.nombre.trim().slice(0, 180) || 'foto';
    return { nombre, mime, contenido: archivo.contenido, clave: (id) => `bitacora/${id}` };
  }

  private async anexarPorHilo(mensaje: FilaMensaje, lectura: Extraccion): Promise<string | null> {
    const encontrada = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM (
         SELECT t.id, t.creado_en
         FROM tarea t
         JOIN mensaje_correo ancla ON ancla.id = t.mensaje_id
         WHERE ancla.gmail_thread_id = $1
         UNION
         SELECT t.id, t.creado_en
         FROM situacion_hilo s
         JOIN tarea t ON t.id = s.tarea_id
         JOIN mensaje_correo m ON m.id = s.mensaje_id
         WHERE m.gmail_thread_id = $1
       ) tareas
       ORDER BY creado_en DESC
       LIMIT 1`,
      [mensaje.gmail_thread_id],
    );
    const tareaId = encontrada.rows[0]?.id;
    if (!tareaId) return null;
    await this.anotarSituacion(tareaId, mensaje, lectura);
    return tareaId;
  }

  private async anotarSituacion(tareaId: string, mensaje: FilaMensaje, lectura: Extraccion): Promise<void> {
    const ya = await this.conexiones.pg.query(`SELECT 1 FROM situacion_hilo WHERE mensaje_id = $1`, [mensaje.id]);
    if ((ya.rowCount ?? 0) > 0) return;
    const tarea = await this.conexiones.pg.query<{
      cita_fecha: Date | string | null;
      cita_hora: string | null;
      cita_direccion: string | null;
      campos_corregidos: string[] | null;
      previas: string;
      estado: string;
    }>(
      `SELECT cita_fecha, cita_hora, cita_direccion, campos_corregidos, estado,
              (SELECT count(*)::text FROM situacion_hilo WHERE tarea_id = tarea.id) AS previas
       FROM tarea WHERE id = $1`,
      [tareaId],
    );
    const fila = tarea.rows[0];
    if (!fila) return;
    const protegidos = new Set(fila.campos_corregidos ?? []);
    const vigente: Cita = {
      fecha: fechaIso(fila.cita_fecha),
      hora: fila.cita_hora,
      direccion: fila.cita_direccion,
    };
    const propuesta: Cita = {
      fecha: protegidos.has('cita_fecha') ? null : isoDe(lectura.fecha.fragmento, lectura.fecha.valor),
      hora: protegidos.has('cita_hora') ? null : lectura.hora.valor,
      direccion: protegidos.has('cita_direccion') ? null : lectura.direccion.valor,
    };
    const efecto = evaluarCita(vigente, propuesta);
    const cerrada = fila.estado === 'resuelta';
    const tipo = cerrada ? 'informativa' : Number(fila.previas) === 0 ? 'origen' : efecto.reprograma ? 'reprogramacion' : 'informativa';
    const alta = await this.conexiones.pg.query(
      `INSERT INTO situacion_hilo (id, tarea_id, mensaje_id, tipo, resumen, cita_anterior)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (mensaje_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        tareaId,
        mensaje.id,
        tipo,
        (mensaje.asunto || '(sin asunto)').slice(0, 240),
        efecto.anterior ? JSON.stringify(efecto.anterior) : null,
      ],
    );
    if (cerrada || (!efecto.fecha && !efecto.hora && !efecto.direccion)) return;
    await this.conexiones.pg.query(
      `UPDATE tarea SET
         cita_fecha = COALESCE($2::date, cita_fecha),
         cita_hora = COALESCE($3, cita_hora),
         cita_direccion = COALESCE($4, cita_direccion)
       WHERE id = $1`,
      [tareaId, efecto.fecha, efecto.hora, efecto.direccion],
    );
    if ((alta.rowCount ?? 0) > 0 && tipo === 'reprogramacion') {
      await new BotService(this.conexiones).alReprogramar(tareaId, mensaje.id);
    }
  }

  private async situacionesDe(tareaId: string): Promise<SituacionHilo[]> {
    const resultado = await this.conexiones.pg.query<SituacionHilo>(
      `SELECT s.tipo, s.resumen, s.cita_anterior, m.de, m.fecha, m.asunto
       FROM situacion_hilo s
       JOIN mensaje_correo m ON m.id = s.mensaje_id
       WHERE s.tarea_id = $1
       ORDER BY m.fecha ASC NULLS LAST, s.creado_en ASC`,
      [tareaId],
    );
    return resultado.rows;
  }

  private async estadoHilo(hilo: string): Promise<{ tarea: boolean; pendiente: boolean; interna: boolean; archivado: boolean; resuelto: boolean }> {
    const resultado = await this.conexiones.pg.query<{
      tarea: boolean | null;
      pendiente: boolean | null;
      interna: boolean | null;
      archivado: boolean | null;
      resuelto: boolean | null;
    }>(
      `SELECT bool_or(clasificacion = 'evento_desarrollo') AS tarea,
              bool_or(clasificacion = 'pendiente') AS pendiente,
              bool_or(clasificacion = 'interna') AS interna,
              bool_or(clasificacion = 'archivado') AS archivado,
              bool_or(clasificacion = 'resuelto') AS resuelto
       FROM mensaje_correo
       WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const fila = resultado.rows[0];
    return {
      tarea: Boolean(fila?.tarea),
      pendiente: Boolean(fila?.pendiente),
      interna: Boolean(fila?.interna),
      archivado: Boolean(fila?.archivado),
      resuelto: Boolean(fila?.resuelto),
    };
  }

  private async tareaInterna(): Promise<string | null> {
    const existente = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = '10000000000'`);
    if (existente.rows[0]) return existente.rows[0].id;
    const creada = await this.conexiones.pg.query<{ id: string }>(
      `INSERT INTO tarea (id, cot, estado, cliente, descripcion)
       VALUES ($1, '10000000000', 'detectada', 'ZGROUP', 'Asuntos internos')
       ON CONFLICT (cot) DO NOTHING
       RETURNING id`,
      [randomUUID()],
    );
    if (creada.rows[0]) return creada.rows[0].id;
    const otra = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = '10000000000'`);
    return otra.rows[0]?.id ?? null;
  }

  private async hiloAbierto(mensajeId: string, clase: 'interna'): Promise<string> {
    const ancla = await this.mensaje(mensajeId);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    if (estado.resuelto || !estado[clase] || estado.tarea || estado.archivado) {
      throw new BadRequestException('Ese asunto interno ya no está abierto.');
    }
    const atencion = await this.leerAtencion(ancla.gmail_thread_id);
    if (atencion.atencion === 'resuelto') throw new BadRequestException('Ese asunto interno ya está resuelto.');
    return ancla.gmail_thread_id;
  }

  private async insertarNota(
    tareaId: string,
    hilo: string | null,
    tipo: 'seguimiento' | 'incidente' | 'cierre',
    canal: 'web' | 'whatsapp',
    texto: string,
    autor: Autor,
    archivo: ArchivoNota | null,
    extras: ArchivoNota[] = [],
  ): Promise<void> {
    const imagen = await this.prepararImagen(archivo);
    const notaId = randomUUID();
    const almacen = new AlmacenCorreo(this.conexiones);
    if (imagen) await almacen.guardar(imagen.clave(notaId), imagen.contenido, imagen.mime);
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (
         id, tarea_id, gmail_thread_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [notaId, tareaId, hilo, tipo, canal, texto, autor.correo, autor.nombre, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
    );
    await this.guardarFotos(notaId, imagen, extras, almacen);
  }

  private async leerAtencion(hilo: string): Promise<{ atencion: 'por_atender' | 'atendido' | 'resuelto'; respuesta: string; cierreArchivo: boolean }> {
    const resultado = await this.conexiones.pg.query<{ estado: string; respuesta: string; archivo_clave: string | null }>(
      `SELECT estado, respuesta, archivo_clave FROM asunto_interno WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const fila = resultado.rows[0];
    const atencion = fila?.estado === 'atendido' ? 'atendido' : fila?.estado === 'resuelto' ? 'resuelto' : 'por_atender';
    return { atencion, respuesta: fila?.respuesta ?? '', cierreArchivo: Boolean(fila?.archivo_clave) };
  }

  private async conResumen(filas: FilaSector[]): Promise<FilaSector[]> {
    if (filas.length === 0) return [];
    const hilos = filas.map((fila) => fila.gmail_thread_id);
    const mensajes = await this.conexiones.pg.query<{ gmail_thread_id: string; de: string; fecha: Date | null; asunto: string; texto: string }>(
      `SELECT gmail_thread_id, de, fecha, asunto, texto
       FROM mensaje_correo
       WHERE gmail_thread_id = ANY($1::text[])
       ORDER BY fecha ASC NULLS LAST, creado_en ASC`,
      [hilos],
    );
    const terminos = await this.terminosActivos();
    const porHilo = new Map<string, Array<{ de: string; fecha: Date | null; asunto: string; texto: string }>>();
    for (const mensaje of mensajes.rows) {
      const lista = porHilo.get(mensaje.gmail_thread_id) ?? [];
      if (lista.length < 40) lista.push(mensaje);
      porHilo.set(mensaje.gmail_thread_id, lista);
    }
    return filas.map((fila) => {
      const resumen = resumenHilo(porHilo.get(fila.gmail_thread_id) ?? [], terminos);
      return { ...fila, areas: resumen.seguimiento.areas.map((area) => area.area), resumen: resumen.resumen };
    });
  }

  async fijarVisible(clase: 'tarea' | 'interno' | 'decision', id: string, visible: boolean): Promise<boolean> {
    const clave = clase === 'tarea' ? id : await this.claveDeHilo(id, clase);
    if (visible) {
      await this.conexiones.pg.query(
        `INSERT INTO habilitado (clase, clave) VALUES ($1, $2) ON CONFLICT (clase, clave) DO NOTHING`,
        [clase, clave],
      );
      if (clase === 'tarea') {
        await this.conexiones.pg.query(
          `INSERT INTO habilitado (clase, clave)
           SELECT 'tarea', h.id::text FROM tarea h WHERE h.padre_id = $1::uuid
           ON CONFLICT (clase, clave) DO NOTHING`,
          [id],
        );
      }
    } else {
      await this.conexiones.pg.query(`DELETE FROM habilitado WHERE clase = $1 AND clave = $2`, [clase, clave]);
      if (clase === 'tarea') {
        await this.conexiones.pg.query(
          `DELETE FROM habilitado WHERE clase = 'tarea' AND clave IN (SELECT id::text FROM tarea WHERE padre_id = $1::uuid)`,
          [id],
        );
      }
    }
    return visible;
  }

  async exigeVisible(correo: string, clase: 'tarea' | 'interno' | 'decision', clave: string): Promise<void> {
    if (await this.esSuper(correo)) return;
    if (!(await this.estaHabilitada(clase, clave))) throw new NotFoundException('El superusuario todavía no habilitó esto.');
  }

  async exigeHilo(correo: string, mensajeId: string): Promise<void> {
    if (await this.esSuper(correo)) return;
    const ancla = await this.mensaje(mensajeId);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    const clase = estado.interna && !estado.tarea && !estado.archivado
      ? 'interno'
      : estado.pendiente && !estado.tarea && !estado.interna && !estado.archivado
        ? 'decision'
        : null;
    if (!clase) return;
    if (!(await this.estaHabilitada(clase, ancla.gmail_thread_id))) throw new NotFoundException('El superusuario todavía no habilitó esto.');
  }

  async estaHabilitada(clase: 'tarea' | 'interno' | 'decision', clave: string): Promise<boolean> {
    const fila = await this.conexiones.pg.query(`SELECT 1 FROM habilitado WHERE clase = $1 AND clave = $2`, [clase, clave]);
    return Boolean(fila.rows[0]);
  }

  private async esSuper(correo: string): Promise<boolean> {
    const fila = await this.conexiones.pg.query<{ rol: string }>(`SELECT rol FROM usuario WHERE correo = $1`, [correo]);
    return fila.rows[0]?.rol === 'superusuario';
  }

  private async niegaDespacho(correo: string): Promise<void> {
    const fila = await this.conexiones.pg.query<{ rol: string }>(`SELECT rol FROM usuario WHERE correo = $1`, [correo]);
    if (fila.rows[0]?.rol === 'despacho') throw new ForbiddenException('Despacho solo consulta las tareas habilitadas.');
  }

  private async borradorDe(tareaId: string): Promise<{ codigo: string; maquina: string; autor_nombre: string } | null> {
    const fila = await this.conexiones.pg.query<{ codigo: string; maquina: string; autor_nombre: string }>(
      `SELECT codigo, maquina, autor_nombre FROM borrador_equipo WHERE tarea_id = $1 AND estado = 'pendiente'`,
      [tareaId],
    );
    return fila.rows[0] ?? null;
  }

  private async movimientosDespacho(tareaId: string): Promise<Array<{ id: string; tipo: string; actor: string; detalle: string; creado_en: Date }>> {
    const filas = await this.conexiones.pg.query<{ id: string; tipo: string; actor: string; detalle: string; creado_en: Date }>(
      `SELECT id, tipo, actor, detalle, creado_en FROM movimiento_despacho WHERE tarea_id = $1 ORDER BY creado_en`,
      [tareaId],
    );
    return filas.rows;
  }

  private async asignacionConfirmada(tareaId: string): Promise<{
    autor_nombre: string;
    texto: string;
    confirmada_en: Date | null;
    validacion: string | null;
    imagenes: Array<{ id: string; nombre: string }>;
    consulta: string | null;
  } | null> {
    const fila = await this.conexiones.pg.query<{ id: string; autor_nombre: string; texto: string; confirmada_en: Date | null; validacion: string | null }>(
      `SELECT id, autor_nombre, texto, confirmada_en, validacion
       FROM asignacion_despacho
       WHERE tarea_id = $1 AND estado = 'confirmada'
       ORDER BY confirmada_en DESC NULLS LAST, creado_en DESC
       LIMIT 1`,
      [tareaId],
    );
    const asignacion = fila.rows[0];
    if (!asignacion) return null;
    const imagenes = await this.conexiones.pg.query<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM asignacion_archivo WHERE asignacion_id = $1 ORDER BY creado_en`,
      [asignacion.id],
    );
    const consulta = await this.conexiones.pg.query<{ pregunta: string | null }>(
      `SELECT pregunta FROM turno_despacho WHERE tarea_id = $1 AND estado = 'reconsulta' ORDER BY abierto_en DESC LIMIT 1`,
      [tareaId],
    );
    return {
      autor_nombre: asignacion.autor_nombre,
      texto: asignacion.texto,
      confirmada_en: asignacion.confirmada_en,
      validacion: asignacion.validacion,
      imagenes: imagenes.rows,
      consulta: consulta.rows[0]?.pregunta ?? null,
    };
  }

  async leerAsignacion(tareaId: string, archivoId: string): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
    const fila = await this.conexiones.pg.query<{ clave: string; mime: string; nombre: string }>(
      `SELECT f.clave, f.mime, f.nombre
       FROM asignacion_archivo f
       JOIN asignacion_despacho a ON a.id = f.asignacion_id
       WHERE f.id = $1 AND a.tarea_id = $2 AND a.estado = 'confirmada'`,
      [archivoId, tareaId],
    );
    const archivo = fila.rows[0];
    if (!archivo) throw new NotFoundException('Esa imagen no está en la asignación.');
    const bytes = await new AlmacenCorreo(this.conexiones).leer(archivo.clave);
    return { nombre: archivo.nombre, mime: archivo.mime, bytes };
  }

  private async claveDeHilo(mensajeId: string, clase: 'interno' | 'decision'): Promise<string> {
    const ancla = await this.mensaje(mensajeId);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    const interno = estado.interna && !estado.tarea && !estado.archivado;
    const decision = estado.pendiente && !estado.tarea && !estado.interna && !estado.archivado;
    if (clase === 'interno' && !interno) throw new BadRequestException('Eso no es un asunto interno.');
    if (clase === 'decision' && !decision) throw new BadRequestException('Eso no es una decisión pendiente.');
    return ancla.gmail_thread_id;
  }

  private async cuentas(verOcultas = true): Promise<Cuentas> {
    const resultado = await this.conexiones.pg.query<{ tareas: string; pendientes: string; otros: string; internos: string }>(
      `WITH hilos AS (
         SELECT gmail_thread_id,
                bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'pendiente') AS pendiente,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'archivado') AS archivado,
                bool_or(clasificacion = 'resuelto') AS resuelto
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT (SELECT count(*) FROM tarea
                 WHERE cot <> '10000000000' AND estado <> 'resuelta'
                   AND ($1::boolean OR EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text))
              )::text AS tareas,
              count(*) FILTER (WHERE pendiente AND NOT tarea AND NOT interna AND NOT archivado AND NOT resuelto
                AND ($1::boolean OR EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'decision' AND pub.clave = hilos.gmail_thread_id))
              )::text AS pendientes,
              count(*) FILTER (WHERE NOT tarea AND NOT pendiente AND NOT interna AND NOT archivado AND NOT resuelto)::text AS otros,
              count(*) FILTER (
                WHERE interna AND NOT tarea AND NOT archivado AND NOT resuelto
                  AND coalesce((SELECT a.estado FROM asunto_interno a WHERE a.gmail_thread_id = hilos.gmail_thread_id), 'por_atender') <> 'resuelto'
                  AND ($1::boolean OR EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'interno' AND pub.clave = hilos.gmail_thread_id))
              )::text AS internos
       FROM hilos`,
      [verOcultas],
    );
    const fila = resultado.rows[0];
    return {
      tareas: Number(fila?.tareas ?? 0),
      pendientes: Number(fila?.pendientes ?? 0),
      otros: Number(fila?.otros ?? 0),
      internos: Number(fila?.internos ?? 0),
    };
  }
}

const TAMANO = 10;

type Cuentas = { tareas: number; pendientes: number; otros: number; internos: number };
type PaginaTareas = { tareas: FilaTarea[]; total: number; pagina: number; paginas: number; cuentas: Cuentas };
type FilaSector = {
  id: string;
  gmail_thread_id: string;
  asunto: string;
  de: string;
  fecha: Date | null;
  correos: number;
  areas: string[];
  resumen: string;
  atencion: string;
};
type PaginaSector = { correos: FilaSector[]; total: number; pagina: number; paginas: number; cuentas: Cuentas; areas: string[] };

const PATRON_AREA: Record<string, string> = {
  ZTRACK: '\\yZTRACK\\y',
  Despacho: '(^|\\n)\\s*DESPACHO\\s*(\\r?\\n|$)',
  SSOMA: '\\ySSOMA\\y',
  'Almacén': '(^|\\n)\\s*ALMAC[EÉ]N\\s*(\\r?\\n|$)',
  Transporte: '(^|\\n)\\s*TRANSPORTE\\s*(\\r?\\n|$)',
  'Área técnica': '[ÁA]REA[[:space:]]+T[ÉE]CNICA',
  Entrega: '(^|\\n)\\s*FECHA Y HORA DE ENTREGA',
};

function patronTexto(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  return `%${limpio.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

function patronArea(area: string | null): string | null {
  if (!area) return null;
  const patron = PATRON_AREA[area];
  if (!patron) throw new BadRequestException('Esa área no está en el encargo.');
  return patron;
}
type FilaTarea = Record<string, unknown> & { id: string; cot: string; estado?: string; ticket?: string | null; campana?: boolean; recordar_en?: Date | string | null };

type TiendaGuardada = {
  id: string;
  orden: number | null;
  cadena: string;
  nombre: string;
  contacto: string;
  celular: string;
  entrega_fecha: string | null;
  entrega_hora: string;
  status: string;
  tamano: string;
  direccion: string;
  mapa: string;
  estado: string;
  codigo_equipo: string | null;
  odoo_id: number | null;
  odoo_nombre: string;
  odoo_estado: string;
  notas?: Array<{ id: string; tipo: string; texto: string; autor_nombre: string; creado_en: Date }>;
};

type ServicioGuardado = { odoo_id: number; nombre: string; estado: string; tienda_id: string | null };

type NotaBitacora = {
  id: string;
  tipo: string;
  canal: string;
  texto: string;
  autor_nombre: string;
  autor_correo: string;
  archivo_nombre: string | null;
  archivo_mime: string | null;
  anula_id: string | null;
  archivado: boolean;
  creado_en: Date;
  imagenes: Array<{ id: string; nombre: string }>;
};

function unirReferencias(actuales: string[], nuevas: string[]): string[] {
  const todas: string[] = [];
  for (const frase of [...actuales, ...nuevas]) {
    if (!frase) continue;
    if (todas.some((previa) => plano(previa) === plano(frase))) continue;
    todas.push(frase);
  }
  return todas;
}

function anioLima(fecha: Date | string | null | undefined): number | undefined {
  if (!fecha) return undefined;
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return undefined;
  const anio = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(valor));
  return anio >= 2000 && anio <= 2099 ? anio : undefined;
}

function isoDe(fragmento: string | null, valor?: string | null): string | null {
  if (fragmento) {
    const directa = normalizarFecha(fragmento).iso;
    if (directa) return directa;
  }
  return valor ? normalizarFecha(valor).iso : null;
}

function fechaIso(valor: Date | string | null): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor);
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
}

const COLUMNAS: Record<string, keyof Extraccion | 'fecha'> = {
  ticket: 'ticket',
  descripcion: 'descripcion',
  lugar: 'lugar',
  cliente: 'cliente',
  cantidad: 'cantidad',
  temperatura: 'temperatura',
  producto: 'producto',
  contenedor: 'contenedor',
  comercial_nombre: 'comercialNombre',
  comercial_cargo: 'comercialCargo',
  comercial_correo: 'comercialCorreo',
  comercial_telefono: 'comercialTelefono',
  cita_fecha: 'fecha',
  cita_hora: 'hora',
  cita_direccion: 'direccion',
};

function columnaDe(campo: string): string {
  if (!COLUMNAS[campo]) throw new BadRequestException('Ese campo no se corrige.');
  return campo;
}

function valorCampo(campo: string, valor: string): string | number {
  const limpio = valor.trim();
  if (!limpio) throw new BadRequestException('Escribe el valor corregido.');
  if (campo === 'cantidad') {
    const cantidad = Number(limpio);
    if (!Number.isInteger(cantidad)) throw new BadRequestException('La cantidad es un número entero.');
    return cantidad;
  }
  if (campo === 'cita_fecha') {
    const iso = isoDe(limpio) ?? (/^\d{4}-\d{2}-\d{2}$/.test(limpio) ? limpio : null);
    if (!iso) throw new BadRequestException('La fecha es dd/mm/aaaa.');
    return iso;
  }
  return limpio;
}

function valorExtraido(extraccion: Extraccion | null, campo: string): string | number | null {
  if (!extraccion) return null;
  const clave = COLUMNAS[campo];
  if (!clave || clave === 'fecha') return isoDe(extraccion.fecha?.fragmento ?? extraccion.fecha?.valor ?? null);
  const valor = extraccion[clave]?.valor ?? null;
  if (campo === 'cantidad') {
    const cantidad = Number(valor);
    return Number.isInteger(cantidad) ? cantidad : null;
  }
  return valor;
}

type SituacionHilo = {
  tipo: string;
  resumen: string;
  cita_anterior: Cita | null;
  de: string;
  fecha: Date | null;
  asunto: string;
};
