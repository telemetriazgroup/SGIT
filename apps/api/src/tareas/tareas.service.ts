import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { dictaminar, referenciasCitadas, type Clase } from './clasificar';
import { extraer, type Extraccion } from './extraer';
import { AREAS, armarSeguimiento, resumenHilo, type ResumenHilo, type Seguimiento } from './seguimiento';
import { cotsDe, normalizarFecha, plano } from './texto';

export type ResultadoProceso = {
  mensajeId: string;
  clasificacion: Clase | 'archivado';
  cot: string | null;
  tareaId: string | null;
  creada: boolean;
  avisos: 0;
  motivo: 'dos cot' | 'sin referencia' | 'falta cot' | 'interna' | null;
};

type FilaMensaje = {
  id: string;
  gmail_thread_id: string;
  asunto: string;
  de: string;
  texto: string;
};

export class TareasService {
  constructor(private readonly conexiones: Conexiones) {}

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

  async procesarDesde(desde: Date): Promise<{
    mensajes: number;
    nuevas: number;
    repetidas: number;
    pendientes: number;
    otros: number;
  }> {
    const terminos = await this.terminosActivos();
    const filas = await this.conexiones.pg.query<FilaMensaje>(
      `SELECT id, gmail_thread_id, asunto, de, texto
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

  async listar(pagina: number, busqueda = ''): Promise<PaginaTareas> {
    const cuentas = await this.cuentas();
    const filtro = patronTexto(busqueda);
    const donde = `WHERE ($1::text IS NULL
         OR cot ILIKE $1 ESCAPE '\\'
         OR coalesce(cliente, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(lugar, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(ticket, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(descripcion, '') ILIKE $1 ESCAPE '\\'
         OR coalesce(comercial_nombre, '') ILIKE $1 ESCAPE '\\'
         OR array_to_string(cots, ' ') ILIKE $1 ESCAPE '\\'
         OR array_to_string(referencias, ' ') ILIKE $1 ESCAPE '\\')
       AND tarea.cot <> '10000000000'`;
    const conteo = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM tarea ${donde}`, [filtro]);
    const total = Number(conteo.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(total / TAMANO));
    const actual = Math.min(Math.max(1, pagina), paginas);
    const resultado = await this.conexiones.pg.query<FilaTarea>(
      `SELECT tarea.id, tarea.cot, tarea.cots, tarea.referencias, tarea.estado, tarea.ticket, tarea.lugar, tarea.cliente, tarea.descripcion, tarea.cita_fecha, tarea.cita_hora,
              tarea.comercial_nombre, ult.fecha
       FROM tarea
       LEFT JOIN LATERAL (
         SELECT max(c.fecha) AS fecha
         FROM mensaje_correo origen
         JOIN mensaje_correo c ON c.gmail_thread_id = origen.gmail_thread_id
         WHERE origen.id = tarea.mensaje_id
       ) ult ON true
       ${donde}
       ORDER BY ult.fecha DESC NULLS LAST, tarea.creado_en DESC
       LIMIT $2 OFFSET $3`,
      [filtro, TAMANO, (actual - 1) * TAMANO],
    );
    return { tareas: resultado.rows, total, pagina: actual, paginas, cuentas };
  }

  async sector(
    nombre: 'pendiente' | 'otros' | 'internos',
    pagina: number,
    area: string | null,
    busqueda = '',
    atencion: 'por_atender' | 'atendido' | null = null,
  ): Promise<PaginaSector> {
    const cuentas = await this.cuentas();
    const patron = patronArea(area);
    const texto = patronTexto(busqueda);
    const filtro =
      nombre === 'pendiente'
        ? 'h.pendiente AND NOT h.tarea AND NOT h.interna AND NOT h.archivado'
        : nombre === 'internos'
          ? 'h.interna AND NOT h.tarea AND NOT h.archivado'
          : 'NOT h.tarea AND NOT h.pendiente AND NOT h.interna AND NOT h.archivado';
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
                bool_or(clasificacion = 'archivado') AS archivado
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT count(*)::text AS total
       FROM hilos h
       LEFT JOIN asunto_interno a ON a.gmail_thread_id = h.gmail_thread_id
       WHERE ${filtro} ${porArea} ${porTexto}
         AND ($3::text IS NULL OR coalesce(a.estado, 'por_atender') = $3)`,
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
                bool_or(clasificacion = 'archivado') AS archivado
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT m.id, m.gmail_thread_id, m.asunto, m.de, m.fecha, m.correos,
              coalesce(a.estado, 'por_atender') AS atencion
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
       WHERE ${filtro} ${porArea} ${porTexto}
         AND ($3::text IS NULL OR coalesce(a.estado, 'por_atender') = $3)
       ORDER BY m.fecha DESC NULLS LAST, m.creado_en DESC
       LIMIT $4 OFFSET $5`,
      [patron, texto, atencion, TAMANO, (actual - 1) * TAMANO],
    );
    const correos = await this.conResumen(resultado.rows);
    return { correos, total, pagina: actual, paginas, cuentas, areas: [...AREAS] };
  }

  async resumenDeMensaje(
    id: string,
  ): Promise<ResumenHilo & { id: string; asunto: string; de: string; fecha: Date | null; atencion: 'por_atender' | 'atendido'; respuesta: string }> {
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
    return { id, asunto: ultimo?.asunto ?? ancla.asunto, de: ultimo?.de ?? '', fecha: ultimo?.fecha ?? null, ...resumen, ...atencion };
  }

  async ficha(id: string): Promise<(FilaTarea & { seguimiento: Seguimiento }) | null> {
    const resultado = await this.conexiones.pg.query<FilaTarea>(`SELECT * FROM tarea WHERE id = $1`, [id]);
    const tarea = resultado.rows[0];
    if (!tarea) return null;
    const guardados = Array.isArray(tarea.cots) ? tarea.cots.map(String) : [];
    const numeros = (guardados.length > 0 ? guardados : String(tarea.cot ?? '').split('+')).filter((numero) => /^\d{6,}$/.test(numero));
    if (numeros.length === 0) return { ...tarea, seguimiento: { momento: null, areas: [], linea: [] } };
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
    return { ...tarea, seguimiento: armarSeguimiento(mensajes.rows, terminos) };
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
    const clasificacion = manual ?? dictamen.clase;
    const lectura = extraer(mensaje.asunto, mensaje.texto);
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
      return { mensajeId: mensaje.id, clasificacion, cot: lectura.cot.valor, tareaId: null, creada: false, avisos: 0, motivo: dictamen.motivo };
    }
    const creada = await this.abrirTarea(mensaje.id, lectura, referencias);
    const existente = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = $1`, [lectura.cot.valor]);
    return {
      mensajeId: mensaje.id,
      clasificacion,
      cot: lectura.cot.valor,
      tareaId: existente.rows[0]?.id ?? null,
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
        isoDe(lectura.fecha.fragmento),
        lectura.hora.valor,
        lectura.direccion.valor,
        lectura.mapa.valor,
        isoDe(lectura.citaParcialFecha.fragmento),
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
    const previa = await this.conexiones.pg.query<{ referencias: string[] }>(`SELECT referencias FROM tarea WHERE cot = $1`, [lectura.cot.valor]);
    const referenciasUnidas = unirReferencias(previa.rows[0]?.referencias ?? [], referencias);
    await this.conexiones.pg.query(
      `UPDATE tarea SET
         ticket = COALESCE(ticket, $2),
         descripcion = CASE
           WHEN $3::text IS NULL THEN descripcion
           WHEN descripcion IS NULL OR descripcion ~* '^(cot\\.?\\s*)?1002\\d{7}$' OR descripcion ~* '^asignar y despachar' THEN $3
           ELSE descripcion
         END,
         lugar = CASE
           WHEN lugar ~* 'alquiler|venta de|servicio de|instalaci' THEN $4
           WHEN lugar ~ '^[0-9]' THEN $4
           WHEN lugar IS NOT NULL AND lugar = $5 THEN $4
           WHEN lugar IS NULL THEN $4
           ELSE lugar
         END,
         cliente = CASE
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
           WHEN $8::text IS NOT NULL AND producto ~* 'reefer|contenedor' AND $8 !~* 'reefer|contenedor' THEN $8
           ELSE COALESCE(producto, $8)
         END,
         contenedor = COALESCE(contenedor, $9),
         comercial_nombre = CASE
           WHEN $10::text IS NOT NULL AND (
             comercial_nombre IS NULL
             OR comercial_nombre ~* 'excelente|https?://|que tenga|saludos|www\.'
           ) THEN $10
           ELSE COALESCE(comercial_nombre, $10)
         END,
         comercial_cargo = CASE
           WHEN $11::text IS NOT NULL AND (
             comercial_cargo IS NULL
             OR comercial_cargo ~* 'https?://|www\.'
           ) THEN $11
           ELSE COALESCE(comercial_cargo, $11)
         END,
         comercial_correo = COALESCE(comercial_correo, $12),
         comercial_telefono = CASE
           WHEN $13::text IS NOT NULL AND (
             comercial_telefono IS NULL
             OR comercial_telefono ~ '^1002[0-9]{7}$'
             OR comercial_telefono = cot
           ) THEN $13
           ELSE COALESCE(comercial_telefono, $13)
         END,
         cita_fecha = COALESCE(cita_fecha, $14),
         cita_hora = COALESCE(cita_hora, $15),
         cita_direccion = COALESCE(cita_direccion, $16),
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
        isoDe(lectura.fecha.fragmento),
        lectura.hora.valor,
        lectura.direccion.valor,
        lectura.mapa.valor,
        isoDe(lectura.citaParcialFecha.fragmento),
        lectura.citaParcialHora.valor,
        referenciasUnidas,
      ],
    );
  }

  private async retirarSinEncargo(): Promise<void> {
    await this.conexiones.pg.query(
      `DELETE FROM tarea t
       WHERE t.estado = 'detectada'
         AND t.cot <> '10000000000'
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
      `SELECT id, gmail_thread_id, asunto, de, texto FROM mensaje_correo WHERE id = $1`,
      [id],
    );
    return resultado.rows[0] ?? null;
  }

  async decidir(id: string, destino: 'otros' | 'interna' | 'archivado'): Promise<{ destino: 'otros' | 'interna' | 'archivado'; asunto: string }> {
    const ancla = await this.mensaje(id);
    if (!ancla) throw new NotFoundException('No está ese correo.');
    const estado = await this.estadoHilo(ancla.gmail_thread_id);
    if (estado.tarea) throw new BadRequestException('Esa cotización ya es una tarea.');
    if (destino === 'archivado') {
      if (estado.pendiente || estado.interna || estado.archivado) {
        throw new BadRequestException('Solo se archiva lo que está en Otros.');
      }
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
      destino === 'interna' ? 'interna' : destino,
    ]);
    if (destino === 'interna') {
      await this.conexiones.pg.query(
        `INSERT INTO asunto_interno (gmail_thread_id, estado, respuesta)
         VALUES ($1, 'por_atender', '')
         ON CONFLICT (gmail_thread_id) DO NOTHING`,
        [ancla.gmail_thread_id],
      );
    }
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

  private async destinoManual(hilo: string): Promise<'otros' | 'interna' | 'archivado' | null> {
    const resultado = await this.conexiones.pg.query<{ destino: string }>(
      `SELECT destino FROM decision_hilo WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const destino = resultado.rows[0]?.destino;
    if (destino === 'otros' || destino === 'interna' || destino === 'archivado') return destino;
    return null;
  }

  private async estadoHilo(hilo: string): Promise<{ tarea: boolean; pendiente: boolean; interna: boolean; archivado: boolean }> {
    const resultado = await this.conexiones.pg.query<{ tarea: boolean | null; pendiente: boolean | null; interna: boolean | null; archivado: boolean | null }>(
      `SELECT bool_or(clasificacion = 'evento_desarrollo') AS tarea,
              bool_or(clasificacion = 'pendiente') AS pendiente,
              bool_or(clasificacion = 'interna') AS interna,
              bool_or(clasificacion = 'archivado') AS archivado
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
    };
  }

  private async leerAtencion(hilo: string): Promise<{ atencion: 'por_atender' | 'atendido'; respuesta: string }> {
    const resultado = await this.conexiones.pg.query<{ estado: string; respuesta: string }>(
      `SELECT estado, respuesta FROM asunto_interno WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const fila = resultado.rows[0];
    return { atencion: fila?.estado === 'atendido' ? 'atendido' : 'por_atender', respuesta: fila?.respuesta ?? '' };
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

  private async cuentas(): Promise<Cuentas> {
    const resultado = await this.conexiones.pg.query<{ tareas: string; pendientes: string; otros: string; internos: string }>(
      `WITH hilos AS (
         SELECT bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'pendiente') AS pendiente,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'archivado') AS archivado
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       )
       SELECT (SELECT count(*) FROM tarea WHERE cot <> '10000000000')::text AS tareas,
              count(*) FILTER (WHERE pendiente AND NOT tarea AND NOT interna AND NOT archivado)::text AS pendientes,
              count(*) FILTER (WHERE NOT tarea AND NOT pendiente AND NOT interna AND NOT archivado)::text AS otros,
              count(*) FILTER (WHERE interna AND NOT tarea AND NOT archivado)::text AS internos
       FROM hilos`,
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
type FilaTarea = Record<string, unknown> & { id: string; cot: string };

function unirReferencias(actuales: string[], nuevas: string[]): string[] {
  const todas: string[] = [];
  for (const frase of [...actuales, ...nuevas]) {
    if (!frase) continue;
    if (todas.some((previa) => plano(previa) === plano(frase))) continue;
    todas.push(frase);
  }
  return todas;
}

function isoDe(fragmento: string | null): string | null {
  if (!fragmento) return null;
  return normalizarFecha(fragmento).iso;
}
