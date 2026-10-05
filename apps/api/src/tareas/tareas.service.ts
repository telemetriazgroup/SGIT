import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { dictaminar, referenciasCitadas, type Clase } from './clasificar';
import { extraer, type Extraccion } from './extraer';
import { AREAS, armarSeguimiento, resumenHilo, type ResumenHilo, type Seguimiento } from './seguimiento';
import { AlmacenCorreo } from '../buzon/almacen';
import { barridoCorre, claveHora, entraHoraria } from './barrido';
import { evaluarCita, type Cita } from './cita';
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
    if (numeros.length === 0) {
      return {
        ...tarea,
        seguimiento: { momento: null, areas: [], linea: [] },
        situaciones: await this.situacionesDe(tarea.id),
        ...(await this.capaBitacora(tarea)),
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
    return { ...tarea, seguimiento: armarSeguimiento(mensajes.rows, terminos), situaciones, ...(await this.capaBitacora(tarea)) };
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
    const clasificacion = manual === 'evento' ? 'evento_desarrollo' : (manual ?? dictamen.clase);
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
    const creada = await this.abrirTarea(mensaje.id, lectura, referencias);
    const existente = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = $1`, [lectura.cot.valor]);
    const tareaId = existente.rows[0]?.id ?? null;
    if (tareaId) await this.anotarSituacion(tareaId, mensaje, lectura);
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

  private async destinoManual(hilo: string): Promise<'otros' | 'interna' | 'archivado' | 'evento' | null> {
    const resultado = await this.conexiones.pg.query<{ destino: string }>(
      `SELECT destino FROM decision_hilo WHERE gmail_thread_id = $1`,
      [hilo],
    );
    const destino = resultado.rows[0]?.destino;
    if (destino === 'otros' || destino === 'interna' || destino === 'archivado' || destino === 'evento') return destino;
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

  async tomar(id: string, autor: Autor): Promise<void> {
    const tarea = await this.filaTarea(id);
    if (tarea.responsable_correo && tarea.responsable_correo !== autor.correo) {
      throw new BadRequestException(`La tarea ya la tomó ${tarea.responsable_nombre}.`);
    }
    await this.conexiones.pg.query(
      `UPDATE tarea SET responsable_correo = $2, responsable_nombre = $3 WHERE id = $1`,
      [id, autor.correo, autor.nombre],
    );
  }

  async anotar(id: string, autor: Autor, tipo: string, texto: string, archivo: ArchivoNota | null): Promise<void> {
    if (tipo !== 'seguimiento' && tipo !== 'incidente') throw new BadRequestException('La nota es un seguimiento o un incidente.');
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe la nota.');
    await this.filaTarea(id);
    const imagen = await this.prepararImagen(archivo);
    const notaId = randomUUID();
    if (imagen) await new AlmacenCorreo(this.conexiones).guardar(imagen.clave(notaId), imagen.contenido, imagen.mime);
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (
         id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime
       ) VALUES ($1,$2,$3,'web',$4,$5,$6,$7,$8,$9)`,
      [notaId, id, tipo, limpio, autor.correo, autor.nombre, imagen ? imagen.clave(notaId) : null, imagen?.nombre ?? null, imagen?.mime ?? null],
    );
    if (tipo === 'seguimiento') {
      await this.conexiones.pg.query(
        `UPDATE tarea SET estado = CASE WHEN estado = 'en_validacion' THEN estado ELSE 'en_seguimiento' END WHERE id = $1`,
        [id],
      );
    }
  }

  async validar(id: string, horas: number, ahora = new Date()): Promise<Date> {
    if (!Number.isInteger(horas) || horas < 1 || horas > 48) throw new BadRequestException('Las horas van de 1 a 48.');
    await this.filaTarea(id);
    const recordar = new Date(ahora.getTime() + horas * 60 * 60 * 1000);
    await this.conexiones.pg.query(
      `UPDATE recordatorio SET estado = 'cancelado' WHERE tarea_id = $1 AND tipo = 'snooze' AND estado = 'pendiente'`,
      [id],
    );
    await this.conexiones.pg.query(
      `INSERT INTO recordatorio (id, tarea_id, tipo, recordar_en, estado, hora_bucket)
       VALUES ($1,$2,'snooze',$3,'pendiente',$4)`,
      [randomUUID(), id, recordar.toISOString(), recordar.toISOString()],
    );
    await this.conexiones.pg.query(`UPDATE tarea SET estado = 'en_validacion', recordar_en = $2 WHERE id = $1`, [id, recordar.toISOString()]);
    return recordar;
  }

  async anular(id: string, notaId: string, autor: Autor, texto: string): Promise<void> {
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
    const horarias: string[] = [];
    if (corre) {
      const tareas = await this.conexiones.pg.query<{ id: string; estado: string; recordar_en: Date | null; seguimiento: boolean }>(
        `SELECT t.id, t.estado, t.recordar_en,
                EXISTS (SELECT 1 FROM nota_bitacora n WHERE n.tarea_id = t.id AND n.tipo = 'seguimiento') AS seguimiento
         FROM tarea t
         WHERE t.cot <> '10000000000' AND t.estado = 'detectada'`,
      );
      const bucket = claveHora(ahora);
      for (const tarea of tareas.rows) {
        if (!entraHoraria({ estado: tarea.estado, seguimiento: tarea.seguimiento, recordarEn: tarea.recordar_en }, ahora, feriados)) continue;
        const alta = await this.conexiones.pg.query(
          `INSERT INTO recordatorio (id, tarea_id, tipo, recordar_en, estado, hora_bucket)
           VALUES ($1,$2,'horario',$3,'pendiente',$4)
           ON CONFLICT (tarea_id, hora_bucket) WHERE tipo = 'horario' DO NOTHING
           RETURNING id`,
          [randomUUID(), tarea.id, ahora.toISOString(), bucket],
        );
        if ((alta.rowCount ?? 0) > 0) horarias.push(tarea.id);
      }
    }
    const vencidos = await this.conexiones.pg.query<{ tarea_id: string }>(
      `UPDATE recordatorio SET estado = 'enviado'
       WHERE tipo = 'snooze' AND estado = 'pendiente' AND recordar_en <= $1
       RETURNING tarea_id`,
      [ahora.toISOString()],
    );
    return { corre, horarias, vencidos: vencidos.rows.map((fila) => fila.tarea_id) };
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
      `SELECT id, tipo, canal, texto, autor_nombre, autor_correo, archivo_nombre, archivo_mime, anula_id, creado_en
       FROM nota_bitacora WHERE tarea_id = $1 ORDER BY creado_en`,
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

  private async prepararImagen(archivo: ArchivoNota | null): Promise<{ nombre: string; mime: string; contenido: Buffer; clave: (id: string) => string } | null> {
    if (!archivo) return null;
    const mime = archivo.mime.toLowerCase();
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
    }>(
      `SELECT cita_fecha, cita_hora, cita_direccion, campos_corregidos,
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
    const tipo = Number(fila.previas) === 0 ? 'origen' : efecto.reprograma ? 'reprogramacion' : 'informativa';
    await this.conexiones.pg.query(
      `INSERT INTO situacion_hilo (id, tarea_id, mensaje_id, tipo, resumen, cita_anterior)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (mensaje_id) DO NOTHING`,
      [
        randomUUID(),
        tareaId,
        mensaje.id,
        tipo,
        (mensaje.asunto || '(sin asunto)').slice(0, 240),
        efecto.anterior ? JSON.stringify(efecto.anterior) : null,
      ],
    );
    if (!efecto.fecha && !efecto.hora && !efecto.direccion) return;
    await this.conexiones.pg.query(
      `UPDATE tarea SET
         cita_fecha = COALESCE($2::date, cita_fecha),
         cita_hora = COALESCE($3, cita_hora),
         cita_direccion = COALESCE($4, cita_direccion)
       WHERE id = $1`,
      [tareaId, efecto.fecha, efecto.hora, efecto.direccion],
    );
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
type FilaTarea = Record<string, unknown> & { id: string; cot: string; estado?: string; recordar_en?: Date | string | null };

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
  creado_en: Date;
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
