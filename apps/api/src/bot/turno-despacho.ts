import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { AlmacenCorreo } from '../buzon/almacen';
import type { Conexiones } from '../conexiones';
import { turnoCorre } from '../tareas/barrido';
import { joinUrgente, ordenUrgente } from '../tareas/prioridad';
import {
  PAUSA_MS,
  citaVisible,
  momentosDeEnvio,
  textoApertura,
  textoAvisoAsignacion,
  textoFichaDespacho,
  textoReconsultaDespacho,
  type DatosAviso,
} from './avisos';
import { asumirZgru, claseDe, confirmarImagen, presentarLectura, proponerImagen } from './proceso-imagen';

const SILENCIO_MS = 30 * 60 * 1000;

type TareaTurno = {
  id: string;
  cot: string;
  cliente: string | null;
  lugar: string | null;
  cita_fecha: string | null;
  cita_hora: string | null;
  cantidad: number | null;
};

export class TurnoDespacho {
  constructor(private readonly conexiones: Conexiones) {}

  private get pg(): Pool {
    return this.conexiones.pg;
  }

  async pulsar(ahora = new Date()): Promise<void> {
    await this.cerrarSilencio(ahora);
    await this.avisarFaltantes();
    await this.abrirSiguiente(ahora, null);
  }

  async tocar(tareaId: string): Promise<void> {
    await this.pg.query(
      `UPDATE turno_despacho SET ultimo_mensaje_en = now() WHERE tarea_id = $1 AND estado = 'en_curso'`,
      [tareaId],
    );
  }

  async dueno(tareaId: string, telefono: string): Promise<{ propio: boolean; otro: string | null }> {
    const tomado = await this.pg.query(
      `UPDATE turno_despacho SET telefono_dueno = $2
       WHERE tarea_id = $1 AND estado = 'en_curso' AND (telefono_dueno IS NULL OR telefono_dueno = $2)
       RETURNING telefono_dueno`,
      [tareaId, telefono],
    );
    if ((tomado.rowCount ?? 0) > 0) return { propio: true, otro: null };
    const ajeno = await this.pg.query<{ nombre: string | null }>(
      `SELECT u.nombre
       FROM turno_despacho t
       LEFT JOIN usuario u ON u.telefono = t.telefono_dueno
       WHERE t.tarea_id = $1 AND t.estado = 'en_curso'`,
      [tareaId],
    );
    if (!ajeno.rows[0]) return { propio: false, otro: null };
    return { propio: false, otro: ajeno.rows[0].nombre ?? 'otro coordinador' };
  }

  async soltar(tareaId: string, telefono: string): Promise<void> {
    await this.pg.query(
      `UPDATE turno_despacho SET telefono_dueno = NULL
       WHERE tarea_id = $1 AND estado = 'en_curso' AND telefono_dueno = $2`,
      [tareaId, telefono],
    );
  }

  async abandonar(tareaId: string): Promise<void> {
    await this.pg.query(
      `UPDATE turno_despacho
       SET estado = 'en_cola', telefono_dueno = NULL, ultimo_mensaje_en = NULL
       WHERE tarea_id = $1 AND estado = 'en_curso'`,
      [tareaId],
    );
  }

  async agregar(tareaId: string, autor: { correo: string; nombre: string }, texto: string): Promise<string> {
    const vigente = await this.pg.query<{ id: string; texto: string }>(
      `SELECT id, texto FROM asignacion_despacho
       WHERE tarea_id = $1 AND estado IN ('recogiendo', 'por_validar')
       ORDER BY creado_en DESC LIMIT 1`,
      [tareaId],
    );
    const previo = vigente.rows[0];
    const junto = previo?.texto ? `${previo.texto}\n${texto}` : texto;
    const asignacionId = previo?.id ?? randomUUID();
    if (previo) {
      await this.pg.query(
        `UPDATE asignacion_despacho
         SET texto = $2, estado = 'recogiendo', autor_correo = $3, autor_nombre = $4
         WHERE id = $1`,
        [previo.id, junto, autor.correo, autor.nombre],
      );
    } else {
      await this.pg.query(
        `INSERT INTO asignacion_despacho (id, tarea_id, autor_correo, autor_nombre, texto, estado)
         VALUES ($1, $2, $3, $4, $5, 'recogiendo')`,
        [asignacionId, tareaId, autor.correo, autor.nombre, junto],
      );
    }
    await this.tocar(tareaId);
    await this.movimiento(tareaId, asignacionId, 'texto', autor.nombre, texto);
    return junto;
  }

  async textoDe(tareaId: string): Promise<string> {
    const fila = await this.pg.query<{ texto: string }>(
      `SELECT texto FROM asignacion_despacho
       WHERE tarea_id = $1 AND estado IN ('recogiendo', 'por_validar')
       ORDER BY creado_en DESC LIMIT 1`,
      [tareaId],
    );
    return fila.rows[0]?.texto?.trim() ?? '';
  }

  async marcarValidacion(tareaId: string): Promise<void> {
    await this.pg.query(
      `UPDATE asignacion_despacho SET estado = 'por_validar'
       WHERE id = (
         SELECT id FROM asignacion_despacho
         WHERE tarea_id = $1 AND estado = 'recogiendo'
         ORDER BY creado_en DESC LIMIT 1
       )`,
      [tareaId],
    );
    await this.tocar(tareaId);
  }

  async confirmar(tareaId: string, motivo: 'ok' | 'silencio' = 'ok'): Promise<string | null> {
    const fila = await this.pg.query<{ id: string; autor_nombre: string }>(
      `UPDATE asignacion_despacho SET estado = 'confirmada', confirmada_en = now(), validacion = 'pendiente'
       WHERE id = (
         SELECT id FROM asignacion_despacho
         WHERE tarea_id = $1 AND estado IN ('recogiendo', 'por_validar')
         ORDER BY creado_en DESC LIMIT 1
       )
       RETURNING id, autor_nombre`,
      [tareaId],
    );
    await this.pg.query(
      `UPDATE turno_despacho SET estado = 'cerrada', pregunta = NULL, ultimo_mensaje_en = now() WHERE tarea_id = $1 AND estado = 'en_curso'`,
      [tareaId],
    );
    const id = fila.rows[0]?.id ?? null;
    if (id) {
      const actor = motivo === 'silencio' ? 'sistema' : fila.rows[0].autor_nombre;
      const detalle = motivo === 'silencio'
        ? 'Pasó 1 minuto sin ok. Quedó guardado el texto y las imágenes, todavía sin validar por el técnico.'
        : 'Confirmó con ok. Las imágenes ya estaban guardadas. La lectura sigue en interno y el técnico la verá cuando termine.';
      await this.movimiento(tareaId, id, 'guardado', actor, detalle);
      void this.avisar(id).catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'no pude avisar la asignación';
        console.error(`Despacho: ${mensaje}`);
      });
    }
    return id;
  }

  async descartar(tareaId: string): Promise<void> {
    await this.pg.query(
      `UPDATE asignacion_despacho SET estado = 'descartada'
       WHERE tarea_id = $1 AND estado IN ('recogiendo', 'por_validar')`,
      [tareaId],
    );
    await this.tocar(tareaId);
  }

  async resumen(tareaId: string): Promise<string | null> {
    const datos = await this.datos(tareaId);
    return datos ? textoFichaDespacho(this.aviso(datos)) : null;
  }

  async cotDe(tareaId: string): Promise<string | null> {
    const fila = await this.pg.query<{ cot: string }>(`SELECT cot FROM tarea WHERE id = $1`, [tareaId]);
    return fila.rows[0]?.cot ?? null;
  }

  async menu(): Promise<Array<{ id: string; cot: string; cliente: string | null; lugar: string | null; campana: boolean; despacho_fecha: string | null; despacho_hora: string | null }>> {
    const filas = await this.pg.query<{ id: string; cot: string; cliente: string | null; lugar: string | null; campana: boolean; despacho_fecha: string | null; despacho_hora: string | null }>(
      `SELECT tarea.id, tarea.cot, tarea.cliente, tarea.lugar, tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora
       FROM tarea
       ${joinUrgente('tarea')}
       WHERE tarea.cot <> '10000000000' AND tarea.estado <> 'resuelta'
         AND tarea.campana = false
         AND NOT EXISTS (
           SELECT 1 FROM tienda x WHERE x.tarea_hija_id = tarea.id AND x.estado IN ('atendida', 'resuelta')
         )
         AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text)
       ORDER BY ${ordenUrgente('tarea')}
       LIMIT 15`,
    );
    return filas.rows;
  }

  async cambiar(actualId: string | null, destinoId: string): Promise<boolean> {
    const cliente = await this.pg.connect();
    try {
      await cliente.query('BEGIN');
      if (actualId && actualId !== destinoId) {
        await cliente.query(
          `UPDATE turno_despacho SET estado = 'en_cola', telefono_dueno = NULL, abierto_en = now()
           WHERE tarea_id = $1 AND estado = 'en_curso'`,
          [actualId],
        );
      }
      const subida = await cliente.query(
        `UPDATE turno_despacho SET estado = 'en_curso', telefono_dueno = NULL, ultimo_mensaje_en = now()
         WHERE tarea_id = $1 AND estado IN ('en_cola', 'reconsulta')
         RETURNING id`,
        [destinoId],
      );
      if ((subida.rowCount ?? 0) === 0) {
        const ya = await cliente.query(`SELECT 1 FROM turno_despacho WHERE tarea_id = $1 AND estado = 'en_curso'`, [destinoId]);
        if (!ya.rows[0]) {
          await cliente.query(
            `INSERT INTO turno_despacho (id, tarea_id, estado, abierto_en, ultimo_mensaje_en)
             VALUES ($1, $2, 'en_curso', now(), now())`,
            [randomUUID(), destinoId],
          );
        }
      }
      await cliente.query('COMMIT');
      return true;
    } catch (error) {
      await cliente.query('ROLLBACK');
      const codigo = (error as { code?: string }).code;
      if (codigo === '23505') return false;
      throw error;
    } finally {
      cliente.release();
    }
  }

  async abrirSiguiente(ahora: Date, excepto: string | null): Promise<string | null> {
    const feriados = await this.feriados();
    if (!turnoCorre(ahora, feriados)) return null;
    const enCurso = await this.pg.query(`SELECT 1 FROM turno_despacho WHERE estado = 'en_curso' LIMIT 1`);
    if (enCurso.rows[0]) return null;
    const destinos = await this.coordinadores();
    if (destinos.length === 0) return null;
    const pausados = await this.pg.query<{ telefono: string }>(
      `SELECT telefono FROM charla
       WHERE telefono = ANY($1::text[])
         AND (
           COALESCE(pendiente->>'espera_menu', '') = 'true'
           OR paso = 'despacho_menu'
         )`,
      [destinos.map((destino) => destino.telefono)],
    );
    const enPausa = new Set(pausados.rows.map((fila) => fila.telefono));
    const conCharla = destinos.filter((destino) => destino.telefono === excepto || !enPausa.has(destino.telefono));
    if (conCharla.length === 0) return null;
    const tarea = await this.siguiente();
    if (!tarea) return null;
    const cliente = await this.pg.connect();
    let pregunta: string | null = null;
    try {
      await cliente.query('BEGIN');
      const subida = await cliente.query<{ pregunta: string | null }>(
        `UPDATE turno_despacho SET estado = 'en_curso', telefono_dueno = NULL, ultimo_mensaje_en = $2
         WHERE tarea_id = $1 AND estado IN ('en_cola', 'reconsulta')
         RETURNING pregunta`,
        [tarea.id, ahora.toISOString()],
      );
      pregunta = subida.rows[0]?.pregunta ?? null;
      if ((subida.rowCount ?? 0) === 0) {
        await cliente.query(
          `INSERT INTO turno_despacho (id, tarea_id, estado, abierto_en, ultimo_mensaje_en)
           VALUES ($1, $2, 'en_curso', $3, $3)`,
          [randomUUID(), tarea.id, ahora.toISOString()],
        );
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      const codigo = (error as { code?: string }).code;
      if (codigo === '23505') return null;
      throw error;
    } finally {
      cliente.release();
    }
    const anterior = pregunta ? await this.textoConfirmado(tarea.id) : '';
    const imagenes = pregunta ? await this.contarImagenes(tarea.id, ['confirmada']) : 0;
    const texto = pregunta
      ? textoReconsultaDespacho(tarea.cot, pregunta, anterior, imagenes, tarea.lugar)
      : textoApertura(this.aviso(tarea));
    const avisos = conCharla.filter((destino) => destino.telefono !== excepto);
    const momentos = momentosDeEnvio(avisos.length, ahora, PAUSA_MS);
    const cuando = new Map(avisos.map((destino, indice) => [destino.telefono, momentos[indice].toISOString()]));
    for (const destino of conCharla) {
      const tomada = await this.pg.query(
        `INSERT INTO charla (telefono, paso, tarea_id, lista, pendiente, actualizado_en)
         VALUES ($1, 'despacho_oferta', $2, '[]'::jsonb, NULL, now())
         ON CONFLICT (telefono) DO UPDATE
           SET paso = 'despacho_oferta', tarea_id = EXCLUDED.tarea_id, lista = '[]'::jsonb, pendiente = NULL, actualizado_en = now()
         WHERE COALESCE(charla.pendiente->>'espera_menu', '') <> 'true'
           AND charla.paso <> 'despacho_menu'
         RETURNING telefono`,
        [destino.telefono, tarea.id],
      );
      const envio = cuando.get(destino.telefono);
      if (!tomada.rows[0] || !envio) continue;
      await this.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'apertura_despacho', $2, $3, $4, 'pendiente', $5)`,
        [randomUUID(), tarea.id, destino.telefono, texto, envio],
      );
    }
    return texto;
  }

  private async cerrarSilencio(ahora: Date): Promise<void> {
    const curso = await this.pg.query<{ tarea_id: string; ultimo_mensaje_en: Date | null }>(
      `SELECT tarea_id, ultimo_mensaje_en FROM turno_despacho WHERE estado = 'en_curso' LIMIT 1`,
    );
    const fila = curso.rows[0];
    if (!fila?.ultimo_mensaje_en) return;
    if (ahora.getTime() - new Date(fila.ultimo_mensaje_en).getTime() < SILENCIO_MS) return;
    const texto = await this.textoDe(fila.tarea_id);
    const imagenes = await this.contarImagenes(fila.tarea_id);
    if (texto || imagenes > 0) await this.confirmar(fila.tarea_id);
    else {
      await this.pg.query(
        `UPDATE turno_despacho
         SET estado = 'en_cola', telefono_dueno = NULL, abierto_en = $2, ultimo_mensaje_en = NULL
         WHERE tarea_id = $1 AND estado = 'en_curso'`,
        [fila.tarea_id, ahora.toISOString()],
      );
    }
    await this.pg.query(
      `UPDATE charla SET paso = 'menu', tarea_id = NULL, lista = '[]'::jsonb, pendiente = NULL, actualizado_en = now()
       WHERE tarea_id = $1 AND paso LIKE 'despacho_%'`,
      [fila.tarea_id],
    );
  }

  async contarImagenes(tareaId: string, estados: string[] = ['recogiendo', 'por_validar']): Promise<number> {
    const fila = await this.pg.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM asignacion_archivo f
       JOIN asignacion_despacho a ON a.id = f.asignacion_id
       WHERE a.tarea_id = $1 AND a.estado = ANY($2::text[])`,
      [tareaId, estados],
    );
    return Number(fila.rows[0]?.total ?? 0);
  }

  async agregarImagen(
    tareaId: string,
    autor: { correo: string; nombre: string },
    archivo: { nombre: string; mime: string; contenido: Buffer },
  ): Promise<string | null> {
    const mime = archivo.mime.toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) return 'La foto tiene que ser una imagen.';
    if (archivo.contenido.length === 0 || archivo.contenido.length > 4 * 1024 * 1024) return 'La foto pasa de 4 MB.';
    const asignacionId = await this.asegurar(tareaId, autor);
    const archivoId = randomUUID();
    const clave = `asignacion/${archivoId}`;
    await new AlmacenCorreo(this.conexiones).guardar(clave, archivo.contenido, mime);
    await this.pg.query(
      `INSERT INTO asignacion_archivo (id, asignacion_id, clave, mime, nombre) VALUES ($1, $2, $3, $4, $5)`,
      [archivoId, asignacionId, clave, mime, archivo.nombre.trim().slice(0, 180) || 'foto'],
    );
    await this.tocar(tareaId);
    await this.movimiento(tareaId, asignacionId, 'imagen', autor.nombre, `Guardó la imagen ${archivo.nombre.trim().slice(0, 80) || 'foto'} antes de procesarla.`);
    return null;
  }

  async paquete(tareaId: string): Promise<{
    id: string;
    cot: string;
    cliente: string | null;
    lugar: string | null;
    autor: string;
    texto: string;
    imagenes: Array<{ id: string; nombre: string }>;
    lecturas: string[];
    consulta: string | null;
    validacion: string | null;
  } | null> {
    const fila = await this.pg.query<{ id: string; cot: string; cliente: string | null; lugar: string | null; autor_nombre: string; texto: string; validacion: string | null }>(
      `SELECT a.id, t.cot, t.cliente, t.lugar, a.autor_nombre, a.texto, a.validacion
       FROM asignacion_despacho a
       JOIN tarea t ON t.id = a.tarea_id
       WHERE a.tarea_id = $1 AND a.estado = 'confirmada'
       ORDER BY a.confirmada_en DESC NULLS LAST, a.creado_en DESC
       LIMIT 1`,
      [tareaId],
    );
    const asignacion = fila.rows[0];
    if (!asignacion) return null;
    const imagenes = await this.pg.query<{ id: string; nombre: string; codigo_ocr: string | null; codigo_firme: string | null; tipo_ocr: string | null }>(
      `SELECT id, nombre, codigo_ocr, codigo_firme, tipo_ocr FROM asignacion_archivo WHERE asignacion_id = $1 ORDER BY creado_en`,
      [asignacion.id],
    );
    const consulta = await this.pg.query<{ pregunta: string | null }>(
      `SELECT pregunta FROM turno_despacho WHERE tarea_id = $1 AND estado = 'reconsulta' ORDER BY abierto_en DESC LIMIT 1`,
      [tareaId],
    );
    const lecturas = imagenes.rows.map((imagen, indice) => presentarLectura(indice + 1, imagen.tipo_ocr ?? '', imagen.codigo_ocr, imagen.codigo_firme));
    return {
      id: asignacion.id,
      cot: asignacion.cot,
      cliente: asignacion.cliente,
      lugar: asignacion.lugar,
      autor: asignacion.autor_nombre,
      texto: asignacion.texto,
      imagenes: imagenes.rows,
      lecturas,
      consulta: consulta.rows[0]?.pregunta ?? null,
      validacion: asignacion.validacion,
    };
  }

  async aceptarLecturas(tareaId: string, actor: string): Promise<string> {
    const paquete = await this.paquete(tareaId);
    if (!paquete) return 'Despacho todavía no respondió esta cotización.';
    const imagenes = await this.pg.query<{ id: string; codigo_ocr: string | null; codigo_firme: string | null; tipo_ocr: string | null }>(
      `SELECT id, codigo_ocr, codigo_firme, tipo_ocr FROM asignacion_archivo WHERE asignacion_id = $1 ORDER BY creado_en`,
      [paquete.id],
    );
    for (const imagen of imagenes.rows) {
      const pelado = (imagen.codigo_firme || imagen.codigo_ocr || '').replace(/[\s\-_]+/g, '').toUpperCase();
      if (!pelado) continue;
      const clase = claseDe(imagen.tipo_ocr ?? '', pelado);
      const firme = asumirZgru(pelado, clase).codigo ?? pelado;
      if (firme !== imagen.codigo_firme) {
        await this.pg.query(`UPDATE asignacion_archivo SET codigo_firme = $2 WHERE id = $1`, [imagen.id, firme]);
      }
      if (clase === 'contenedor') await this.pg.query(`UPDATE tarea SET codigo_equipo = $2 WHERE id = $1`, [tareaId, firme]);
      if (clase === 'serie') await this.pg.query(`UPDATE tarea SET maquina_equipo = $2 WHERE id = $1`, [tareaId, firme]);
    }
    await this.pg.query(
      `UPDATE asignacion_despacho SET validacion = 'validada', validada_en = now() WHERE id = $1`,
      [paquete.id],
    );
    await this.movimiento(tareaId, paquete.id, 'validada', actor, 'El técnico corroboró que las lecturas son correctas.');
    return `Quedaron validadas las lecturas de la cotización ${paquete.cot.split('+').join(' · ')}.`;
  }

  async dejarSinValidar(tareaId: string): Promise<boolean> {
    const fila = await this.pg.query<{ id: string }>(
      `UPDATE asignacion_despacho SET validacion = 'sin_validar'
       WHERE id = (
         SELECT id FROM asignacion_despacho
         WHERE tarea_id = $1 AND estado = 'confirmada' AND validacion = 'pendiente'
         ORDER BY confirmada_en DESC NULLS LAST, creado_en DESC
         LIMIT 1
       )
       RETURNING id`,
      [tareaId],
    );
    const id = fila.rows[0]?.id;
    if (!id) return false;
    await this.movimiento(tareaId, id, 'sin_validar', 'sistema', 'Pasaron 5 minutos sin respuesta del técnico. Quedó registrado sin validar el envío ni los códigos leídos.');
    return true;
  }

  async corregir(tareaId: string, indice: number, codigo: string, actor = 'técnico'): Promise<string> {
    const fila = await this.pg.query<{ id: string; codigo_ocr: string | null; tipo_ocr: string | null; imagen_externa: string | null }>(
      `SELECT f.id, f.codigo_ocr, f.tipo_ocr, f.imagen_externa
       FROM asignacion_archivo f
       JOIN asignacion_despacho a ON a.id = f.asignacion_id
       WHERE a.tarea_id = $1 AND a.estado = 'confirmada'
       ORDER BY f.creado_en
       OFFSET $2 LIMIT 1`,
      [tareaId, indice],
    );
    const imagen = fila.rows[0];
    if (!imagen) return 'Ese número no está en las imágenes.';
    const pelado = codigo.replace(/[\s\-_]+/g, '').toUpperCase();
    const clase = claseDe(imagen.tipo_ocr ?? '', pelado);
    const firme = asumirZgru(pelado, clase).codigo ?? pelado;
    const tipo = clase === 'contenedor' ? 'ZGRU' : clase === 'serie' ? 'SERIAL' : 'OTRO';
    await this.pg.query(`UPDATE asignacion_archivo SET codigo_firme = $2, tipo_ocr = $3 WHERE id = $1`, [imagen.id, firme, tipo]);
    if (imagen.codigo_ocr) {
      await this.pg.query(
        `INSERT INTO lectura_aprendida (codigo_ocr, codigo_firme, tipo, veces)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (codigo_ocr) DO UPDATE
           SET codigo_firme = EXCLUDED.codigo_firme, tipo = EXCLUDED.tipo, veces = lectura_aprendida.veces + 1, actualizado_en = now()`,
        [imagen.codigo_ocr, firme, tipo],
      );
    }
    if (clase === 'contenedor') await this.pg.query(`UPDATE tarea SET codigo_equipo = $2 WHERE id = $1`, [tareaId, firme]);
    if (clase === 'serie') await this.pg.query(`UPDATE tarea SET maquina_equipo = $2 WHERE id = $1`, [tareaId, firme]);
    const aprendio = imagen.imagen_externa ? await confirmarImagen(imagen.imagen_externa, firme, tipo) : false;
    const nombre = clase === 'contenedor' ? 'contenedor' : clase === 'serie' ? 'serie de máquina' : 'código';
    const anterior = imagen.codigo_ocr || 'sin lectura';
    await this.movimiento(tareaId, null, 'correccion', actor, `Corrigió la imagen ${indice + 1}: el sistema leyó ${anterior} y el técnico dejó ${nombre} ${firme}.`);
    return aprendio
      ? `Quedó ${nombre} ${firme}. ProcesoImagen guardó la corrección para afinar la siguiente lectura.`
      : `Quedó ${nombre} ${firme}. La corrección quedó en la ficha.`;
  }

  async leerImagen(archivoId: string): Promise<{ nombre: string; mime: string; contenido: Buffer } | null> {
    const fila = await this.pg.query<{ clave: string; mime: string; nombre: string }>(
      `SELECT clave, mime, nombre FROM asignacion_archivo WHERE id = $1`,
      [archivoId],
    );
    const archivo = fila.rows[0];
    if (!archivo) return null;
    const contenido = await new AlmacenCorreo(this.conexiones).leer(archivo.clave);
    return { nombre: archivo.nombre, mime: archivo.mime, contenido };
  }

  async reconsultar(tareaId: string, pregunta: string): Promise<void> {
    const actualizado = await this.pg.query(
      `UPDATE turno_despacho
       SET estado = 'reconsulta', pregunta = $2, telefono_dueno = NULL, abierto_en = now(), ultimo_mensaje_en = NULL
       WHERE id = (SELECT id FROM turno_despacho WHERE tarea_id = $1 ORDER BY abierto_en DESC LIMIT 1)`,
      [tareaId, pregunta],
    );
    if ((actualizado.rowCount ?? 0) === 0) {
      await this.pg.query(
        `INSERT INTO turno_despacho (id, tarea_id, estado, pregunta, abierto_en) VALUES ($1, $2, 'reconsulta', $3, now())`,
        [randomUUID(), tareaId, pregunta],
      );
    }
  }

  private async asegurar(tareaId: string, autor: { correo: string; nombre: string }): Promise<string> {
    const vigente = await this.pg.query<{ id: string }>(
      `SELECT id FROM asignacion_despacho
       WHERE tarea_id = $1 AND estado IN ('recogiendo', 'por_validar')
       ORDER BY creado_en DESC LIMIT 1`,
      [tareaId],
    );
    if (vigente.rows[0]) return vigente.rows[0].id;
    const id = randomUUID();
    await this.pg.query(
      `INSERT INTO asignacion_despacho (id, tarea_id, autor_correo, autor_nombre, texto, estado)
       VALUES ($1, $2, $3, $4, '', 'recogiendo')`,
      [id, tareaId, autor.correo, autor.nombre],
    );
    return id;
  }

  private async textoConfirmado(tareaId: string): Promise<string> {
    const fila = await this.pg.query<{ texto: string }>(
      `SELECT texto FROM asignacion_despacho
       WHERE tarea_id = $1 AND estado = 'confirmada'
       ORDER BY confirmada_en DESC NULLS LAST, creado_en DESC LIMIT 1`,
      [tareaId],
    );
    return fila.rows[0]?.texto?.trim() ?? '';
  }

  private async leerCodigos(
    imagenes: Array<{ id: string; clave: string; mime: string; nombre: string; codigo_ocr: string | null; codigo_firme: string | null; tipo_ocr: string | null }>,
  ): Promise<string[]> {
    const almacen = new AlmacenCorreo(this.conexiones);
    const lineas: string[] = [];
    for (const [indice, imagen] of imagenes.entries()) {
      let crudo = imagen.codigo_ocr;
      let tipo = imagen.tipo_ocr ?? '';
      if (!crudo && !imagen.codigo_firme) {
        try {
          const bytes = await almacen.leer(imagen.clave);
          const propuesta = await proponerImagen({ nombre: imagen.nombre, mime: imagen.mime, contenido: bytes });
          if (propuesta) {
            crudo = propuesta.codigo;
            tipo = propuesta.tipo;
            await this.pg.query(
              `UPDATE asignacion_archivo SET codigo_ocr = $2, tipo_ocr = $3, confianza = $4, imagen_externa = $5 WHERE id = $1`,
              [imagen.id, propuesta.codigo, propuesta.tipo, propuesta.confianza, propuesta.imagenId],
            );
          }
        } catch {
          crudo = null;
        }
      }
      const aprendido = crudo
        ? await this.pg.query<{ codigo_firme: string }>(`SELECT codigo_firme FROM lectura_aprendida WHERE upper(codigo_ocr) = upper($1)`, [crudo])
        : { rows: [] as Array<{ codigo_firme: string }> };
      const previo = imagen.codigo_firme || aprendido.rows[0]?.codigo_firme || null;
      lineas.push(presentarLectura(indice + 1, tipo, crudo, previo));
    }
    return lineas;
  }

  private async avisar(asignacionId: string): Promise<void> {
    const tomado = await this.pg.query(
      `UPDATE asignacion_despacho SET procesando_en = now()
       WHERE id = $1 AND (procesando_en IS NULL OR procesando_en < now() - interval '3 minutes')
       RETURNING id`,
      [asignacionId],
    );
    if ((tomado.rowCount ?? 0) === 0) return;
    try {
      await this.publicarAviso(asignacionId);
    } catch (error) {
      await this.pg.query(`UPDATE asignacion_despacho SET procesando_en = NULL WHERE id = $1`, [asignacionId]);
      throw error;
    }
  }

  private async publicarAviso(asignacionId: string): Promise<void> {
    const fila = await this.pg.query<{ cot: string; cliente: string | null; lugar: string | null; autor_nombre: string; texto: string; tarea_id: string }>(
      `SELECT t.cot, t.cliente, t.lugar, a.autor_nombre, a.texto, a.tarea_id
       FROM asignacion_despacho a
       JOIN tarea t ON t.id = a.tarea_id
       WHERE a.id = $1`,
      [asignacionId],
    );
    const asignacion = fila.rows[0];
    if (!asignacion) {
      await this.pg.query(`UPDATE asignacion_despacho SET procesando_en = NULL WHERE id = $1`, [asignacionId]);
      return;
    }
    const imagenes = await this.pg.query<{ id: string; clave: string; mime: string; nombre: string; codigo_ocr: string | null; codigo_firme: string | null; tipo_ocr: string | null }>(
      `SELECT id, clave, mime, nombre, codigo_ocr, codigo_firme, tipo_ocr FROM asignacion_archivo WHERE asignacion_id = $1 ORDER BY creado_en`,
      [asignacionId],
    );
    const lecturas = await this.leerCodigos(imagenes.rows);
    await this.movimiento(
      asignacion.tarea_id,
      asignacionId,
      'lectura',
      'sistema',
      lecturas.length > 0 ? lecturas.join('\n') : 'Procesó las imágenes y no encontró un código legible.',
    );
    const destinos = await this.pg.query<{ telefono: string }>(
      `SELECT DISTINCT telefono FROM usuario
       WHERE activo AND rol IN ('tecnico', 'administrador') AND telefono IS NOT NULL AND telefono <> ''
       ORDER BY telefono`,
    );
    if (destinos.rows.length === 0) {
      await this.pg.query(`UPDATE asignacion_despacho SET procesando_en = NULL WHERE id = $1`, [asignacionId]);
      return;
    }
    const cuerpo = textoAvisoAsignacion(
      asignacion.cot,
      asignacion.cliente,
      asignacion.autor_nombre,
      asignacion.texto,
      imagenes.rows.length,
      lecturas,
      'pendiente',
      asignacion.lugar,
    );
    const momentos = momentosDeEnvio(destinos.rows.length, new Date(), PAUSA_MS);
    let avisados = 0;
    for (const [indice, destino] of destinos.rows.entries()) {
      const ya = await this.pg.query(
        `SELECT 1 FROM aviso WHERE tipo = 'asignacion_despacho' AND referencia_id = $1 AND destino = $2`,
        [asignacionId, destino.telefono],
      );
      if (ya.rows[0]) continue;
      const avisoId = randomUUID();
      await this.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes, referencia_id)
         VALUES ($1, 'asignacion_despacho', $2, $3, $4, 'pendiente', $5, $6)`,
        [avisoId, asignacion.tarea_id, destino.telefono, cuerpo, momentos[indice].toISOString(), asignacionId],
      );
      for (const [orden, imagen] of imagenes.rows.entries()) {
        await this.pg.query(
          `INSERT INTO aviso_adjunto (id, aviso_id, clave, mime, nombre, orden) VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), avisoId, imagen.clave, imagen.mime, imagen.nombre, orden],
        );
      }
      await this.pg.query(
        `INSERT INTO charla (telefono, paso, tarea_id, lista, pendiente, actualizado_en)
         VALUES ($1, 'corroborar_lectura', $2, '[]'::jsonb, '{"origen":"aviso"}'::jsonb, now())
         ON CONFLICT (telefono) DO UPDATE
           SET paso = 'corroborar_lectura', tarea_id = EXCLUDED.tarea_id, lista = '[]'::jsonb,
               pendiente = EXCLUDED.pendiente, actualizado_en = now()`,
        [destino.telefono, asignacion.tarea_id],
      );
      avisados += 1;
    }
    if (avisados > 0) {
      await this.movimiento(
        asignacion.tarea_id,
        asignacionId,
        'aviso',
        'sistema',
        `Avisó una sola vez, con las ${imagenes.rows.length} imágenes juntas, el texto y las lecturas. Queda a la espera del ok del técnico.`,
      );
    }
  }

  private async movimiento(tareaId: string, asignacionId: string | null, tipo: string, actor: string, detalle: string): Promise<void> {
    await this.pg.query(
      `INSERT INTO movimiento_despacho (id, tarea_id, asignacion_id, tipo, actor, detalle) VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), tareaId, asignacionId, tipo, actor.slice(0, 120), detalle.slice(0, 2000)],
    );
  }

  private async avisarFaltantes(): Promise<void> {
    const filas = await this.pg.query<{ id: string }>(
      `SELECT a.id
       FROM asignacion_despacho a
       WHERE a.estado = 'confirmada'
         AND NOT EXISTS (SELECT 1 FROM aviso v WHERE v.tipo = 'asignacion_despacho' AND v.referencia_id = a.id)`,
    );
    for (const fila of filas.rows) await this.avisar(fila.id);
  }

  private async siguiente(): Promise<TareaTurno | null> {
    const fila = await this.pg.query<TareaTurno>(
      `SELECT t.id, t.cot, t.cliente, t.lugar,
              to_char(t.cita_fecha, 'YYYY-MM-DD') AS cita_fecha, t.cita_hora, t.cantidad
       FROM tarea t
       LEFT JOIN turno_despacho u ON u.tarea_id = t.id AND u.estado IN ('en_cola', 'reconsulta')
       ${joinUrgente('t')}
       WHERE t.cot <> '10000000000'
         AND t.estado <> 'resuelta'
         AND t.campana = false
         AND (
           u.estado = 'reconsulta'
           OR NOT EXISTS (
             SELECT 1 FROM tienda x WHERE x.tarea_hija_id = t.id AND x.estado IN ('atendida', 'resuelta')
           )
         )
         AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = t.id::text)
         AND (
           NOT EXISTS (
             SELECT 1 FROM asignacion_despacho a
             WHERE a.tarea_id = t.id AND a.estado IN ('confirmada', 'aceptada')
           )
           OR u.estado = 'reconsulta'
         )
         AND (
           NOT EXISTS (SELECT 1 FROM turno_despacho x WHERE x.tarea_id = t.id)
           OR u.id IS NOT NULL
         )
       ORDER BY ${ordenUrgente('t')}, CASE WHEN u.estado = 'reconsulta' THEN 0 ELSE 1 END
       LIMIT 1`,
    );
    return fila.rows[0] ?? null;
  }

  private async coordinadores(): Promise<Array<{ telefono: string }>> {
    const filas = await this.pg.query<{ telefono: string }>(
      `SELECT telefono FROM usuario
       WHERE activo AND rol = 'despacho' AND consulta_despacho
         AND telefono IS NOT NULL AND telefono <> ''
       ORDER BY telefono`,
    );
    return filas.rows;
  }

  private async datos(tareaId: string): Promise<TareaTurno | null> {
    const fila = await this.pg.query<TareaTurno>(
      `SELECT id, cot, cliente, lugar, to_char(cita_fecha, 'YYYY-MM-DD') AS cita_fecha, cita_hora, cantidad
       FROM tarea WHERE id = $1`,
      [tareaId],
    );
    return fila.rows[0] ?? null;
  }

  private async feriados(): Promise<Set<string>> {
    const resultado = await this.pg.query<{ fecha: string }>(`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM feriado`);
    return new Set(resultado.rows.map((fila) => fila.fecha));
  }

  private aviso(tarea: TareaTurno): DatosAviso {
    return {
      cot: tarea.cot,
      cliente: tarea.cliente,
      lugar: tarea.lugar,
      cita: citaVisible(tarea.cita_fecha, tarea.cita_hora),
      cantidad: tarea.cantidad,
    };
  }
}
