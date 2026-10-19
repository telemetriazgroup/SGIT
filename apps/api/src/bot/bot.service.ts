import { access, readFile } from 'fs/promises';
import path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenCorreo } from '../buzon/almacen';
import { vincularHijas } from '../tareas/hijas';
import { corregirEquipo, crearHilos, guardarChip, hiloListo, lineaHilo, listarHilos, marcarInstalacion, textoEquipo, validarDespacho } from '../tareas/hilos';
import { chipParaGuardar, leerFotoChip, leerFotoEquipo, registrarChip, registrarEquipo } from '../tareas/regularizar';
import { joinUrgente, ordenFecha, ordenUrgente } from '../tareas/prioridad';
import { anotarConexion } from '../conexion/bitacora';
import type { Conexiones } from '../conexiones';
import {
  NO_HABILITADO,
  PAUSA_MS,
  citaVisible,
  cotVisible,
  digitos,
  imagenRecibida,
  imagenesJuntas,
  menuAsunto,
  menuCot,
  menuDecision,
  menuGeneral,
  momentosDeEnvio,
  ackDespacho,
  negrita,
  notaGuardada,
  opcionesCot,
  pideImagen,
  pideTexto,
  preguntaImagen,
  preguntaSiEsTodo,
  salioDeCot,
  textoReprogramacion,
  silencioDespacho,
  sinValidarAviso,
  avisoSilencioMenu,
  textoAvisoAsignacion,
  textoEcoAsignacion,
  textoTareaNueva,
  PREGUNTAS_DESPACHO,
} from './avisos';
import { cierreFabricacion, fragmentosDeTexto, identificarChips, imeisDeTexto, textoChip } from './lectura-chip';
import { textoDeImagen } from './proceso-imagen';
import { TurnoDespacho } from './turno-despacho';

type Autor = { correo: string; nombre: string };
type ArchivoNota = { nombre: string; mime: string; contenido: Buffer };
type Anotador = {
  anotar(id: string, autor: Autor, tipo: string, texto: string, archivo: ArchivoNota | null, canal?: 'web' | 'whatsapp', extras?: ArchivoNota[]): Promise<void>;
  anotarEnHilo(mensajeId: string, autor: Autor, tipo: string, texto: string, archivo: ArchivoNota | null, canal?: 'web' | 'whatsapp', extras?: ArchivoNota[]): Promise<void>;
  cerrarTarea(id: string, autor: Autor, texto: string, archivo: ArchivoNota | null, canal?: 'web' | 'whatsapp'): Promise<void>;
  cerrarHilo(mensajeId: string, autor: Autor, texto: string, archivo: ArchivoNota | null, canal?: 'web' | 'whatsapp'): Promise<void>;
};

type FilaTarea = {
  id: string;
  cot: string;
  cliente: string | null;
  lugar: string | null;
  cita_fecha: string | null;
  cita_hora: string | null;
  cantidad: number | null;
};

type Paso =
  | 'menu'
  | 'recientes'
  | 'busca'
  | 'confirma'
  | 'resultados'
  | 'cot'
  | 'pregunta_imagen'
  | 'espera_imagen'
  | 'nota'
  | 'pregunta_resumen'
  | 'resumen'
  | 'detalle'
  | 'internos'
  | 'decisiones'
  | 'asunto'
  | 'decision'
  | 'despacho_oferta'
  | 'despacho_detalle'
  | 'despacho_menu'
  | 'despacho_recogiendo'
  | 'despacho_validar'
  | 'respuesta_despacho'
  | 'consulta_despacho'
  | 'corroborar_lectura'
  | 'chip_menu'
  | 'chip_foto'
  | 'hilos'
  | 'hilo';
type ImagenPendiente = { nombre: string; mime: string; contenido: string };
type TipoNota = 'seguimiento' | 'incidente' | 'cierre';
type Pendiente = {
  tipo?: TipoNota;
  imagen?: ImagenPendiente | null;
  texto?: string;
  pregunta_lote?: boolean;
  pregunta_en?: string;
  corrigiendo?: boolean;
  indice?: number;
  corte?: 'aviso' | 'menu';
  pagina?: number;
  origen?: 'tarea' | 'interno' | 'decision';
  mensajeId?: string;
  espera_menu?: boolean;
  equipo?: number;
  hiloId?: string;
  corrige?: 'imei' | 'contenedor' | 'maquina';
};
type Charla = { paso: Paso; tarea_id: string | null; lista: string[]; pendiente: Pendiente | null };
type ArchivoSalida = { nombre: string; mime: string; contenido: string };
type RespuestaBot = { habilitado: boolean; respuesta: string; archivo: ArchivoSalida | null };
type TareaBreve = {
  id: string;
  cot: string;
  cliente: string | null;
  lugar?: string | null;
  campana?: boolean;
  despacho_fecha?: string | null;
  despacho_hora?: string | null;
};
type NotaBreve = {
  id: string;
  tipo: 'seguimiento' | 'incidente';
  texto: string;
  autor_nombre: string;
  archivo_nombre: string | null;
  archivo_clave: string | null;
  archivo_mime: string | null;
  creado_en: Date;
};
type FichaCorta = {
  cot: string;
  cliente: string | null;
  ticket: string | null;
  descripcion: string | null;
  lugar: string | null;
  cita_fecha: string | null;
  cita_hora: string | null;
  cita_direccion: string | null;
  cita_mapa: string | null;
  cita_parcial_fecha: string | null;
  cita_parcial_hora: string | null;
  temperatura: string | null;
  producto: string | null;
  cantidad: number | null;
  contenedor: string | null;
  comercial_nombre: string | null;
  comercial_cargo: string | null;
  comercial_correo: string | null;
  comercial_telefono: string | null;
};

const PASOS: Paso[] = [
  'menu',
  'recientes',
  'busca',
  'confirma',
  'resultados',
  'cot',
  'pregunta_imagen',
  'espera_imagen',
  'nota',
  'pregunta_resumen',
  'resumen',
  'detalle',
  'internos',
  'decisiones',
  'asunto',
  'decision',
  'despacho_oferta',
  'despacho_detalle',
  'despacho_menu',
  'despacho_recogiendo',
  'despacho_validar',
  'respuesta_despacho',
  'consulta_despacho',
  'corroborar_lectura',
  'chip_menu',
  'chip_foto',
  'hilos',
  'hilo',
];

const LEASE_MS = 30_000;

function rutaQr(): string {
  return path.resolve(__dirname, '../../../../sessions/qr.png');
}

function rutaReporteImagen(): string {
  return path.resolve(__dirname, '../../../../sessions/reporte-imagen.json');
}

export class BotService {
  constructor(private readonly conexiones: Conexiones) {}

  async estado(): Promise<{
    estado: string;
    actualizadoEn: string | null;
    ultimoEnvioEn: string | null;
    qr: boolean;
    enLinea: boolean;
    proceso: boolean;
    fallo: string | null;
    detalle: string;
  }> {
    const fila = await this.conexiones.pg.query<{ estado: string; actualizado_en: Date | null; ultimo_envio_en: Date | null; fallo_envio: string | null }>(
      `SELECT estado, actualizado_en, ultimo_envio_en, fallo_envio FROM sesion_bot WHERE id = 1`,
    );
    const lider = await this.conexiones.pg.query<{ vivo: boolean }>(`SELECT vence_en > now() AS vivo FROM lider_bot WHERE id = 1`);
    const sesion = fila.rows[0];
    const estado = sesion?.estado ?? 'desconectado';
    const proceso = Boolean(lider.rows[0]?.vivo);
    const fallo = sesion?.fallo_envio?.trim() || null;
    const enLinea = estado === 'listo' && proceso && !fallo;
    return {
      estado,
      actualizadoEn: sesion?.actualizado_en ? new Date(sesion.actualizado_en).toISOString() : null,
      ultimoEnvioEn: sesion?.ultimo_envio_en ? new Date(sesion.ultimo_envio_en).toISOString() : null,
      qr: await this.hayQr(),
      enLinea,
      proceso,
      fallo,
      detalle: textoWhatsapp(estado, proceso, enLinea, fallo),
    };
  }

  async marcarReinicio(): Promise<{ estado: string; enLinea: boolean; proceso: boolean; detalle: string }> {
    await this.conexiones.pg.query(`UPDATE sesion_bot SET reiniciar = true WHERE id = 1`);
    await anotarConexion(this.conexiones.pg, 'whatsapp', 'info', 'Reinicio pedido desde la web. Se vuelve a abrir la misma sesión.');
    const actual = await this.estado();
    return {
      estado: actual.estado,
      enLinea: actual.enLinea,
      proceso: actual.proceso,
      detalle: actual.proceso
        ? 'Reinicio pedido. WhatsApp vuelve a abrir la misma sesión.'
        : 'El reinicio quedó pedido, pero el proceso del bot no está en marcha.',
    };
  }

  async marcarOlvido(): Promise<{ estado: string; enLinea: boolean; proceso: boolean; detalle: string }> {
    await this.conexiones.pg.query(`UPDATE sesion_bot SET olvidar = true WHERE id = 1`);
    await anotarConexion(
      this.conexiones.pg,
      'whatsapp',
      'info',
      'Cierre de sesión pedido desde la web. Se borra la sesión de este equipo y WhatsApp pedirá otro código.',
    );
    const actual = await this.estado();
    return {
      estado: actual.estado,
      enLinea: false,
      proceso: actual.proceso,
      detalle: actual.proceso
        ? 'Sesión cerrada en este equipo. En un momento aparece el código para escanear.'
        : 'El cierre quedó pedido, pero el proceso del bot no está en marcha.',
    };
  }

  async tomarPedido(): Promise<{ reiniciar: boolean; olvidar: boolean }> {
    const resultado = await this.conexiones.pg.query<{ reiniciar: boolean; olvidar: boolean }>(
      `UPDATE sesion_bot AS s
       SET reiniciar = false, olvidar = false
       FROM (SELECT reiniciar, olvidar FROM sesion_bot WHERE id = 1) AS v
       WHERE s.id = 1 AND (v.reiniciar OR v.olvidar)
       RETURNING v.reiniciar, v.olvidar`,
    );
    const fila = resultado.rows[0];
    return { reiniciar: Boolean(fila?.reiniciar), olvidar: Boolean(fila?.olvidar) };
  }

  async listarBitacora(): Promise<Array<{ id: string; servicio: string; nivel: string; texto: string; creadoEn: string }>> {
    const filas = await this.conexiones.pg.query<{ id: string; servicio: string; nivel: string; texto: string; creado_en: Date }>(
      `SELECT id, servicio, nivel, texto, creado_en FROM bitacora_conexion ORDER BY creado_en DESC LIMIT 40`,
    );
    return filas.rows.map((fila) => ({
      id: fila.id,
      servicio: fila.servicio,
      nivel: fila.nivel,
      texto: fila.texto,
      creadoEn: new Date(fila.creado_en).toISOString(),
    }));
  }

  async anotarBitacora(servicio: string, nivel: string, texto: string): Promise<void> {
    if (servicio !== 'whatsapp') throw new BadRequestException('El bot solo anota la bitácora de WhatsApp.');
    if (nivel !== 'info' && nivel !== 'fallo') throw new BadRequestException('El nivel es info o fallo.');
    await anotarConexion(this.conexiones.pg, 'whatsapp', nivel, texto);
  }

  async leerQr(): Promise<Buffer> {
    try {
      return await readFile(rutaQr());
    } catch {
      throw new NotFoundException('Todavía no hay QR. El bot no está esperando el escaneo.');
    }
  }

  async publicar(estado: string, ahora = new Date()): Promise<void> {
    if (estado !== 'esperando_qr' && estado !== 'listo' && estado !== 'desconectado') {
      throw new BadRequestException('El estado es esperando QR, listo o desconectado.');
    }
    await this.conexiones.pg.query(
      `UPDATE sesion_bot
       SET estado = $1, actualizado_en = $2, fallo_envio = CASE WHEN $1 = 'listo' THEN NULL ELSE fallo_envio END
       WHERE id = 1`,
      [estado, ahora.toISOString()],
    );
  }

  async miembros(): Promise<Array<{ correo: string; nombre: string; rol: string; telefono: string | null; activo: boolean }>> {
    const filas = await this.conexiones.pg.query<{ correo: string; nombre: string; rol: string; telefono: string | null; activo: boolean }>(
      `SELECT correo, nombre, rol, telefono, activo FROM usuario ORDER BY nombre`,
    );
    return filas.rows;
  }

  async probar(telefono: string, texto: string, ahora = new Date()): Promise<void> {
    const destino = digitos(telefono);
    if (destino.length < 8 || destino.length > 15) throw new BadRequestException('El teléfono tiene entre 8 y 15 dígitos.');
    const limpio = texto.trim();
    if (!limpio) throw new BadRequestException('Escribe el mensaje.');
    const previo = await this.conexiones.pg.query<{ no_enviar_antes: Date }>(
      `SELECT no_enviar_antes FROM aviso WHERE estado = 'pendiente' ORDER BY no_enviar_antes DESC LIMIT 1`,
    );
    const ultimo = previo.rows[0]?.no_enviar_antes ? new Date(previo.rows[0].no_enviar_antes) : null;
    const cuando = ultimo && ultimo >= ahora ? new Date(ultimo.getTime() + PAUSA_MS) : ahora;
    await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
       VALUES ($1, 'prueba', NULL, $2, $3, 'pendiente', $4)`,
      [randomUUID(), destino, limpio.slice(0, 1000), cuando.toISOString()],
    );
  }

  async anotarFallo(texto: string): Promise<void> {
    const limpio = texto.trim().slice(0, 180);
    if (!limpio) return;
    await this.conexiones.pg.query(`UPDATE sesion_bot SET fallo_envio = $1, actualizado_en = now() WHERE id = 1`, [limpio]);
  }

  async comprobarLinea(ahora = new Date()): Promise<{ enLinea: boolean; enviado: boolean; detalle: string }> {
    const id = await this.encolarComprobacion(ahora);
    const limite = Date.now() + 70_000;
    while (Date.now() < limite) {
      const aviso = await this.conexiones.pg.query<{ estado: string }>(`SELECT estado FROM aviso WHERE id = $1`, [id]);
      if (aviso.rows[0]?.estado === 'enviado') {
        return { enLinea: true, enviado: true, detalle: `El mensaje de prueba salió a ${DESTINO_LINEA}.` };
      }
      await esperar(2000);
    }
    const actual = await this.estado();
    if (actual.proceso) await this.marcarReinicio();
    return {
      enLinea: false,
      enviado: false,
      detalle: actual.proceso
        ? 'El mensaje no salió. Pedí reiniciar WhatsApp con la misma sesión.'
        : 'El mensaje no salió y el proceso del bot no está en marcha.',
    };
  }

  private async encolarComprobacion(ahora: Date): Promise<string> {
    const previa = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM aviso WHERE tipo = 'prueba' AND destino = $1 AND estado = 'pendiente' ORDER BY creado_en DESC LIMIT 1`,
      [DESTINO_LINEA],
    );
    if (previa.rows[0]) return previa.rows[0].id;
    const id = randomUUID();
    const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ahora);
    await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
       VALUES ($1, 'prueba', NULL, $2, $3, 'pendiente', $4)`,
      [id, DESTINO_LINEA, `Prueba de SGIT. Comprobación de línea ${hora}.`, ahora.toISOString()],
    );
    return id;
  }

  async guardarTelefono(correo: string, telefono: string): Promise<void> {
    const limpio = digitos(telefono);
    if (limpio && (limpio.length < 8 || limpio.length > 15)) throw new BadRequestException('El teléfono tiene entre 8 y 15 dígitos.');
    const resultado = await this.conexiones.pg.query(`UPDATE usuario SET telefono = $2 WHERE correo = $1`, [correo.trim().toLowerCase(), limpio || null]);
    if (resultado.rowCount === 0) throw new NotFoundException('No está ese miembro.');
  }

  async alNacer(tareaId: string, ahora = new Date()): Promise<number> {
    const visible = await this.conexiones.pg.query(`SELECT 1 FROM habilitado WHERE clase = 'tarea' AND clave = $1`, [tareaId]);
    if (!visible.rows[0]) return 0;
    const tarea = await this.datos(tareaId);
    if (!tarea) return 0;
    const destinos = await this.activos();
    const momentos = momentosDeEnvio(destinos.length, ahora);
    let alta = 0;
    for (const [indice, destino] of destinos.entries()) {
      const resultado = await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'tarea_nueva', $2, $3, $4, 'pendiente', $5)
         ON CONFLICT (tarea_id, destino) WHERE tipo = 'tarea_nueva' DO NOTHING`,
        [randomUUID(), tareaId, destino.telefono, textoTareaNueva(this.avisoDe(tarea)), momentos[indice].toISOString()],
      );
      alta += resultado.rowCount ?? 0;
    }
    return alta;
  }

  async alReprogramar(tareaId: string, mensajeId: string, ahora = new Date()): Promise<number> {
    const tarea = await this.datos(tareaId);
    if (!tarea) return 0;
    const responsable = await this.conexiones.pg.query<{ telefono: string }>(
      `SELECT u.telefono
       FROM tarea t
       JOIN usuario u ON u.correo = t.responsable_correo
       WHERE t.id = $1 AND u.activo AND u.telefono IS NOT NULL AND u.telefono <> ''`,
      [tareaId],
    );
    const telefono = responsable.rows[0]?.telefono;
    if (!telefono) return 0;
    const previo = await this.conexiones.pg.query<{ no_enviar_antes: Date }>(
      `SELECT no_enviar_antes FROM aviso WHERE estado = 'pendiente' ORDER BY no_enviar_antes DESC LIMIT 1`,
    );
    const ultimo = previo.rows[0]?.no_enviar_antes ? new Date(previo.rows[0].no_enviar_antes) : null;
    const cuando = ultimo && ultimo >= ahora ? new Date(ultimo.getTime() + PAUSA_MS) : ahora;
    const resultado = await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes, mensaje_id)
       VALUES ($1, 'reprogramacion', $2, $3, $4, 'pendiente', $5, $6)
       ON CONFLICT (mensaje_id, destino) WHERE tipo = 'reprogramacion' AND mensaje_id IS NOT NULL DO NOTHING`,
      [randomUUID(), tareaId, telefono, textoReprogramacion(this.avisoDe(tarea)), cuando.toISOString(), mensajeId],
    );
    return resultado.rowCount ?? 0;
  }

  async tomarAviso(ahora = new Date()): Promise<{ id: string; destino: string; cuerpo: string; imagenes: Array<{ nombre: string; mime: string; contenido: string }> } | null> {
    const sesion = await this.estado();
    if (sesion.estado !== 'listo' || sesion.fallo) return null;
    const ultimo = sesion.ultimoEnvioEn ? new Date(sesion.ultimoEnvioEn) : null;
    const cliente = await this.conexiones.pg.connect();
    let aviso: { id: string; destino: string; cuerpo: string } | null = null;
    try {
      await cliente.query('BEGIN');
      const pendiente = await cliente.query<{ id: string; destino: string; cuerpo: string; no_enviar_antes: Date }>(
        `SELECT id, destino, cuerpo, no_enviar_antes
         FROM aviso
         WHERE estado = 'pendiente'
           AND (tomado_en IS NULL OR tomado_en < now() - interval '2 minutes')
         ORDER BY no_enviar_antes, creado_en
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const fila = pendiente.rows[0];
      if (!fila) {
        await cliente.query('COMMIT');
        return null;
      }
      const porPausa = ultimo ? new Date(ultimo.getTime() + PAUSA_MS) : new Date(fila.no_enviar_antes);
      const noAntes = new Date(Math.max(new Date(fila.no_enviar_antes).getTime(), porPausa.getTime()));
      if (noAntes > ahora) {
        await cliente.query('COMMIT');
        return null;
      }
      await cliente.query(`UPDATE aviso SET tomado_en = now() WHERE id = $1`, [fila.id]);
      await cliente.query('COMMIT');
      aviso = { id: fila.id, destino: fila.destino, cuerpo: fila.cuerpo };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
    try {
      return { ...aviso, imagenes: await this.imagenesDeAviso(aviso.id) };
    } catch (error) {
      await this.soltarAviso(aviso.id);
      throw error;
    }
  }

  async soltarAviso(id: string): Promise<void> {
    await this.conexiones.pg.query(
      `UPDATE aviso SET tomado_en = NULL WHERE id = $1 AND estado = 'pendiente'`,
      [id],
    );
  }

  private async imagenesDeAviso(avisoId: string): Promise<Array<{ nombre: string; mime: string; contenido: string }>> {
    const filas = await this.conexiones.pg.query<{ clave: string; mime: string; nombre: string }>(
      `SELECT clave, mime, nombre FROM aviso_adjunto WHERE aviso_id = $1 ORDER BY orden, id`,
      [avisoId],
    );
    const almacen = new AlmacenCorreo(this.conexiones);
    const imagenes: Array<{ nombre: string; mime: string; contenido: string }> = [];
    for (const fila of filas.rows) {
      if (imagenes.length >= 8) break;
      try {
        const bytes = await almacen.leer(fila.clave);
        if (bytes.length === 0 || bytes.length > 3_500_000) continue;
        imagenes.push({ nombre: fila.nombre, mime: fila.mime, contenido: bytes.toString('base64') });
      } catch {
        continue;
      }
    }
    return imagenes;
  }

  async confirmarEnvio(id: string, ahora = new Date()): Promise<void> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await cliente.query<{ destino: string; cuerpo: string }>(
        `UPDATE aviso SET estado = 'enviado', enviado_en = $2 WHERE id = $1 AND estado = 'pendiente' RETURNING destino, cuerpo`,
        [id, ahora.toISOString()],
      );
      const aviso = resultado.rows[0];
      if (!aviso) {
        await cliente.query('COMMIT');
        return;
      }
      await cliente.query(`UPDATE sesion_bot SET ultimo_envio_en = $1, fallo_envio = NULL WHERE id = 1`, [ahora.toISOString()]);
      const telefono = digitos(aviso.destino);
      const texto = aviso.cuerpo.trim().slice(0, 4000);
      if (telefono && texto) {
        await cliente.query(
          `INSERT INTO mensaje_whatsapp (id, direccion, telefono, texto, aviso_id) VALUES ($1, 'enviado', $2, $3, $4)`,
          [randomUUID(), telefono, texto, id],
        );
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async reporteImagen(): Promise<Array<Record<string, unknown>>> {
    try {
      const leido = JSON.parse(await readFile(rutaReporteImagen(), 'utf8')) as unknown;
      return Array.isArray(leido) ? (leido as Array<Record<string, unknown>>).slice(-12).reverse() : [];
    } catch {
      return [];
    }
  }

  async mensajes(): Promise<Array<{ id: string; direccion: string; telefono: string; texto: string; creadoEn: string }>> {
    const filas = await this.conexiones.pg.query<{ id: string; direccion: string; telefono: string; texto: string; creado_en: Date }>(
      `SELECT id, direccion, telefono, texto, creado_en
       FROM (
         SELECT id, direccion, telefono, texto, creado_en,
                row_number() OVER (PARTITION BY telefono ORDER BY creado_en DESC) AS n
         FROM mensaje_whatsapp
       ) recientes
       WHERE n <= 40
       ORDER BY creado_en ASC`,
    );
    return filas.rows.map((fila) => ({
      id: fila.id,
      direccion: fila.direccion,
      telefono: fila.telefono,
      texto: fila.texto,
      creadoEn: new Date(fila.creado_en).toISOString(),
    }));
  }

  async reclamar(dueno: string, ahora = new Date(), leaseMs = LEASE_MS): Promise<boolean> {
    const vence = new Date(ahora.getTime() + leaseMs);
    const resultado = await this.conexiones.pg.query(
      `INSERT INTO lider_bot (id, dueno, vence_en) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
         SET dueno = EXCLUDED.dueno, vence_en = EXCLUDED.vence_en
       WHERE lider_bot.vence_en <= $3 OR lider_bot.dueno = $1
       RETURNING dueno`,
      [dueno, vence.toISOString(), ahora.toISOString()],
    );
    return (resultado.rowCount ?? 0) > 0;
  }

  async soltar(dueno: string, ahora = new Date()): Promise<void> {
    await this.conexiones.pg.query(`UPDATE lider_bot SET vence_en = $2 WHERE id = 1 AND dueno = $1`, [dueno, ahora.toISOString()]);
  }

  async recibir(
    telefono: string,
    texto: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const numero = digitos(telefono);
    const textoRecibido = texto.trim() || (archivo ? 'Foto' : '');
    if (numero && textoRecibido) await this.guardarMensaje('recibido', numero, textoRecibido);
    const miembro = await this.conexiones.pg.query<{ correo: string; nombre: string; rol: string }>(
      `SELECT correo, nombre, rol FROM usuario WHERE telefono = $1 AND activo`,
      [numero],
    );
    const quien = miembro.rows[0];
    if (!quien) return this.dejar(numero, false, NO_HABILITADO);

    const charla = await this.charla(numero);
    const limpio = texto.trim();
    if (quien.rol === 'despacho') return this.atenderDespacho(numero, quien, limpio, charla, archivo);
    if (quien.rol === 'almacen') return this.atenderAlmacen(numero, quien, limpio, archivo);
    if (charla.pendiente?.espera_menu) return this.abrirMenu(numero);
    if (/^salir$/i.test(limpio) && !archivo) return this.cancelarTecnico(numero, charla);
    const paso = charla.paso;
    const general = paso === 'menu' || paso === 'recientes' || paso === 'busca' || paso === 'confirma' || paso === 'resultados' || paso === 'internos' || paso === 'decisiones';
    const elevado = await this.esElevado(numero);
    if (general && /^salir$/i.test(limpio)) return this.cerrarConsulta(numero);
    if (paso === 'menu' && ((elevado && limpio === '5') || (!elevado && limpio === '3'))) return this.cerrarConsulta(numero);

    if ((paso === 'nota' || paso === 'espera_imagen' || paso === 'pregunta_imagen') && charla.pendiente?.tipo) {
      if (paso === 'nota') return this.enNota(numero, charla, quien, limpio, archivo, anotador);
      if (paso === 'espera_imagen') return this.enEsperaImagen(numero, charla, quien, limpio, archivo, anotador);
      return this.enPreguntaImagen(numero, charla, quien, limpio, archivo, anotador);
    }
    if (paso === 'cot' && charla.tarea_id) return this.enCot(numero, charla.tarea_id, limpio);
    if (paso === 'hilos' && charla.tarea_id) return this.enHilos(numero, charla, limpio);
    if (paso === 'hilo' && charla.tarea_id) return this.enHilo(numero, charla, limpio, archivo);
    if (paso === 'corroborar_lectura' && charla.tarea_id) return this.enCorroborar(numero, quien, charla, limpio);
    if (paso === 'respuesta_despacho' && charla.tarea_id) return this.enRespuestaDespacho(numero, charla, limpio);
    if (paso === 'consulta_despacho' && charla.tarea_id) return this.enConsultaDespacho(numero, charla.tarea_id, limpio);
    if (paso === 'asunto' && charla.pendiente?.mensajeId) return this.enAsunto(numero, charla.pendiente.mensajeId, limpio);
    if (paso === 'decision' && charla.pendiente?.mensajeId) return this.enDecision(numero, charla.pendiente.mensajeId, limpio);
    if (paso === 'pregunta_resumen' && charla.tarea_id) return this.enPreguntaResumen(numero, charla.tarea_id, limpio);
    if (paso === 'resumen' && charla.tarea_id) return this.enResumen(numero, charla, limpio);
    if (paso === 'detalle' && charla.tarea_id) return this.enDetalle(numero, charla, limpio);
    if (paso === 'recientes' || paso === 'resultados' || paso === 'internos' || paso === 'decisiones') return this.enLista(numero, charla, limpio);
    if (paso === 'busca') return this.enBusca(numero, limpio);
    if (paso === 'confirma' && charla.tarea_id) return this.enConfirma(numero, charla.tarea_id, limpio);
    return this.enMenu(numero, limpio);
  }

  private async enMenu(telefono: string, limpio: string): Promise<RespuestaBot> {
    const elevado = await this.esElevado(telefono);
    if (limpio === '1' || /^tareas recientes$/i.test(limpio)) return this.recientes(telefono);
    if (elevado && (limpio === '2' || /^asuntos internos$/i.test(limpio))) return this.internos(telefono);
    if (elevado && (limpio === '3' || /^pendientes( de decision| de decisión)?$/i.test(limpio))) return this.decisiones(telefono);
    const busca = (elevado && limpio === '4') || (!elevado && limpio === '2') || /^buscar( cotizacion| cotización)?$/i.test(limpio);
    if (busca) {
      await this.guardarCharla(telefono, 'busca', null, [], null);
      return this.dejar(telefono, true, 'Escribe el número de COT o el nombre del cliente.');
    }
    if (!limpio || esSaludo(limpio) || /^(menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    return this.buscar(telefono, limpio);
  }

  private async enBusca(telefono: string, limpio: string): Promise<RespuestaBot> {
    if (/^(menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    if (!limpio) return this.dejar(telefono, true, 'Escribe el número de COT o el nombre del cliente.');
    return this.buscar(telefono, limpio);
  }

  private async enConfirma(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (limpio === '1' || /^entrar$/i.test(limpio)) return this.entrarEn(telefono, tareaId);
    if (limpio === '2' || /^(menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    return this.dejar(telefono, true, `Encontré ${ref.linea}\n1. Entrar\n2. Seguir en el menú general`);
  }

  private async enLista(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    if (/^(menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    const indice = Number(limpio);
    if (Number.isInteger(indice) && indice >= 1) {
      const id = charla.lista[indice - 1];
      if (!id) return this.dejar(telefono, true, 'Ese número no está en la lista.');
      if (charla.paso === 'internos') return this.menuAsuntoDe(telefono, id);
      if (charla.paso === 'decisiones') return this.menuDecisionDe(telefono, id);
      return this.entrarEn(telefono, id);
    }
    if (numeroCot(limpio) || (limpio.length >= 2 && !/^\d+$/.test(limpio))) return this.buscar(telefono, limpio);
    return this.dejar(telefono, true, 'Escribe el número para entrar. Escribe menú para quedarte en el menú general.');
  }

  private async abrirCorroboracion(telefono: string, tareaId: string, corte: 'aviso' | 'menu'): Promise<RespuestaBot> {
    const paquete = await this.turno().paquete(tareaId);
    if (!paquete) {
      await this.guardarCharla(telefono, 'cot', tareaId, [], null);
      return this.dejar(telefono, true, 'Despacho todavía no respondió esta cotización.');
    }
    await this.guardarCharla(telefono, 'corroborar_lectura', tareaId, [], { corte });
    return this.dejar(
      telefono,
      true,
      textoAvisoAsignacion(paquete.cot, paquete.cliente, paquete.autor, paquete.texto, paquete.imagenes.length, paquete.lecturas, paquete.validacion, paquete.lugar),
    );
  }

  private async enCorroborar(
    telefono: string,
    quien: { correo: string; nombre: string },
    charla: Charla,
    limpio: string,
  ): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id;
    if (!tareaId) return this.abrirMenu(telefono);
    if (/^(menu|menú|volver)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    const turno = this.turno();
    if (charla.pendiente?.indice) {
      const codigo = limpio.replace(/[\s\-_]+/g, '');
      if (codigo.length < 4) {
        return this.dejar(telefono, true, 'Escribe el código correcto. Ejemplo: ZGRU6203905');
      }
      const resultado = await turno.corregir(tareaId, charla.pendiente.indice - 1, codigo, quien.nombre);
      const seguido = await this.abrirCorroboracion(telefono, tareaId, charla.pendiente.corte === 'aviso' ? 'aviso' : 'menu');
      return { ...seguido, respuesta: `${resultado}\n${seguido.respuesta}` };
    }
    if (/^(ok|si|sí|correcto)$/i.test(limpio)) {
      const resultado = await turno.aceptarLecturas(tareaId, quien.nombre);
      const ref = await this.referencia(tareaId);
      const elevado = await this.esElevado(telefono);
      await this.guardarCharla(telefono, 'cot', tareaId, [], null);
      return this.dejar(telefono, true, [resultado, ref ? menuCot(ref.linea, elevado) : ''].filter(Boolean).join('\n'));
    }
    const indice = Number(limpio);
    if (Number.isInteger(indice) && indice >= 1) {
      const paquete = await turno.paquete(tareaId);
      const lectura = paquete?.lecturas[indice - 1];
      if (!paquete || !lectura) return this.dejar(telefono, true, 'Ese número no está en las lecturas. Escribe ok o el número que ves.');
      await this.guardarCharla(telefono, 'corroborar_lectura', tareaId, [], { corte: charla.pendiente?.corte, indice });
      return this.dejar(telefono, true, `${lectura}\nEscribe el código correcto para esa imagen.`);
    }
    return this.abrirCorroboracion(telefono, tareaId, charla.pendiente?.corte === 'aviso' ? 'aviso' : 'menu');
  }

  private async verRespuestaDespacho(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const paquete = await this.turno().paquete(tareaId);
    if (!paquete) {
      await this.guardarCharla(telefono, 'cot', tareaId, [], null);
      return this.dejar(telefono, true, 'Despacho todavía no respondió esta cotización.');
    }
    const lineas = [
      `Respuesta de despacho para ${cotVisible(paquete.cot)}${paquete.cot.includes('#') && paquete.lugar ? ` · ${paquete.lugar}` : ''}`,
      `${paquete.autor}: ${negrita(paquete.texto) || 'Sin texto.'}`,
      paquete.imagenes.length > 0 ? `Imágenes: ${paquete.imagenes.length}` : 'Sin imágenes.',
      ...paquete.lecturas,
      paquete.consulta ? `Consulta pendiente: ${paquete.consulta}` : '',
      '1. Ver imágenes',
      '2. Seguir consultando',
      '3. Volver',
      paquete.lecturas.length > 0 ? '4. Corregir un código' : '',
    ].filter(Boolean);
    await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], null);
    return this.dejar(telefono, true, lineas.join('\n'));
  }

  private async corregirLectura(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(3|volver|menu|menú|cancelar)$/i.test(limpio)) return this.verRespuestaDespacho(telefono, tareaId);
    const partes = limpio.trim().split(/\s+/);
    const indice = Number(partes[0]);
    const codigo = partes.slice(1).join('');
    if (!Number.isInteger(indice) || indice < 1 || codigo.length < 4) {
      return this.dejar(telefono, true, 'Escribe el número de la imagen y el código. Ejemplo: 2 EOGM005134');
    }
    const resultado = await this.turno().corregir(tareaId, indice - 1, codigo);
    await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], null);
    return this.dejar(telefono, true, `${resultado}\n3. Volver`);
  }

  private async enRespuestaDespacho(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id;
    if (!tareaId) return this.abrirMenu(telefono);
    if (charla.pendiente?.corrigiendo) return this.corregirLectura(telefono, tareaId, limpio);
    if (/^(3|volver|menu|menú)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (/^(4|corregir|corregir un codigo|corregir un código)$/i.test(limpio)) {
      const paquete = await this.turno().paquete(tareaId);
      if (!paquete || paquete.lecturas.length === 0) return this.dejar(telefono, true, 'Esta respuesta no tiene un código leído.\n3. Volver');
      await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], { corrigiendo: true });
      return this.dejar(telefono, true, ['Escribe el número de la imagen y el código correcto.', 'Ejemplo: 1 ZGRU5205415', ...paquete.lecturas, 'Escribe 3 para volver.'].join('\n'));
    }
    if (/^(2|seguir consultando|consultar)$/i.test(limpio)) {
      const lineas = ['¿Qué le preguntamos a despacho?', ...PREGUNTAS_DESPACHO.map((pregunta, indice) => `${indice + 1}. ${pregunta}`), 'O escribe tu propia consulta.'];
      await this.guardarCharla(telefono, 'consulta_despacho', tareaId, [], null);
      return this.dejar(telefono, true, lineas.join('\n'));
    }
    if (/^(1|ver imagenes|ver imágenes|imagenes|imágenes|siguiente|otra)$/i.test(limpio)) {
      const paquete = await this.turno().paquete(tareaId);
      if (!paquete || paquete.imagenes.length === 0) {
        await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], null);
        return this.dejar(telefono, true, 'Esta respuesta no tiene imágenes.\n2. Seguir consultando\n3. Volver');
      }
      const desde = /^(siguiente|otra)$/i.test(limpio) ? (charla.pendiente?.pagina ?? 0) : 0;
      const elegida = paquete.imagenes[desde];
      if (!elegida) return this.menuDeCot(telefono, tareaId);
      const archivo = await this.turno().leerImagen(elegida.id);
      if (!archivo) {
        await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], null);
        return this.dejar(telefono, true, 'No pude abrir esa imagen.');
      }
      const queda = desde + 1 < paquete.imagenes.length;
      await this.guardarCharla(telefono, 'respuesta_despacho', tareaId, [], { pagina: queda ? desde + 1 : desde });
      const texto = queda
        ? `Imagen ${desde + 1} de ${paquete.imagenes.length}. Escribe siguiente para la otra, 2 para seguir consultando o 3 para volver.`
        : `Imagen ${desde + 1} de ${paquete.imagenes.length}. Escribe 2 para seguir consultando o 3 para volver.`;
      return this.dejar(telefono, true, texto, {
        nombre: archivo.nombre,
        mime: archivo.mime,
        contenido: archivo.contenido.toString('base64'),
      });
    }
    return this.verRespuestaDespacho(telefono, tareaId);
  }

  private async enConsultaDespacho(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(volver|menu|menú)$/i.test(limpio)) return this.verRespuestaDespacho(telefono, tareaId);
    const numero = Number(limpio);
    const pregunta = Number.isInteger(numero) && numero >= 1 && numero <= PREGUNTAS_DESPACHO.length
      ? PREGUNTAS_DESPACHO[numero - 1]
      : limpio;
    if (!pregunta) {
      await this.guardarCharla(telefono, 'consulta_despacho', tareaId, [], null);
      return this.dejar(telefono, true, 'Escribe la consulta o elige un número.');
    }
    const aviso = await this.pedirDespachoAhora(tareaId, pregunta, 1);
    const ref = await this.referencia(tareaId);
    await this.guardarCharla(telefono, 'cot', tareaId, [], null);
    return this.dejar(telefono, true, `Quedó registrada la consulta de ${ref?.linea ?? 'esta cotización'}: ${pregunta}\n${aviso}`);
  }

  private async enCot(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(1|datos|datos de la cotizacion|datos de la cotización)$/i.test(limpio)) return this.datosDeCot(telefono, tareaId);
    if (/^(2|seguimiento|registrar seguimiento)$/i.test(limpio)) return this.empezarRegistro(telefono, tareaId, 'seguimiento');
    if (/^(3|incidente|registrar incidente)$/i.test(limpio)) return this.empezarRegistro(telefono, tareaId, 'incidente');
    if (/^(4|ultimo seguimiento|último seguimiento)$/i.test(limpio)) return this.ultimo(telefono, tareaId, 'seguimiento');
    if (/^(5|ultimo incidente|último incidente)$/i.test(limpio)) return this.ultimo(telefono, tareaId, 'incidente');
    if (/^(6|resumen|resumen de registros)$/i.test(limpio)) return this.resumen(telefono, tareaId, 0);
    if (/^(7|volver|salir|menu general|menú general)$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    if (/^(8|cerrar|cerrar por regularizacion|cerrar por regularización)$/i.test(limpio)) {
      if (!(await this.esElevado(telefono))) return this.menuDeCot(telefono, tareaId);
      return this.empezarCierre(telefono, { origen: 'tarea', tareaId });
    }
    if (/^(9|respuesta de despacho)$/i.test(limpio)) return this.abrirCorroboracion(telefono, tareaId, 'menu');
    if (/^(10|pedir chip|chip|necesito telemetria|necesito telemetría)$/i.test(limpio)) return this.pedirChip(telefono, tareaId);
    if (/^(11|telemetrias|telemetrías|hilos)$/i.test(limpio)) return this.abrirHilos(telefono, tareaId);
    return this.menuDeCot(telefono, tareaId);
  }

  private async enPreguntaResumen(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(1|si|sí|s|resumen)$/i.test(limpio)) return this.resumen(telefono, tareaId, 0);
    if (/^(2|no|n)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (/^salir$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    return this.dejar(telefono, true, [ref.linea, '¿Quieres el resumen de los últimos registros?', '1. Sí, ver el resumen', '2. No, seguir en esta cotización'].join('\n'));
  }

  private async enResumen(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id as string;
    if (limpio === '7' || /^ver mas|ver más$/i.test(limpio)) return this.resumen(telefono, tareaId, (charla.pendiente?.pagina ?? 0) + 5);
    if (limpio === '8' || /^(menu|menú|volver)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (/^salir$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    const indice = Number(limpio);
    if (Number.isInteger(indice) && indice >= 1) {
      const id = charla.lista[indice - 1];
      if (!id) return this.dejar(telefono, true, 'Ese número no está en la lista.');
      return this.detalle(telefono, charla, id);
    }
    const ref = await this.referencia(tareaId);
    return this.dejar(telefono, true, `${ref?.linea ?? 'Menú general'}\nEscribe el número para ver el detalle.\n7. Ver más registros\n8. Volver al menú de esta cotización`);
  }

  private async enDetalle(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id as string;
    if (limpio === '1' || /^otro$/i.test(limpio)) return this.resumen(telefono, tareaId, charla.pendiente?.pagina ?? 0);
    if (limpio === '2' || /^(menu|menú)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (limpio === '3' || /^(salir|menu general|menú general)$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    const ref = await this.referencia(tareaId);
    return this.dejar(telefono, true, `${ref?.linea ?? ''}\n1. Otro registro de la lista\n2. Menú de esta cotización\n3. Menú general`.trim());
  }

  private async enPreguntaImagen(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const tipo = tipoNota(charla);
    const ref = await this.lineaCharla(charla);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.volverCharla(telefono, charla);
    if (archivo) return this.recibirImagen(telefono, charla, quien, limpio, archivo, anotador, ref);
    if (/^(1|si|sí|s)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'espera_imagen', charla.tarea_id, [], { ...charla.pendiente, tipo, imagen: null, texto: '', pregunta_lote: false });
      return this.dejar(telefono, true, pideImagen(ref, tipo !== 'cierre'));
    }
    if (/^(2|no|n)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'nota', charla.tarea_id, [], { ...charla.pendiente, tipo, imagen: null });
      return this.dejar(telefono, true, pideTexto(ref, tipo === 'cierre'));
    }
    return this.dejar(telefono, true, preguntaImagen(ref, tipo));
  }

  private async enEsperaImagen(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const tipo = tipoNota(charla);
    const ref = await this.lineaCharla(charla);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    if (tipo !== 'cierre') return this.enLote(telefono, charla, quien, limpio, archivo, anotador, ref);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.volverCharla(telefono, charla);
    if (/^(no|n|2)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'nota', charla.tarea_id, [], { ...charla.pendiente, tipo, imagen: null });
      return this.dejar(telefono, true, pideTexto(ref, tipo === 'cierre'));
    }
    if (!archivo) return this.dejar(telefono, true, pideImagen(ref));
    return this.recibirImagen(telefono, charla, quien, limpio, archivo, anotador, ref);
  }

  private async enLote(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
    ref: string,
  ): Promise<RespuestaBot> {
    const tipo = tipoNota(charla);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio) && !archivo) {
      await this.vaciarLote(telefono);
      return this.volverCharla(telefono, charla);
    }
    const guardadas = await this.contarLote(telefono);
    if (/^(no|n|2)$/i.test(limpio) && !archivo && guardadas === 0) {
      await this.guardarCharla(telefono, 'nota', charla.tarea_id, [], { ...charla.pendiente, tipo, imagen: null, texto: '' });
      return this.dejar(telefono, true, pideTexto(ref, false));
    }
    if (/^(ok|listo|es todo|ya)$/i.test(limpio) && !archivo) {
      const texto = (charla.pendiente?.texto ?? '').trim();
      if (guardadas === 0 && !texto) return this.dejar(telefono, true, `${ref}\nTodavía no hay imagen ni texto.`);
      return this.cerrarNota(telefono, charla, quien, texto || 'Foto', null, anotador);
    }
    if (archivo) return this.recibirImagen(telefono, charla, quien, limpio, archivo, anotador, ref);
    if (!limpio) return this.dejar(telefono, true, pideImagen(ref, true));
    await this.guardarCharla(telefono, 'espera_imagen', charla.tarea_id, [], { ...charla.pendiente, tipo, texto: limpio, pregunta_lote: false });
    return this.dejar(telefono, true, `${ref}\n${negrita(limpio)}\nQuedó el texto. Manda otra imagen o escribe ok para guardar.`);
  }

  private async recibirImagen(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota,
    anotador: Anotador,
    linea: string,
  ): Promise<RespuestaBot> {
    const tipo = tipoNota(charla);
    const rechazo = this.rechazoImagen(archivo);
    if (rechazo) return this.dejar(telefono, true, `${linea}\n${rechazo} Envíala otra vez, o escribe no para seguir sin imagen.`);
    if (tipo !== 'cierre') {
      const total = await this.guardarLote(telefono, charla.tarea_id, tipo, archivo);
      if (typeof total === 'string') return this.dejar(telefono, true, `${linea}\n${total}`);
      const nota = limpio && !/^(1|si|sí|s|foto|ok|listo|es todo|ya)$/i.test(limpio) ? limpio : charla.pendiente?.texto ?? '';
      await this.guardarCharla(telefono, 'espera_imagen', charla.tarea_id, [], { ...charla.pendiente, tipo, texto: nota, pregunta_lote: false, imagen: null });
      return this.dejar(telefono, true, imagenesJuntas(linea, total));
    }
    const imagen = this.serializar(archivo);
    const nota = limpio && !/^(1|si|sí|s|foto)$/i.test(limpio) ? limpio : '';
    const pendiente = { ...charla.pendiente, tipo, imagen };
    if (nota) return this.cerrarNota(telefono, { ...charla, pendiente }, quien, nota, null, anotador);
    await this.guardarCharla(telefono, 'nota', charla.tarea_id, [], pendiente);
    return this.dejar(telefono, true, imagenRecibida(linea));
  }

  private async enNota(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const ref = await this.lineaCharla(charla);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.volverCharla(telefono, charla);
    if (!limpio && !archivo) return this.dejar(telefono, true, pideTexto(ref, tipoNota(charla) === 'cierre'));
    return this.cerrarNota(telefono, charla, quien, limpio, archivo, anotador);
  }

  private async cerrarNota(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const tipo = tipoNota(charla);
    const lote = tipo === 'cierre' ? [] : await this.leerLote(telefono);
    const imagen = archivo ?? lote[0] ?? this.bufferDe(charla.pendiente?.imagen ?? null);
    const extras = lote.length > 0 ? lote.slice(archivo ? 0 : 1) : [];
    const ref = await this.lineaCharla(charla);
    const rechazo = imagen ? this.rechazoImagen(imagen) : null;
    const mensajeId = charla.pendiente?.mensajeId;
    const origen = charla.pendiente?.origen ?? 'tarea';
    if (rechazo || !ref || (origen === 'tarea' && !charla.tarea_id) || (origen !== 'tarea' && !mensajeId)) {
      return this.dejar(telefono, true, rechazo ? `${ref ?? 'Menú general'}\n${rechazo}` : `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    }
    try {
      if (tipo === 'cierre' && origen === 'tarea') await anotador.cerrarTarea(charla.tarea_id as string, quien, limpio || 'Cierre por regularización', imagen, 'whatsapp');
      else if (tipo === 'cierre') await anotador.cerrarHilo(mensajeId as string, quien, limpio || 'Cierre por regularización', imagen, 'whatsapp');
      else if (origen === 'interno') await anotador.anotarEnHilo(mensajeId as string, quien, tipo, limpio || 'Foto', imagen, 'whatsapp', extras);
      else await anotador.anotar(charla.tarea_id as string, quien, tipo, limpio || 'Foto', imagen, 'whatsapp', extras);
    } catch (error) {
      if (error instanceof BadRequestException) return this.dejar(telefono, true, `${ref}\n${textoDeError(error)}`);
      throw error;
    }
    await this.vaciarLote(telefono);
    const elevado = await this.esElevado(telefono);
    if (tipo === 'cierre') {
      await this.guardarCharla(telefono, 'menu', null, [], null);
      return this.dejar(telefono, true, notaGuardada(ref, tipo, Boolean(imagen), elevado, imagen ? 1 : 0, limpio));
    }
    if (origen === 'interno' && mensajeId) {
      await this.guardarCharla(telefono, 'asunto', null, [], { mensajeId, origen: 'interno' });
      return this.dejar(telefono, true, `${ref}\n${tipo === 'incidente' ? 'El incidente quedó registrado.' : 'El seguimiento quedó registrado.'}\n${menuAsunto(ref.replace(/^Asunto: /, ''))}`);
    }
    await this.guardarCharla(telefono, 'cot', charla.tarea_id, [], null);
    const total = lote.length || (imagen ? 1 : 0);
    return this.dejar(telefono, true, notaGuardada(ref, tipo, total > 0, elevado, total, limpio));
  }

  private async guardarLote(telefono: string, tareaId: string | null, tipo: string, archivo: ArchivoNota): Promise<number | string> {
    const rechazo = this.rechazoImagen(archivo);
    if (rechazo) return rechazo;
    const id = randomUUID();
    const clave = `lote/${id}`;
    await new AlmacenCorreo(this.conexiones).guardar(clave, archivo.contenido, archivo.mime);
    await this.conexiones.pg.query(
      `INSERT INTO lote_imagen (id, telefono, tarea_id, tipo, clave, mime, nombre) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, telefono, tareaId, tipo, clave, archivo.mime, archivo.nombre.trim().slice(0, 180) || 'foto'],
    );
    return this.contarLote(telefono);
  }

  private async contarLote(telefono: string): Promise<number> {
    const fila = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM lote_imagen WHERE telefono = $1`, [telefono]);
    return Number(fila.rows[0]?.total ?? 0);
  }

  private async leerLote(telefono: string): Promise<ArchivoNota[]> {
    const filas = await this.conexiones.pg.query<{ clave: string; mime: string; nombre: string }>(
      `SELECT clave, mime, nombre FROM lote_imagen WHERE telefono = $1 ORDER BY creado_en`,
      [telefono],
    );
    const almacen = new AlmacenCorreo(this.conexiones);
    const archivos: ArchivoNota[] = [];
    for (const fila of filas.rows) {
      archivos.push({ nombre: fila.nombre, mime: fila.mime, contenido: await almacen.leer(fila.clave) });
    }
    return archivos;
  }

  private async vaciarLote(telefono: string): Promise<void> {
    const filas = await this.conexiones.pg.query<{ clave: string }>(`SELECT clave FROM lote_imagen WHERE telefono = $1`, [telefono]);
    await this.conexiones.pg.query(`DELETE FROM lote_imagen WHERE telefono = $1`, [telefono]);
    const almacen = new AlmacenCorreo(this.conexiones);
    for (const fila of filas.rows) await almacen.quitar(fila.clave).catch(() => undefined);
  }

  async preguntarLotes(ahora = new Date()): Promise<void> {
    await this.cerrarDespachoSinOk(ahora);
    await this.vencerCorroboraciones();
    await this.vencerSilencio(ahora);
    const filas = await this.conexiones.pg.query<{ telefono: string; paso: string; tarea_id: string | null; pendiente: Pendiente | null }>(
      `SELECT telefono, paso, tarea_id, pendiente
       FROM charla
       WHERE COALESCE(pendiente->>'pregunta_lote', '') <> 'true'
         AND (
           (
             paso = 'espera_imagen'
             AND COALESCE(pendiente->>'tipo', '') IN ('seguimiento', 'incidente')
             AND actualizado_en < now() - interval '10 seconds'
           )
           OR (
             paso = 'despacho_recogiendo'
             AND actualizado_en < now() - interval '15 seconds'
           )
         )`,
    );
    for (const fila of filas.rows) {
      const pendiente = fila.pendiente && typeof fila.pendiente === 'object' ? fila.pendiente : {};
      if (fila.paso === 'espera_imagen') {
        const total = await this.contarLote(fila.telefono);
        if (total === 0 && !pendiente.texto?.trim()) continue;
      } else if (fila.tarea_id) {
        const imagenes = await this.turno().contarImagenes(fila.tarea_id);
        const texto = await this.turno().textoDe(fila.tarea_id);
        if (imagenes === 0 && !texto.trim()) continue;
      } else continue;
      const ya = await this.conexiones.pg.query(
        `SELECT 1 FROM aviso WHERE tipo = 'consulta_lote' AND destino = $1 AND estado = 'pendiente'`,
        [fila.telefono],
      );
      if (ya.rows[0]) continue;
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'consulta_lote', $2, $3, $4, 'pendiente', $5)`,
        [randomUUID(), fila.tarea_id, fila.telefono, preguntaSiEsTodo(fila.paso === 'despacho_recogiendo' ? 'despacho' : 'nota'), ahora.toISOString()],
      );
      await this.conexiones.pg.query(
        `UPDATE charla SET pendiente = COALESCE(pendiente, '{}'::jsonb) || $2::jsonb WHERE telefono = $1`,
        [fila.telefono, JSON.stringify({ pregunta_lote: true, pregunta_en: ahora.toISOString() })],
      );
    }
  }

  private async cerrarDespachoSinOk(ahora: Date): Promise<void> {
    const filas = await this.conexiones.pg.query<{ telefono: string; tarea_id: string }>(
      `SELECT telefono, tarea_id
       FROM charla
       WHERE paso = 'despacho_recogiendo'
         AND tarea_id IS NOT NULL
         AND COALESCE(pendiente->>'pregunta_lote', '') = 'true'
         AND (pendiente->>'pregunta_en')::timestamptz < now() - interval '1 minute'`,
    );
    for (const fila of filas.rows) {
      const turno = this.turno();
      const id = await turno.confirmar(fila.tarea_id, 'silencio');
      const cot = (await turno.cotDe(fila.tarea_id)) ?? '';
      if (id) {
        await this.conexiones.pg.query(
          `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
           VALUES ($1, 'consulta_lote', $2, $3, $4, 'pendiente', $5)`,
          [randomUUID(), fila.tarea_id, fila.telefono, silencioDespacho(cot), ahora.toISOString()],
        );
        await turno.abrirSiguiente(ahora, fila.telefono);
      }
      await this.conexiones.pg.query(
        `UPDATE charla SET paso = 'menu', tarea_id = NULL, lista = '[]'::jsonb, pendiente = NULL, actualizado_en = now()
         WHERE telefono = $1 AND paso = 'despacho_recogiendo'`,
        [fila.telefono],
      );
    }
  }

  private async vencerCorroboraciones(): Promise<void> {
    const filas = await this.conexiones.pg.query<{ telefono: string; tarea_id: string; cot: string; lugar: string | null }>(
      `SELECT c.telefono, c.tarea_id, t.cot, t.lugar
       FROM charla c
       JOIN tarea t ON t.id = c.tarea_id
       WHERE c.paso = 'corroborar_lectura'
         AND COALESCE(c.pendiente->>'corte', '') = 'aviso'
         AND c.actualizado_en < now() - interval '5 minutes'`,
    );
    for (const fila of filas.rows) {
      const dejo = await this.turno().dejarSinValidar(fila.tarea_id);
      await this.conexiones.pg.query(
        `UPDATE charla SET paso = 'menu', tarea_id = NULL, lista = '[]'::jsonb, pendiente = NULL, actualizado_en = now()
         WHERE telefono = $1 AND paso = 'corroborar_lectura'`,
        [fila.telefono],
      );
      if (!dejo) {
        const estado = await this.conexiones.pg.query<{ validacion: string | null }>(
          `SELECT validacion FROM asignacion_despacho
           WHERE tarea_id = $1 AND estado = 'confirmada'
           ORDER BY confirmada_en DESC NULLS LAST LIMIT 1`,
          [fila.tarea_id],
        );
        if (estado.rows[0]?.validacion !== 'sin_validar') continue;
      }
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'consulta_lote', $2, $3, $4, 'pendiente', now())`,
        [randomUUID(), fila.tarea_id, fila.telefono, sinValidarAviso(fila.cot, fila.lugar)],
      );
    }
  }

  private async vencerSilencio(ahora: Date): Promise<void> {
    const filas = await this.conexiones.pg.query<{ telefono: string; paso: string; tarea_id: string | null }>(
      `SELECT telefono, paso, tarea_id
       FROM charla
       WHERE actualizado_en < now() - interval '5 minutes'
         AND COALESCE(pendiente->>'pregunta_lote', '') <> 'true'
         AND COALESCE(pendiente->>'espera_menu', '') <> 'true'
         AND paso IN (
           'despacho_oferta', 'despacho_detalle', 'despacho_menu', 'despacho_recogiendo', 'despacho_validar',
           'cot', 'recientes', 'busca', 'confirma', 'resultados', 'internos', 'decisiones',
           'nota', 'espera_imagen', 'pregunta_imagen', 'pregunta_resumen', 'resumen', 'detalle',
           'asunto', 'decision', 'respuesta_despacho', 'consulta_despacho', 'corroborar_lectura'
         )`,
    );
    for (const fila of filas.rows) {
      const cerrado = await this.conexiones.pg.query(
        `UPDATE charla
         SET paso = 'menu', tarea_id = NULL, lista = '[]'::jsonb, pendiente = '{"espera_menu":true}'::jsonb, actualizado_en = now()
         WHERE telefono = $1 AND paso = $2 AND actualizado_en < now() - interval '5 minutes'`,
        [fila.telefono, fila.paso],
      );
      if ((cerrado.rowCount ?? 0) === 0) continue;
      let guardado = false;
      if (fila.paso.startsWith('despacho_') && fila.tarea_id) {
        const otro = await this.conexiones.pg.query(
          `SELECT 1 FROM charla
           WHERE tarea_id = $1 AND telefono <> $2 AND paso LIKE 'despacho_%'
             AND actualizado_en >= now() - interval '5 minutes'`,
          [fila.tarea_id, fila.telefono],
        );
        if (!otro.rows[0]) {
          const escrito = await this.turno().textoDe(fila.tarea_id);
          const imagenes = await this.turno().contarImagenes(fila.tarea_id);
          if (escrito || imagenes > 0) guardado = Boolean(await this.turno().confirmar(fila.tarea_id, 'silencio'));
          else await this.turno().abandonar(fila.tarea_id);
        }
      }
      if (!fila.paso.startsWith('despacho_')) await this.vaciarLote(fila.telefono);
      const ya = await this.conexiones.pg.query(
        `SELECT 1 FROM aviso WHERE tipo = 'consulta_lote' AND destino = $1 AND estado = 'pendiente' AND cuerpo = $2`,
        [fila.telefono, avisoSilencioMenu(guardado)],
      );
      if (ya.rows[0]) continue;
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'consulta_lote', $2, $3, $4, 'pendiente', $5)`,
        [randomUUID(), fila.tarea_id, fila.telefono, avisoSilencioMenu(guardado), ahora.toISOString()],
      );
    }
  }

  private async cancelarTecnico(telefono: string, charla: Charla): Promise<RespuestaBot> {
    const capturando = charla.paso === 'nota'
      || charla.paso === 'espera_imagen'
      || charla.paso === 'pregunta_imagen'
      || charla.paso === 'consulta_despacho'
      || Boolean(charla.pendiente?.corrigiendo);
    const lote = await this.contarLote(telefono);
    if (lote > 0) await this.vaciarLote(telefono);
    const elevado = await this.esElevado(telefono);
    if (capturando || lote > 0) {
      return this.abrirMenu(telefono, `Cancelé lo que estabas escribiendo. No quedó guardado.\n${menuGeneral(elevado)}`);
    }
    if (charla.tarea_id && charla.paso !== 'menu') return this.salirDeCot(telefono, charla.tarea_id);
    return this.cerrarConsulta(telefono);
  }

  private rechazoImagen(archivo: ArchivoNota): string | null {
    const mime = archivo.mime.toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) return 'La foto tiene que ser una imagen.';
    if (archivo.contenido.length === 0 || archivo.contenido.length > 4 * 1024 * 1024) return 'La foto pasa de 4 MB.';
    archivo.mime = mime;
    return null;
  }

  private serializar(archivo: ArchivoNota): ImagenPendiente {
    return { nombre: archivo.nombre, mime: archivo.mime, contenido: archivo.contenido.toString('base64') };
  }

  private bufferDe(imagen: ImagenPendiente | null): ArchivoNota | null {
    if (!imagen?.contenido) return null;
    return { nombre: imagen.nombre || 'foto-whatsapp', mime: imagen.mime, contenido: Buffer.from(imagen.contenido, 'base64') };
  }

  private async abrirMenu(telefono: string, texto?: string): Promise<RespuestaBot> {
    const elevado = await this.esElevado(telefono);
    await this.guardarCharla(telefono, 'menu', null, [], null);
    return this.dejar(telefono, true, texto ?? menuGeneral(elevado));
  }

  private async cerrarConsulta(telefono: string): Promise<RespuestaBot> {
    await this.guardarCharla(telefono, 'menu', null, [], null);
    return this.dejar(telefono, true, 'Listo. La consulta quedó cerrada.\nCuando escribas, vuelves al menú general.');
  }

  private async menuDeCot(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const elevado = await this.esElevado(telefono);
    await this.guardarCharla(telefono, 'cot', tareaId, [], null);
    return this.dejar(telefono, true, menuCot(ref.linea, elevado));
  }

  private async salirDeCot(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    const elevado = await this.esElevado(telefono);
    await this.guardarCharla(telefono, 'menu', null, [], null);
    if (!ref) return this.dejar(telefono, true, menuGeneral(elevado));
    return this.dejar(telefono, true, salioDeCot(ref.linea, elevado));
  }

  private async entrarEn(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const marca = await this.conexiones.pg.query<{ estado: string; campana: boolean }>(`SELECT estado, campana FROM tarea WHERE id = $1`, [tareaId]);
    if (!marca.rows[0]) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    if (!(await this.veTodo(telefono))) {
      const visible = await this.conexiones.pg.query(`SELECT 1 FROM habilitado WHERE clase = 'tarea' AND clave = $1`, [tareaId]);
      if (!visible.rows[0]) {
        const ref = await this.referencia(tareaId);
        return this.abrirMenu(telefono, `${ref?.linea ?? 'Esa cotización'}\nTodavía no está habilitada.\n${menuGeneral(await this.esElevado(telefono))}`);
      }
    }
    if (marca.rows[0].campana) return this.menuTiendas(telefono, tareaId);
    if (marca.rows[0].estado === 'resuelta') {
      const ref = await this.referencia(tareaId);
      const elevado = await this.esElevado(telefono);
      return this.abrirMenu(telefono, `${ref?.linea ?? 'Esa cotización'}\nYa está resuelta y no vuelve a la lista.\n${menuGeneral(elevado)}`);
    }
    return this.menuDeCot(telefono, tareaId);
  }

  private async menuTiendas(telefono: string, tareaId: string): Promise<RespuestaBot> {
    await vincularHijas(this.conexiones.pg, tareaId);
    const ref = await this.referencia(tareaId);
    const tiendas = await this.conexiones.pg.query<{ id: string; cadena: string; nombre: string; entrega_fecha: string | null; entrega_hora: string }>(
      `SELECT h.id, t.cadena, t.nombre, to_char(t.entrega_fecha, 'YYYY-MM-DD') AS entrega_fecha, t.entrega_hora
       FROM tienda t
       JOIN tarea h ON h.id = t.tarea_hija_id
       WHERE t.tarea_id = $1 AND t.estado IN ('pendiente', 'en_seguimiento')
       ORDER BY ${ordenFecha('t.entrega_fecha', 't.orden NULLS LAST, t.nombre')}`,
      [tareaId],
    );
    const cabeza = ref?.linea ?? 'Campaña';
    if (tiendas.rows.length === 0) {
      return this.abrirMenu(telefono, `${cabeza}\nNo tiene tiendas pendientes. Las atendidas o realizadas ya salieron de la consulta.\n${menuGeneral(await this.esElevado(telefono))}`);
    }
    await this.guardarCharla(telefono, 'resultados', tareaId, tiendas.rows.map((tienda) => tienda.id), null);
    const lineas = tiendas.rows.map((tienda, indice) => `${indice + 1}. ${[tienda.cadena, tienda.nombre].filter(Boolean).join(' · ')} · ${textoFecha(tienda.entrega_fecha, tienda.entrega_hora)}`);
    return this.dejar(telefono, true, [cabeza, 'Tiendas pendientes:', ...lineas, 'Escribe el número de la tienda. Escribe menú para volver.'].join('\n'));
  }

  private async internos(telefono: string): Promise<RespuestaBot> {
    if (!(await this.esElevado(telefono))) return this.abrirMenu(telefono);
    const filas = await this.conexiones.pg.query<{ id: string; asunto: string }>(
      `SELECT m.id, m.asunto
       FROM mensaje_correo m
       JOIN (
         SELECT gmail_thread_id,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'archivado') AS archivado,
                bool_or(clasificacion = 'resuelto') AS resuelto
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       ) h ON h.gmail_thread_id = m.gmail_thread_id
       LEFT JOIN asunto_interno a ON a.gmail_thread_id = m.gmail_thread_id
       WHERE h.interna AND NOT h.tarea AND NOT h.archivado AND NOT h.resuelto
         AND coalesce(a.estado, 'por_atender') <> 'resuelto'
         ${await this.filtroHilo(telefono, 'interno')}
         AND m.fecha IS NOT DISTINCT FROM (
           SELECT max(c.fecha) FROM mensaje_correo c WHERE c.gmail_thread_id = m.gmail_thread_id
         )
       ORDER BY m.fecha DESC NULLS LAST, m.creado_en DESC
       LIMIT 10`,
    );
    if (filas.rows.length === 0) return this.abrirMenu(telefono, `No hay asuntos internos abiertos.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'internos', null, filas.rows.map((fila) => fila.id), null);
    const lineas = filas.rows.map((fila, indice) => `${indice + 1}. ${fila.asunto || 'sin asunto'}`);
    return this.dejar(telefono, true, ['Asuntos internos:', ...lineas, 'Escribe el número para entrar. Escribe menú para volver al menú general.'].join('\n'));
  }

  private async decisiones(telefono: string): Promise<RespuestaBot> {
    if (!(await this.esElevado(telefono))) return this.abrirMenu(telefono);
    const filas = await this.conexiones.pg.query<{ id: string; asunto: string }>(
      `SELECT m.id, m.asunto
       FROM mensaje_correo m
       JOIN (
         SELECT gmail_thread_id,
                bool_or(clasificacion = 'pendiente') AS pendiente,
                bool_or(clasificacion = 'evento_desarrollo') AS tarea,
                bool_or(clasificacion = 'interna') AS interna,
                bool_or(clasificacion = 'archivado') AS archivado,
                bool_or(clasificacion = 'resuelto') AS resuelto
         FROM mensaje_correo
         GROUP BY gmail_thread_id
       ) h ON h.gmail_thread_id = m.gmail_thread_id
       WHERE h.pendiente AND NOT h.tarea AND NOT h.interna AND NOT h.archivado AND NOT h.resuelto
         ${await this.filtroHilo(telefono, 'decision')}
         AND m.fecha IS NOT DISTINCT FROM (
           SELECT max(c.fecha) FROM mensaje_correo c WHERE c.gmail_thread_id = m.gmail_thread_id
         )
       ORDER BY m.fecha DESC NULLS LAST, m.creado_en DESC
       LIMIT 10`,
    );
    if (filas.rows.length === 0) return this.abrirMenu(telefono, `No hay decisiones pendientes.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'decisiones', null, filas.rows.map((fila) => fila.id), null);
    const lineas = filas.rows.map((fila, indice) => `${indice + 1}. ${fila.asunto || 'sin asunto'}`);
    return this.dejar(telefono, true, ['Pendientes de decisión:', ...lineas, 'Escribe el número para entrar. Escribe menú para volver al menú general.'].join('\n'));
  }

  private async menuAsuntoDe(telefono: string, mensajeId: string): Promise<RespuestaBot> {
    if (!(await this.veTodo(telefono)) && !(await this.hiloHabilitado(mensajeId, 'interno'))) {
      return this.abrirMenu(telefono, `Ese asunto todavía no está habilitado.\n${menuGeneral(true)}`);
    }
    const asunto = await this.asuntoDe(mensajeId);
    if (!asunto) return this.abrirMenu(telefono, `Ese asunto ya no está.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'asunto', null, [], { origen: 'interno', mensajeId });
    return this.dejar(telefono, true, menuAsunto(asunto));
  }

  private async menuDecisionDe(telefono: string, mensajeId: string): Promise<RespuestaBot> {
    if (!(await this.veTodo(telefono)) && !(await this.hiloHabilitado(mensajeId, 'decision'))) {
      return this.abrirMenu(telefono, `Esa decisión todavía no está habilitada.\n${menuGeneral(true)}`);
    }
    const asunto = await this.asuntoDe(mensajeId);
    if (!asunto) return this.abrirMenu(telefono, `Esa decisión ya no está.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'decision', null, [], { origen: 'decision', mensajeId });
    return this.dejar(telefono, true, menuDecision(asunto));
  }

  private async enAsunto(telefono: string, mensajeId: string, limpio: string): Promise<RespuestaBot> {
    if (!(await this.esElevado(telefono))) return this.abrirMenu(telefono);
    if (/^(1|seguimiento|registrar seguimiento)$/i.test(limpio)) return this.empezarRegistroHilo(telefono, mensajeId, 'seguimiento');
    if (/^(2|incidente|registrar incidente)$/i.test(limpio)) return this.empezarRegistroHilo(telefono, mensajeId, 'incidente');
    if (/^(3|cerrar|cerrar por regularizacion|cerrar por regularización)$/i.test(limpio)) return this.empezarCierre(telefono, { origen: 'interno', mensajeId });
    if (/^(4|volver|salir|menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    return this.menuAsuntoDe(telefono, mensajeId);
  }

  private async enDecision(telefono: string, mensajeId: string, limpio: string): Promise<RespuestaBot> {
    if (!(await this.esElevado(telefono))) return this.abrirMenu(telefono);
    if (/^(1|cerrar|cerrar por regularizacion|cerrar por regularización)$/i.test(limpio)) return this.empezarCierre(telefono, { origen: 'decision', mensajeId });
    if (/^(2|volver|salir|menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    return this.menuDecisionDe(telefono, mensajeId);
  }

  private async empezarRegistroHilo(telefono: string, mensajeId: string, tipo: 'seguimiento' | 'incidente'): Promise<RespuestaBot> {
    const asunto = await this.asuntoDe(mensajeId);
    if (!asunto) return this.abrirMenu(telefono, `Ese asunto ya no está.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'pregunta_imagen', null, [], { tipo, imagen: null, origen: 'interno', mensajeId });
    return this.dejar(telefono, true, preguntaImagen(`Asunto: ${asunto}`, tipo));
  }

  private async empezarCierre(
    telefono: string,
    destino: { origen: 'tarea'; tareaId: string } | { origen: 'interno' | 'decision'; mensajeId: string },
  ): Promise<RespuestaBot> {
    if (destino.origen === 'tarea') {
      const ref = await this.referencia(destino.tareaId);
      if (!ref) return this.abrirMenu(telefono);
      await this.guardarCharla(telefono, 'pregunta_imagen', destino.tareaId, [], { tipo: 'cierre', imagen: null, origen: 'tarea' });
      return this.dejar(telefono, true, preguntaImagen(ref.linea, 'cierre'));
    }
    const asunto = await this.asuntoDe(destino.mensajeId);
    if (!asunto) return this.abrirMenu(telefono, `Eso ya no está.\n${menuGeneral(true)}`);
    await this.guardarCharla(telefono, 'pregunta_imagen', null, [], { tipo: 'cierre', imagen: null, origen: destino.origen, mensajeId: destino.mensajeId });
    return this.dejar(telefono, true, preguntaImagen(`Asunto: ${asunto}`, 'cierre'));
  }

  private async volverCharla(telefono: string, charla: Charla): Promise<RespuestaBot> {
    if (charla.pendiente?.origen === 'interno' && charla.pendiente.mensajeId) return this.menuAsuntoDe(telefono, charla.pendiente.mensajeId);
    if (charla.pendiente?.origen === 'decision' && charla.pendiente.mensajeId) return this.menuDecisionDe(telefono, charla.pendiente.mensajeId);
    if (charla.tarea_id) return this.menuDeCot(telefono, charla.tarea_id);
    return this.abrirMenu(telefono);
  }

  private async lineaCharla(charla: Charla): Promise<string | null> {
    if (charla.pendiente?.origen === 'interno' || charla.pendiente?.origen === 'decision') {
      const asunto = charla.pendiente.mensajeId ? await this.asuntoDe(charla.pendiente.mensajeId) : null;
      return asunto ? `Asunto: ${asunto}` : null;
    }
    if (!charla.tarea_id) return null;
    return (await this.referencia(charla.tarea_id))?.linea ?? null;
  }

  private async asuntoDe(mensajeId: string): Promise<string | null> {
    const fila = await this.conexiones.pg.query<{ asunto: string }>(`SELECT asunto FROM mensaje_correo WHERE id = $1`, [mensajeId]);
    const asunto = fila.rows[0]?.asunto?.trim();
    return fila.rows[0] ? asunto || 'sin asunto' : null;
  }

  private turno(): TurnoDespacho {
    return new TurnoDespacho(this.conexiones);
  }

  private async atenderDespacho(
    telefono: string,
    quien: { correo: string; nombre: string },
    limpio: string,
    charla: Charla,
    archivo: ArchivoNota | null,
  ): Promise<RespuestaBot> {
    const turno = this.turno();
    if (charla.pendiente?.espera_menu) return this.menuTurno(telefono, null);
    if (/^salir$/i.test(limpio) && !archivo) {
      const escrito = charla.tarea_id ? await turno.textoDe(charla.tarea_id) : '';
      const imagenes = charla.tarea_id ? await turno.contarImagenes(charla.tarea_id) : 0;
      if (charla.tarea_id && (escrito || imagenes > 0)) await turno.descartar(charla.tarea_id);
      if (charla.tarea_id) await turno.abandonar(charla.tarea_id);
      const aviso = escrito || imagenes > 0
        ? 'Cancelé lo que estabas escribiendo. No quedó guardado.'
        : 'Listo. Saliste de la consulta.';
      return this.menuTurno(telefono, null, aviso);
    }
    if (/^(menu|menú)$/i.test(limpio) && !archivo) return this.menuTurno(telefono, charla.tarea_id);
    if (charla.paso === 'despacho_menu' && !archivo) return this.elegirTurno(telefono, charla, limpio);
    if (charla.paso === 'despacho_validar' && charla.tarea_id && !archivo) return this.validarTurno(telefono, charla.tarea_id, limpio);
    if (this.enAsignacion(charla.paso) && charla.tarea_id) return this.recogerTurno(telefono, quien, charla, limpio, archivo);
    const cot = numeroCot(limpio);
    if (cot) return this.abrirCotTurno(telefono, cot);
    if (!limpio || esSaludo(limpio)) return this.menuTurno(telefono, null);
    return this.abrirCotTurno(telefono, limpio);
  }

  private enAsignacion(paso: Paso): boolean {
    return paso === 'despacho_oferta' || paso === 'despacho_detalle' || paso === 'despacho_recogiendo';
  }

  private async recogerTurno(
    telefono: string,
    quien: { correo: string; nombre: string },
    charla: Charla,
    limpio: string,
    archivo: ArchivoNota | null,
  ): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id;
    if (!tareaId) return this.menuTurno(telefono, null);
    const turno = this.turno();
    const equipo = charla.pendiente?.equipo ?? 1;
    const dueno = await turno.dueno(tareaId, telefono);
    if (!dueno.propio) {
      if (!dueno.otro) return this.menuTurno(telefono, null, 'Esa consulta ya se cerró.');
      return this.dejar(telefono, true, `Esa cotización ya la está atendiendo ${dueno.otro}.`);
    }
    await turno.tocar(tareaId);
    if (archivo) {
      const rechazo = await turno.agregarImagen(tareaId, quien, archivo, equipo);
      if (rechazo) return this.dejar(telefono, true, rechazo);
      if (limpio && !/^(ok|listo|es todo|ya|1|datos)$/i.test(limpio)) await turno.agregar(tareaId, quien, limpio, equipo);
      if (!/^(ok|listo|es todo|ya)$/i.test(limpio)) {
        const imagenes = await turno.contarImagenes(tareaId);
        const escrito = await turno.textoDe(tareaId);
        await this.guardarCharla(telefono, 'despacho_recogiendo', tareaId, [], { equipo });
        return this.dejar(telefono, true, ackDespacho(imagenes, escrito));
      }
    }
    if (/^(1|datos)$/i.test(limpio)) {
      const resumen = await turno.resumen(tareaId);
      await this.guardarCharla(telefono, 'despacho_detalle', tareaId, [], { equipo });
      return this.dejar(telefono, true, resumen ?? 'Esa cotización ya no está.');
    }
    if (/^(ok|listo|es todo|ya)$/i.test(limpio)) return this.cerrarEquipo(telefono, tareaId, equipo);
    if (!limpio) return this.dejar(telefono, true, 'Escribe el contenedor y la máquina, manda una imagen, o menu para ver otras pendientes.');
    const junto = await turno.agregar(tareaId, quien, limpio, equipo);
    const imagenes = await turno.contarImagenes(tareaId);
    await this.guardarCharla(telefono, 'despacho_recogiendo', tareaId, [], { equipo });
    return this.dejar(telefono, true, ackDespacho(imagenes, junto));
  }

  private async cerrarEquipo(telefono: string, tareaId: string, equipo: number): Promise<RespuestaBot> {
    const turno = this.turno();
    const total = (await turno.cantidadDe(tareaId)) ?? 1;
    if (total > 1 && !(await turno.equipoTiene(tareaId, equipo))) {
      return this.dejar(telefono, true, `El equipo ${equipo} queda pendiente. No paso al siguiente hasta que mandes la foto de la máquina y del contenedor.`);
    }
    if (total > 1 && equipo < total) {
      await turno.cerrarEquipo(tareaId, equipo);
      const siguiente = equipo + 1;
      await this.guardarCharla(telefono, 'despacho_recogiendo', tareaId, [], { equipo: siguiente });
      return this.dejar(telefono, true, `Quedó el equipo ${equipo}.\n${textoEquipo(total, siguiente)}`);
    }
    const texto = await turno.textoDe(tareaId);
    const imagenes = await turno.contarImagenes(tareaId);
    if (!texto && imagenes === 0) return this.dejar(telefono, true, 'Todavía no anoté el contenedor, la máquina ni una imagen.');
    if (total > 1) await turno.cerrarEquipo(tareaId, equipo);
    return this.cerrarTurno(telefono, tareaId);
  }

  private async cerrarTurno(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const turno = this.turno();
    const cot = (await turno.cotDe(tareaId)) ?? '';
    await turno.confirmar(tareaId, 'ok');
    const siguiente = await turno.abrirSiguiente(new Date(), telefono);
    const cierre = `Quedó guardado para la cotización ${cotVisible(cot)}. Las imágenes ya están en la ficha. Aviso a los técnicos cuando termine de leer los códigos.`;
    if (!siguiente) {
      await this.guardarCharla(telefono, 'menu', null, [], null);
      return this.dejar(telefono, true, `${cierre}\nNo hay otra pendiente en este horario. Escribe menu cuando quieras ver las abiertas.`);
    }
    return this.dejar(telefono, true, `${cierre}\n${siguiente}`);
  }

  private async validarTurno(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    const turno = this.turno();
    const dueno = await turno.dueno(tareaId, telefono);
    if (!dueno.propio) {
      if (!dueno.otro) return this.menuTurno(telefono, null, 'Esa consulta ya se cerró.');
      return this.dejar(telefono, true, `Esa cotización ya la está atendiendo ${dueno.otro}.`);
    }
    await turno.tocar(tareaId);
    if (/^(1|datos)$/i.test(limpio)) {
      const resumen = await turno.resumen(tareaId);
      return this.dejar(telefono, true, resumen ?? 'Esa cotización ya no está.');
    }
    if (/^otro$/i.test(limpio)) {
      await turno.descartar(tareaId);
      await this.guardarCharla(telefono, 'despacho_recogiendo', tareaId, [], null);
      return this.dejar(telefono, true, 'Listo, lo dejamos de lado. Escribe de nuevo el contenedor y la máquina, o manda una imagen.');
    }
    if (/^(ok|ya)$/i.test(limpio)) return this.cerrarTurno(telefono, tareaId);
    return this.dejar(telefono, true, 'Responde ok si quedó bien, u otro para redactarlo de nuevo.');
  }

  private async menuTurno(telefono: string, tareaId: string | null, previo?: string): Promise<RespuestaBot> {
    const tareas = await this.turno().menu();
    if (tareas.length === 0) {
      await this.guardarCharla(telefono, 'menu', tareaId, [], null);
      return this.dejar(telefono, true, [previo, 'No hay cotizaciones habilitadas.'].filter(Boolean).join('\n'));
    }
    await this.guardarCharla(telefono, 'despacho_menu', tareaId, tareas.map((tarea) => tarea.id), null);
    const lineas = tareas.map((tarea, indice) => `${indice + 1}. ${this.linea(tarea, true)}`);
    return this.dejar(telefono, true, [previo, 'Cotizaciones abiertas:', ...lineas, 'Escribe el número. Escribe salir para terminar.'].filter(Boolean).join('\n'));
  }

  private async elegirTurno(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    const indice = Number(limpio);
    if (Number.isInteger(indice) && indice >= 1) {
      const id = charla.lista[indice - 1];
      if (!id) return this.dejar(telefono, true, 'Ese número no está en la lista.');
      return this.tomarTurno(telefono, charla.tarea_id, id);
    }
    const cot = numeroCot(limpio);
    if (cot) return this.abrirCotTurno(telefono, cot);
    return this.dejar(telefono, true, 'Escribe el número de la lista o menu para verla otra vez.');
  }

  private async abrirCotTurno(telefono: string, texto: string): Promise<RespuestaBot> {
    const cot = numeroCot(texto);
    const tareas = cot ? await this.porNumero(cot, false, true) : texto.trim().length >= 2 ? await this.porCliente(texto.trim(), false, true) : [];
    if (tareas.length === 0 && cot && (await this.cotExiste(cot))) return this.menuTurno(telefono, null, `COT ${cot}\nTodavía no está habilitada.`);
    if (tareas.length === 0) return this.menuTurno(telefono, null, 'No encontré esa cotización.');
    if (tareas.length > 1) {
      await this.guardarCharla(telefono, 'despacho_menu', null, tareas.map((tarea) => tarea.id), null);
      const lineas = tareas.map((tarea, indice) => `${indice + 1}. ${this.linea(tarea, true)}`);
      return this.dejar(telefono, true, ['Encontré varias:', ...lineas, 'Escribe el número.'].join('\n'));
    }
    return this.tomarTurno(telefono, null, tareas[0].id);
  }

  private async tomarTurno(telefono: string, actualId: string | null, destinoId: string): Promise<RespuestaBot> {
    const turno = this.turno();
    const listo = await turno.cambiar(actualId, destinoId);
    if (!listo) return this.dejar(telefono, true, 'Hay otra cotización en curso. Espera a que se cierre o escribe menu.');
    await turno.dueno(destinoId, telefono);
    const ref = await this.referencia(destinoId, true);
    const total = await turno.cantidadDe(destinoId);
    await this.guardarCharla(telefono, 'despacho_recogiendo', destinoId, [], { equipo: 1 });
    return this.dejar(telefono, true, [`Estás en ${ref?.linea ?? 'esa cotización'}.`, textoEquipo(total, 1), 'Escribe 1 o datos para ver la ficha.', 'Escribe menu para volver a la lista.'].join('\n'));
  }

  private async esElevado(telefono: string): Promise<boolean> {
    const fila = await this.conexiones.pg.query<{ rol: string }>(`SELECT rol FROM usuario WHERE telefono = $1 AND activo`, [telefono]);
    return fila.rows[0]?.rol === 'administrador' || fila.rows[0]?.rol === 'superusuario';
  }

  private async veTodo(telefono: string): Promise<boolean> {
    const fila = await this.conexiones.pg.query<{ rol: string }>(`SELECT rol FROM usuario WHERE telefono = $1 AND activo`, [telefono]);
    return fila.rows[0]?.rol === 'superusuario';
  }

  private filtroTarea(veTodo: boolean): string {
    return veTodo ? '' : `AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = tarea.id::text)`;
  }

  private async filtroHilo(telefono: string, clase: 'interno' | 'decision'): Promise<string> {
    if (await this.veTodo(telefono)) return '';
    return `AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = '${clase}' AND pub.clave = m.gmail_thread_id)`;
  }

  private async cotExiste(cot: string): Promise<boolean> {
    const fila = await this.conexiones.pg.query(`SELECT 1 FROM tarea WHERE cot <> '10000000000' AND (cot = $1 OR $1 = ANY(cots)) LIMIT 1`, [cot]);
    return Boolean(fila.rows[0]);
  }

  private async hiloHabilitado(mensajeId: string, clase: 'interno' | 'decision'): Promise<boolean> {
    const fila = await this.conexiones.pg.query(
      `SELECT 1
       FROM mensaje_correo m
       JOIN habilitado pub ON pub.clase = $2 AND pub.clave = m.gmail_thread_id
       WHERE m.id = $1`,
      [mensajeId, clase],
    );
    return Boolean(fila.rows[0]);
  }

  private async empezarRegistro(telefono: string, tareaId: string, tipo: 'seguimiento' | 'incidente'): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    await this.guardarCharla(telefono, 'pregunta_imagen', tareaId, [], { tipo, imagen: null });
    return this.dejar(telefono, true, preguntaImagen(ref.linea, tipo));
  }

  private async dejar(telefono: string, habilitado: boolean, respuesta: string, archivo: ArchivoSalida | null = null): Promise<RespuestaBot> {
    if (telefono && respuesta.trim()) await this.guardarMensaje('enviado', telefono, respuesta);
    return { habilitado, respuesta, archivo };
  }

  private async guardarMensaje(direccion: 'enviado' | 'recibido', telefono: string, texto: string, avisoId?: string): Promise<void> {
    const limpio = texto.trim();
    if (!telefono || !limpio) return;
    await this.conexiones.pg.query(
      `INSERT INTO mensaje_whatsapp (id, direccion, telefono, texto, aviso_id) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), direccion, telefono, limpio.slice(0, 4000), avisoId ?? null],
    );
  }

  private async recientes(telefono: string): Promise<RespuestaBot> {
    const veTodo = await this.veTodo(telefono);
    const tareas = await this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente, tarea.lugar, tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora
       FROM tarea
       ${joinUrgente('tarea')}
       WHERE tarea.cot <> '10000000000' AND tarea.estado <> 'resuelta'
         AND tarea.padre_id IS NULL
         ${this.filtroTarea(veTodo)}
       ORDER BY ${ordenUrgente('tarea')}
       LIMIT 10`,
    );
    if (tareas.length === 0) {
      const texto = veTodo ? 'No hay tareas recientes.' : 'No hay tareas habilitadas para ti.';
      return this.abrirMenu(telefono, `${texto}\n${menuGeneral(await this.esElevado(telefono))}`);
    }
    await this.guardarCharla(telefono, 'recientes', null, tareas.map((tarea) => tarea.id), null);
    const lineas = tareas.map((tarea, indice) => `${indice + 1}. ${this.linea(tarea)}`);
    return this.dejar(telefono, true, ['Tareas por atender:', ...lineas, 'Escribe el número para entrar. Escribe menú para quedarte en el menú general.'].join('\n'));
  }

  private async buscar(telefono: string, texto: string): Promise<RespuestaBot> {
    const cot = numeroCot(texto);
    const veTodo = await this.veTodo(telefono);
    const tareas = cot ? await this.porNumero(cot, veTodo) : texto.trim().length >= 2 ? await this.porCliente(texto.trim(), veTodo) : [];
    if (tareas.length === 0 && cot && !veTodo && (await this.cotExiste(cot))) {
      return this.abrirMenu(telefono, `COT ${cot}\nTodavía no está habilitada.\n${menuGeneral(await this.esElevado(telefono))}`);
    }
    if (tareas.length === 0) return this.abrirMenu(telefono, `No encontré esa cotización.\n${menuGeneral(await this.esElevado(telefono))}`);
    if (tareas.length === 1) {
      await this.guardarCharla(telefono, 'confirma', tareas[0].id, [tareas[0].id], null);
      return this.dejar(telefono, true, `Encontré ${this.linea(tareas[0])}\n1. Entrar\n2. Seguir en el menú general`);
    }
    await this.guardarCharla(telefono, 'resultados', null, tareas.map((tarea) => tarea.id), null);
    const lineas = tareas.map((tarea, indice) => `${indice + 1}. ${this.linea(tarea)}`);
    return this.dejar(telefono, true, ['Encontré varias:', ...lineas, 'Escribe el número para entrar. Escribe menú para quedarte en el menú general.'].join('\n'));
  }

  private async datosDeCot(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const fila = await this.conexiones.pg.query<FichaCorta>(
      `SELECT cot, cliente, ticket, descripcion, lugar,
              to_char(cita_fecha, 'YYYY-MM-DD') AS cita_fecha, cita_hora, cita_direccion, cita_mapa,
              to_char(cita_parcial_fecha, 'YYYY-MM-DD') AS cita_parcial_fecha, cita_parcial_hora,
              temperatura, producto, cantidad, contenedor,
              comercial_nombre, comercial_cargo, comercial_correo, comercial_telefono
       FROM tarea WHERE id = $1`,
      [tareaId],
    );
    const tarea = fila.rows[0];
    if (!tarea) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const linea = this.linea(tarea);
    await this.guardarCharla(telefono, 'cot', tareaId, [], null);
    const comercial = [tarea.comercial_nombre, tarea.comercial_cargo].filter(Boolean).join(', ');
    const temperatura = [tarea.temperatura, tarea.producto].filter(Boolean).join(' · ');
    const cuerpo = [
      linea,
      'Datos de la cotización',
      campo('Ticket', tarea.ticket),
      campo('Descripción', tarea.descripcion),
      campo('Cliente', tarea.cliente),
      campo(tarea.cot.includes('#') ? 'Cadena y tienda' : 'Lugar', tarea.lugar),
      campo('Cita', citaVisible(tarea.cita_fecha, tarea.cita_hora)),
      campo('Dirección', direccionLimpia(tarea.cita_direccion)),
      campo('Mapa', tarea.cita_mapa),
      campo('También citado', citaVisible(tarea.cita_parcial_fecha, tarea.cita_parcial_hora)),
      campo('Temperatura', temperatura || null),
      campo('Telemetrías', tarea.cantidad === null ? (tarea.cot.includes('#') ? 'una o más' : null) : String(tarea.cantidad)),
      campo('Contenedor', tarea.contenedor),
      campo('Comercial', comercial || null),
      campo('Correo', tarea.comercial_correo),
      campo('Teléfono', tarea.comercial_telefono),
      '',
      `Sigues en ${linea}`,
      'Escribe menú para ver las opciones de esta cotización.',
    ].join('\n');
    return this.dejar(telefono, true, cuerpo);
  }

  private async ultimo(telefono: string, tareaId: string, tipo: 'seguimiento' | 'incidente'): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const nota = await this.notaDe(tareaId, tipo, null);
    if (!nota) {
      await this.guardarCharla(telefono, 'cot', tareaId, [], null);
      const cual = tipo === 'incidente' ? 'incidente' : 'seguimiento';
      return this.dejar(telefono, true, `${ref.linea}\nNo hay un ${cual} en esta cotización.\n${opcionesCot()}`);
    }
    await this.guardarCharla(telefono, 'pregunta_resumen', tareaId, [], null);
    return this.mostrarNota(telefono, ref.linea, nota, true);
  }

  private async resumen(telefono: string, tareaId: string, offset: number): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const notas = await this.conexiones.pg.query<NotaBreve>(
      `SELECT id, tipo, texto, autor_nombre, archivo_nombre, archivo_clave, archivo_mime, creado_en
       FROM nota_bitacora
       WHERE tarea_id = $1 AND tipo IN ('seguimiento', 'incidente') AND NOT archivado
       ORDER BY creado_en DESC
       LIMIT 5 OFFSET $2`,
      [tareaId, offset],
    );
    if (notas.rows.length === 0 && offset === 0) {
      await this.guardarCharla(telefono, 'cot', tareaId, [], null);
      return this.dejar(telefono, true, `${ref.linea}\nNo hay registros en esta cotización.\n${opcionesCot()}`);
    }
    if (notas.rows.length === 0) {
      return this.dejar(telefono, true, `${ref.linea}\nNo hay más registros.\n8. Volver al menú de esta cotización`);
    }
    await this.guardarCharla(telefono, 'resumen', tareaId, notas.rows.map((nota) => nota.id), { pagina: offset });
    const lineas = notas.rows.map((nota, indice) => {
      const etiqueta = nota.tipo === 'incidente' ? 'Incidente' : 'Seguimiento';
      const foto = nota.archivo_clave ? 'con imagen' : 'sin imagen';
      return `${indice + 1}. ${etiqueta} · ${horaLima(nota.creado_en)} · ${foto} · ${negrita(recorte(nota.texto))}`;
    });
    return this.dejar(
      telefono,
      true,
      [ref.linea, 'Últimos registros:', ...lineas, '', 'Escribe el número para ver el detalle.', '7. Ver más registros', '8. Volver al menú de esta cotización'].join('\n'),
    );
  }

  private async detalle(telefono: string, charla: Charla, notaId: string): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id as string;
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const nota = await this.notaDe(tareaId, null, notaId);
    if (!nota) return this.resumen(telefono, tareaId, charla.pendiente?.pagina ?? 0);
    await this.guardarCharla(telefono, 'detalle', tareaId, charla.lista, { pagina: charla.pendiente?.pagina ?? 0 });
    const archivo = await this.archivoDeNota(nota);
    const etiqueta = nota.tipo === 'incidente' ? 'Incidente' : 'Seguimiento';
    const cuerpo = [
      ref.linea,
      `${etiqueta} · ${horaLima(nota.creado_en)} · ${nota.autor_nombre}`,
      negrita(nota.texto) || 'Sin texto.',
      ...(archivo ? [] : ['Sin imagen.']),
      '',
      '1. Otro registro de la lista',
      '2. Menú de esta cotización',
      '3. Menú general',
    ].join('\n');
    return this.dejar(telefono, true, cuerpo, archivo);
  }

  private async mostrarNota(telefono: string, linea: string, nota: NotaBreve, pregunta: boolean): Promise<RespuestaBot> {
    const archivo = await this.archivoDeNota(nota);
    const etiqueta = nota.tipo === 'incidente' ? 'incidente' : 'seguimiento';
    const cuerpo = [
      linea,
      `Último ${etiqueta} · ${horaLima(nota.creado_en)} · ${nota.autor_nombre}`,
      negrita(nota.texto) || 'Sin texto.',
      ...(archivo ? [] : ['Sin imagen.']),
      '',
      '¿Quieres el resumen de los últimos registros?',
      '1. Sí, ver el resumen',
      '2. No, seguir en esta cotización',
    ].join('\n');
    return this.dejar(telefono, true, pregunta ? cuerpo : cuerpo, archivo);
  }

  private async notaDe(tareaId: string, tipo: 'seguimiento' | 'incidente' | null, notaId: string | null): Promise<NotaBreve | null> {
    const filas = await this.conexiones.pg.query<NotaBreve>(
      `SELECT id, tipo, texto, autor_nombre, archivo_nombre, archivo_clave, archivo_mime, creado_en
       FROM nota_bitacora
       WHERE tarea_id = $1 AND ($2::text IS NULL OR tipo = $2) AND ($3::uuid IS NULL OR id = $3) AND NOT archivado
       ORDER BY creado_en DESC
       LIMIT 1`,
      [tareaId, tipo, notaId],
    );
    return filas.rows[0] ?? null;
  }

  private async archivoDeNota(nota: NotaBreve): Promise<ArchivoSalida | null> {
    if (!nota.archivo_clave) return null;
    try {
      const bytes = await new AlmacenCorreo(this.conexiones).leer(nota.archivo_clave);
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) return null;
      return { nombre: nota.archivo_nombre || 'foto', mime: nota.archivo_mime || 'image/jpeg', contenido: bytes.toString('base64') };
    } catch {
      return null;
    }
  }

  private filtroCola(despacho: boolean): string {
    if (!despacho) return `AND tarea.padre_id IS NULL`;
    return `AND tarea.campana = false AND NOT EXISTS (
      SELECT 1 FROM tienda x WHERE x.tarea_hija_id = tarea.id AND x.estado IN ('atendida', 'resuelta')
    )`;
  }

  private async porNumero(cot: string, veTodo: boolean, despacho = false): Promise<TareaBreve[]> {
    return this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente, tarea.lugar, tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora
       FROM tarea
       ${joinUrgente('tarea')}
       WHERE tarea.cot <> '10000000000' AND (tarea.cot = $1 OR $1 = ANY(tarea.cots))
         ${this.filtroCola(despacho)}
         ${this.filtroTarea(veTodo)}
       ORDER BY ${ordenUrgente('tarea')}
       LIMIT 40`,
      [cot],
    );
  }

  private async porCliente(nombre: string, veTodo: boolean, despacho = false): Promise<TareaBreve[]> {
    return this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente, tarea.lugar, tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora
       FROM tarea
       ${joinUrgente('tarea')}
       WHERE tarea.cot <> '10000000000' AND tarea.cliente ILIKE $1 ESCAPE '\\'
         ${this.filtroCola(despacho)}
         ${this.filtroTarea(veTodo)}
       ORDER BY ${ordenUrgente('tarea')}
       LIMIT 40`,
      [comoLike(nombre)],
    );
  }

  private async tareasBreves(sql: string, valores: unknown[] = []): Promise<TareaBreve[]> {
    const filas = await this.conexiones.pg.query<TareaBreve>(sql, valores);
    return filas.rows;
  }

  private async abrirHilos(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const hilos = await listarHilos(this.conexiones.pg, tareaId);
    if (hilos.length === 0) {
      const cantidad = await this.turno().cantidadDe(tareaId);
      await this.guardarCharla(telefono, 'hilos', tareaId, [], null);
      const detectado = cantidad ? `Detecté ${cantidad} ${cantidad === 1 ? 'telemetría' : 'telemetrías'}.` : 'No detecté la cantidad en la cotización.';
      return this.dejar(telefono, true, [ref.linea, detectado, 'Escribe cuántas telemetrías son.', 'Si es 1 se abre un hilo. Si son 3 se abren 3.', 'Escribe menu para volver.'].join('\n'));
    }
    await this.guardarCharla(telefono, 'hilos', tareaId, hilos.map((hilo) => hilo.id), null);
    return this.dejar(telefono, true, [ref.linea, 'Hilos de esta cotización:', ...hilos.map((hilo, indice) => `${indice + 1}. ${lineaHilo(hilo)}`), 'Escribe el número.', 'Escribe menu para volver.'].join('\n'));
  }

  private async enHilos(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id;
    if (!tareaId) return this.abrirMenu(telefono);
    if (/^(menu|menú|volver)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    const numero = Number(limpio);
    if (charla.lista.length === 0 && Number.isInteger(numero)) {
      let creados;
      try {
        creados = await crearHilos(this.conexiones.pg, tareaId, numero);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'No pude abrir los hilos.';
        return this.dejar(telefono, true, mensaje);
      }
      const falta = creados.find((hilo) => !hilo.despacho_texto && !hilo.contenedor && !hilo.maquina);
      const aviso = falta ? await this.pedirDespachoAhora(tareaId, `Confirma el contenedor y la máquina del equipo ${falta.orden}.`, falta.orden) : '';
      const lista = await this.abrirHilos(telefono, tareaId);
      return aviso ? { ...lista, respuesta: `${aviso}\n${lista.respuesta}` } : lista;
    }
    const id = charla.lista[numero - 1];
    if (!id) return this.abrirHilos(telefono, tareaId);
    return this.menuHilo(telefono, tareaId, id);
  }

  private async menuHilo(telefono: string, tareaId: string, hiloId: string): Promise<RespuestaBot> {
    const hilos = await listarHilos(this.conexiones.pg, tareaId);
    const hilo = hilos.find((item) => item.id === hiloId);
    if (!hilo) return this.abrirHilos(telefono, tareaId);
    const juicio = hiloListo(hilo);
    await this.guardarCharla(telefono, 'hilo', tareaId, [], { hiloId });
    return this.dejar(telefono, true, [
      lineaHilo(hilo),
      hilo.despacho_texto ? `Despacho escribió: ${hilo.despacho_texto}` : 'Despacho todavía no dejó texto de este equipo.',
      juicio.listo ? 'Este hilo ya tiene lo necesario. La orden de fabricación es el siguiente módulo.' : `Para resolverlo: ${juicio.falta.join('; ')}.`,
      '1. Validar lo que envió despacho',
      '2. Pedir a despacho el código y el contenedor',
      '3. Pedir chip a almacén. Si el anterior está ocupado, pide otro',
      '4. Esta telemetría no se instala',
      '5. Volver a los hilos',
      '6. Regularizar el chip. Escribe el IMEI o manda la foto',
      '7. Regularizar el contenedor. Escríbelo o manda la foto',
      '8. Regularizar la máquina. Escríbela o manda la foto',
      '9. Pedir otra imagen a almacén y a despacho',
    ].join('\n'));
  }

  private async enHilo(telefono: string, charla: Charla, limpio: string, archivo: ArchivoNota | null = null): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id;
    const hiloId = charla.pendiente?.hiloId;
    if (!tareaId || !hiloId) return this.abrirMenu(telefono);
    if (charla.pendiente?.corrige) return this.corregirHilo(telefono, tareaId, hiloId, charla.pendiente.corrige, limpio, archivo);
    if (archivo) return this.dejar(telefono, true, 'Para regularizar una foto, elige 6 chip, 7 contenedor u 8 máquina, y luego mándala.');
    if (/^(5|volver|menu|menú)$/i.test(limpio)) return this.abrirHilos(telefono, tareaId);
    try {
      if (/^1$/.test(limpio)) {
        const hilo = await validarDespacho(this.conexiones.pg, hiloId);
        return this.dejar(telefono, true, `${lineaHilo(hilo)}\n5. Volver a los hilos`);
      }
      if (/^2$/.test(limpio)) {
        const hilos = await listarHilos(this.conexiones.pg, tareaId);
        const hilo = hilos.find((item) => item.id === hiloId);
        const aviso = await this.pedirDespachoAhora(tareaId, `Confirma el contenedor y la máquina del equipo ${hilo?.orden ?? ''}`.trim(), hilo?.orden ?? 1);
        return this.dejar(telefono, true, `${aviso}\n5. Volver a los hilos`);
      }
      if (/^3$/.test(limpio)) {
        await marcarInstalacion(this.conexiones.pg, hiloId, true);
        return this.pedirChip(telefono, tareaId, hiloId);
      }
      if (/^4$/.test(limpio)) {
        const hilo = await marcarInstalacion(this.conexiones.pg, hiloId, false);
        return this.dejar(telefono, true, `${lineaHilo(hilo)}\n5. Volver a los hilos`);
      }
      if (/^6$/.test(limpio)) {
        await this.guardarCharla(telefono, 'hilo', tareaId, [], { hiloId, corrige: 'imei' });
        return this.dejar(telefono, true, 'Regularizar el chip. Escribe el IMEI o manda la foto de la tarjeta.\nSi está ocupado queda registrado y puedes pedir otro con 3.\nEscribe menu para volver al hilo.');
      }
      if (/^7$/.test(limpio)) {
        await this.guardarCharla(telefono, 'hilo', tareaId, [], { hiloId, corrige: 'contenedor' });
        return this.dejar(telefono, true, 'Regularizar el contenedor. Escríbelo o manda la foto.\nEscribe menu para volver al hilo.');
      }
      if (/^8$/.test(limpio)) {
        await this.guardarCharla(telefono, 'hilo', tareaId, [], { hiloId, corrige: 'maquina' });
        return this.dejar(telefono, true, 'Regularizar la máquina. Escríbela o manda la foto de la serie.\nEscribe menu para volver al hilo.');
      }
      if (/^9$/.test(limpio)) return this.pedirImagenConcluyente(telefono, tareaId, hiloId);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No pude actualizar el hilo.';
      return this.dejar(telefono, true, `${mensaje}\n5. Volver a los hilos`);
    }
    return this.menuHilo(telefono, tareaId, hiloId);
  }

  private async corregirHilo(telefono: string, tareaId: string, hiloId: string, corrige: 'imei' | 'contenedor' | 'maquina', limpio: string, archivo: ArchivoNota | null): Promise<RespuestaBot> {
    if (/^(menu|menú)$/i.test(limpio) && !archivo) return this.menuHilo(telefono, tareaId, hiloId);
    if (/^5$/.test(limpio) && !archivo) return this.abrirHilos(telefono, tareaId);
    try {
      const quien = await this.conexiones.pg.query<{ correo: string; nombre: string }>(`SELECT correo, nombre FROM usuario WHERE telefono = $1`, [telefono]);
      const autor = quien.rows[0] ?? { correo: '', nombre: 'Técnico' };
      if (archivo) return this.regularizarFoto(telefono, tareaId, hiloId, corrige, autor, archivo);
      if (corrige === 'contenedor' || corrige === 'maquina') {
        const hilo = await corregirEquipo(this.conexiones.pg, hiloId, corrige === 'contenedor' ? { contenedor: limpio } : { maquina: limpio });
        const menu = await this.menuHilo(telefono, tareaId, hiloId);
        return { ...menu, respuesta: `Regularización. ${lineaHilo(hilo)}\n${menu.respuesta}` };
      }
      const digitos = limpio.replace(/\D/g, '');
      if (digitos.length < 8) return this.dejar(telefono, true, 'Escribe el IMEI o manda la foto. Ejemplo: 8951029078500034086');
      const catalogo = await this.conexiones.pg.query<{ imei: string; celular: string; estado: string; telemetria: string }>(
        `SELECT imei, celular, estado, telemetria FROM chip WHERE NOT archivado`,
      );
      const lectura = identificarChips(digitos.length >= 14 ? [digitos] : [], catalogo.rows, digitos.length < 14 ? [digitos] : []);
      const chip = lectura.hallados[0];
      if (!chip) return this.dejar(telefono, true, 'Ese IMEI no está en los chips cargados. Escríbelo de nuevo o menu para volver.');
      await registrarChip(this.conexiones, hiloId, tareaId, chip, autor, null, 'técnico', 'whatsapp');
      const menu = await this.menuHilo(telefono, tareaId, hiloId);
      const aviso = chip.estado === 'ocupado'
        ? `Quedó registrado. IMEI ${chip.imei}. Celular ${chip.celular}. Está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.\nNo se envía a una orden de fabricación. Pide otro chip con 3, o regulariza otra foto.`
        : `IMEI ${chip.imei}. Celular ${chip.celular}.`;
      return { ...menu, respuesta: `${aviso}\n${menu.respuesta}` };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No pude corregir el hilo.';
      return this.dejar(telefono, true, `${mensaje}\nEscribe menu para volver al hilo.`);
    }
  }

  private async regularizarFoto(
    telefono: string,
    tareaId: string,
    hiloId: string,
    corrige: 'imei' | 'contenedor' | 'maquina',
    autor: { correo: string; nombre: string },
    archivo: ArchivoNota,
  ): Promise<RespuestaBot> {
    const rechazo = this.rechazoImagen(archivo);
    if (rechazo) return this.dejar(telefono, true, rechazo);
    if (corrige === 'imei') {
      const lectura = await leerFotoChip(this.conexiones, archivo);
      if (!lectura) return this.dejar(telefono, true, 'El lector no respondió. Manda la foto otra vez.');
      const chip = chipParaGuardar(lectura.hallados);
      if (!chip) return this.dejar(telefono, true, `${lectura.paraWhatsapp}\nEscríbelo o manda otra foto.`);
      await registrarChip(this.conexiones, hiloId, tareaId, chip, autor, archivo, 'técnico', 'whatsapp');
      const menu = await this.menuHilo(telefono, tareaId, hiloId);
      const aviso = chip.estado === 'ocupado'
        ? `Quedó registrado. IMEI ${chip.imei}. Celular ${chip.celular}. Está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.\nNo se envía a una orden de fabricación. Pide otro chip con 3, o regulariza otra foto.`
        : `IMEI ${chip.imei}. Celular ${chip.celular}.`;
      return { ...menu, respuesta: `${aviso}\n${menu.respuesta}` };
    }
    const equipo = await leerFotoEquipo(archivo);
    if (!equipo) return this.dejar(telefono, true, 'No pude leer un código en la foto. Escríbelo o manda otra imagen.');
    const espera = corrige === 'contenedor' ? 'contenedor' : 'serie';
    if (equipo.clase !== espera) {
      const visto = equipo.clase === 'contenedor' ? 'contenedor' : 'máquina';
      return this.dejar(telefono, true, `Esa foto se leyó como ${visto} ${equipo.codigo}. Elige 7 o 8 según lo que sea, o escríbelo.`);
    }
    const hilo = await registrarEquipo(this.conexiones, hiloId, tareaId, corrige, equipo.codigo, autor, archivo, 'whatsapp');
    const menu = await this.menuHilo(telefono, tareaId, hiloId);
    return { ...menu, respuesta: `Regularización. ${lineaHilo(hilo)}\n${menu.respuesta}` };
  }

  private async pedirImagenConcluyente(telefono: string, tareaId: string, hiloId: string): Promise<RespuestaBot> {
    const frase = 'El área de desarrollo solicita otra imagen más concluyente.';
    const hilos = await listarHilos(this.conexiones.pg, tareaId);
    const hilo = hilos.find((item) => item.id === hiloId);
    const orden = hilo?.orden ?? 1;
    const ref = await this.referencia(tareaId);
    const despacho = await this.pedirDespachoAhora(tareaId, `${frase} Manda otra foto del contenedor y de la máquina del equipo ${orden}.`, orden);
    const quien = await this.conexiones.pg.query<{ nombre: string }>(`SELECT nombre FROM usuario WHERE telefono = $1`, [telefono]);
    const consultaId = randomUUID();
    await this.conexiones.pg.query(
      `INSERT INTO consulta_chip (id, tarea_id, tecnico_telefono, tecnico_nombre, hilo_id) VALUES ($1, $2, $3, $4, $5)`,
      [consultaId, tareaId, telefono, quien.rows[0]?.nombre ?? 'Técnico', hiloId],
    );
    const almacenes = await this.conexiones.pg.query<{ telefono: string }>(
      `SELECT telefono FROM usuario WHERE activo AND rol = 'almacen' AND telefono IS NOT NULL AND telefono <> ''`,
    );
    const cuerpo = `${ref?.linea ?? 'La cotización'}\n${frase}\nLa foto del chip del equipo ${orden} no alcanza. Manda otra imagen de la tarjeta o del chip.`;
    for (const destino of almacenes.rows) {
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes) VALUES ($1, 'consulta_chip', $2, $3, $4, 'pendiente', now())`,
        [randomUUID(), tareaId, destino.telefono, cuerpo],
      );
    }
    const almacen = almacenes.rows.length ? 'También se lo pedí a almacén.' : 'No hay un usuario de almacén con WhatsApp.';
    return this.dejar(telefono, true, `${frase}\n${despacho}\n${almacen}\n5. Volver a los hilos`);
  }

  private async pedirDespachoAhora(tareaId: string, pregunta: string, equipo: number): Promise<string> {
    const resultado = await this.turno().consultarAhora(tareaId, pregunta, equipo);
    if (resultado === 'sin_coordinador') return 'No hay un coordinador de despacho con WhatsApp. El pedido quedó anotado.';
    if (resultado === 'ocupado') return 'Ya le avisé a despacho. Le llegó el pedido ahora. Está cerrando otra cotización y esta queda primera apenas la suelte.';
    return 'Ya le consulté a despacho. Le llegó ahora el pedido del contenedor y la máquina.';
  }

  private async pedirChip(telefono: string, tareaId: string, hiloId?: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral(await this.esElevado(telefono))}`);
    const quien = await this.conexiones.pg.query<{ nombre: string }>(`SELECT nombre FROM usuario WHERE telefono = $1`, [telefono]);
    const previa = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM consulta_chip WHERE tarea_id = $1 AND tecnico_telefono = $2 AND estado = 'pendiente' ORDER BY creado_en DESC LIMIT 1`,
      [tareaId, telefono],
    );
    const consultaId = previa.rows[0]?.id ?? randomUUID();
    if (!previa.rows[0]) {
      await this.conexiones.pg.query(
        `INSERT INTO consulta_chip (id, tarea_id, tecnico_telefono, tecnico_nombre, hilo_id) VALUES ($1, $2, $3, $4, $5)`,
        [consultaId, tareaId, telefono, quien.rows[0]?.nombre ?? 'Técnico', hiloId ?? null],
      );
    } else if (hiloId) {
      await this.conexiones.pg.query(`UPDATE consulta_chip SET hilo_id = $2 WHERE id = $1`, [consultaId, hiloId]);
    }
    const almacenes = await this.conexiones.pg.query<{ telefono: string }>(
      `SELECT telefono FROM usuario WHERE activo AND rol = 'almacen' AND telefono IS NOT NULL AND telefono <> ''`,
    );
    const cuerpo = await this.textoPedidosChip();
    for (const destino of almacenes.rows) {
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes) VALUES ($1, 'consulta_chip', $2, $3, $4, 'pendiente', now())`,
        [randomUUID(), tareaId, destino.telefono, cuerpo],
      );
    }
    const aviso = almacenes.rows.length
      ? 'Pedí el chip a almacén. Cuando manden la foto te digo el celular.'
      : 'Anoté el pedido, pero no hay un usuario de almacén con WhatsApp para recibir la foto.';
    if (hiloId) {
      const menu = await this.menuHilo(telefono, tareaId, hiloId);
      return { ...menu, respuesta: `${ref.linea}\n${aviso}\n${menu.respuesta}` };
    }
    return this.dejar(telefono, true, `${ref.linea}\n${aviso}\n${opcionesCot(await this.esElevado(telefono))}`);
  }

  private async atenderAlmacen(
    telefono: string,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
  ): Promise<RespuestaBot> {
    if (archivo) return this.leerChip(telefono, quien, archivo);
    if (/^salir$/i.test(limpio)) return this.menuChips(telefono, 'El pedido sigue abierto. Manda la foto cuando la tengas.');
    if (/^(menu|menú)$/i.test(limpio) || !limpio) return this.menuChips(telefono);
    return this.menuChips(telefono, 'No hace falta escribir un número. Manda la foto de la tarjeta o del chip.');
  }

  private async menuChips(telefono: string, previo = ''): Promise<RespuestaBot> {
    const pendientes = await this.chipsPendientes();
    await this.guardarCharla(telefono, 'chip_menu', null, pendientes.map((consulta) => consulta.id), null);
    const lista = await this.textoPedidosChip();
    return this.dejar(telefono, true, [previo, lista].filter(Boolean).join('\n'));
  }

  private async textoPedidosChip(): Promise<string> {
    const pendientes = await this.chipsPendientes();
    if (pendientes.length === 0) return 'No hay pedidos de chip. Cuando un técnico pida telemetría, te llega aquí.';
    const lineas = [];
    for (const [indice, consulta] of pendientes.entries()) {
      const ref = await this.referencia(consulta.tarea_id);
      lineas.push(`${indice + 1}. ${ref?.linea ?? 'Cotización'} · ${consulta.tecnico_nombre}`);
    }
    return ['Pedidos de chip:', ...lineas, 'Manda la foto de la tarjeta o del chip. No hace falta escribir un número.'].join('\n');
  }

  private async chipsPendientes(): Promise<Array<{ id: string; tarea_id: string; tecnico_nombre: string; tecnico_telefono: string; hilo_id: string | null }>> {
    const filas = await this.conexiones.pg.query<{ id: string; tarea_id: string; tecnico_nombre: string; tecnico_telefono: string; hilo_id: string | null }>(
      `SELECT id, tarea_id, tecnico_nombre, tecnico_telefono, hilo_id FROM consulta_chip WHERE estado = 'pendiente' ORDER BY creado_en DESC LIMIT 10`,
    );
    return filas.rows;
  }

  private async leerChip(telefono: string, quien: { correo: string; nombre: string }, archivo: ArchivoNota): Promise<RespuestaBot> {
    const pendientes = await this.chipsPendientes();
    const consulta = pendientes[0];
    if (!consulta) return this.dejar(telefono, true, 'No hay un pedido de chip abierto. La foto no se procesó.');
    const ref = await this.referencia(consulta.tarea_id);
    const leido = await textoDeImagen(archivo);
    if (leido == null) return this.dejar(telefono, true, `${ref?.linea ?? 'Esa cotización'}\nGuardé la foto, pero el lector no respondió. Mándala otra vez.`);
    const candidatos = imeisDeTexto(leido);
    const fragmentos = fragmentosDeTexto(leido);
    const catalogo = await this.conexiones.pg.query<{ imei: string; celular: string; estado: string; telemetria: string }>(
      `SELECT imei, celular, estado, telemetria FROM chip WHERE NOT archivado`,
    );
    const resultado = identificarChips(candidatos, catalogo.rows, fragmentos);
    const primero = chipParaGuardar(resultado.hallados);
    if (consulta.hilo_id && primero) await guardarChip(this.conexiones.pg, consulta.hilo_id, primero.imei, primero.celular, primero.estado);
    const esTarjeta = /alai|alaisecure|suma m[oó]vil|8951\d{10,}/i.test(leido);
    const completo = `${esTarjeta ? 'La foto es una tarjeta de chip.\n' : ''}${textoChip(resultado.hallados, resultado.desconocidos)}`;
    const paraWhatsapp = resultado.hallados.length === 0 && resultado.desconocidos.length === 0
      ? 'No pude leer un IMEI en la foto. No hay coincidencia.'
      : `${esTarjeta ? 'La foto es una tarjeta de chip.\n' : ''}${textoChip(resultado.hallados, resultado.desconocidos, true)}`;
    const detalle = candidatos.length === 0 && resultado.hallados.length === 0 ? 'No pude leer un IMEI en la foto. No hay coincidencia.' : completo;
    const cierre = cierreFabricacion(resultado.hallados);
    const paraTecnico = resultado.hallados.length
      ? `${ref?.linea ?? 'Tu cotización'}\nAlmacén identificó el chip.\n${paraWhatsapp}\n${cierre}`
      : `${ref?.linea ?? 'Tu cotización'}\nAlmacén mandó la foto del chip y no hay coincidencia.\n${paraWhatsapp}`;
    const notaId = randomUUID();
    const avisoId = randomUUID();
    const clave = `chips/${consulta.id}/${notaId}`;
    const nombre = archivo.nombre || 'chip.jpg';
    const mime = archivo.mime || 'image/jpeg';
    await new AlmacenCorreo(this.conexiones).guardar(clave, archivo.contenido, mime);
    await this.conexiones.pg.query(
      `UPDATE consulta_chip
       SET estado = 'leido', imei = $2, celular = $3, detalle = $4, leido_en = now()
       WHERE id = $1`,
      [consulta.id, resultado.hallados.map((chip) => chip.imei).join(', '), resultado.hallados.map((chip) => chip.celular).join(', '), detalle],
    );
    await this.conexiones.pg.query(
      `INSERT INTO nota_bitacora (id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime)
       VALUES ($1, $2, 'seguimiento', 'whatsapp', $3, $4, $5, $6, $7, $8)`,
      [notaId, consulta.tarea_id, `Almacén envió la foto del chip.\n${detalle}`, quien.correo, quien.nombre, clave, nombre, mime],
    );
    await this.conexiones.pg.query(
      `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
       VALUES ($1, 'consulta_chip', $2, $3, $4, 'pendiente', now())`,
      [avisoId, consulta.tarea_id, consulta.tecnico_telefono, paraTecnico],
    );
    await this.conexiones.pg.query(
      `INSERT INTO aviso_adjunto (id, aviso_id, clave, mime, nombre, orden) VALUES ($1, $2, $3, $4, $5, 0)`,
      [randomUUID(), avisoId, clave, mime, nombre],
    );
    await this.guardarCharla(telefono, 'chip_menu', null, [], null);
    return this.dejar(telefono, true, 'Imagen procesada.');
  }

  private linea(tarea: { cot: string; cliente: string | null; lugar?: string | null; campana?: boolean; despacho_fecha?: string | null; despacho_hora?: string | null; cita_fecha?: string | null; cita_hora?: string | null }, despacho = false): string {
    const cot = tarea.cot.split('#')[0].split('+').join(' · ');
    const quien = tarea.cliente?.trim() || tarea.lugar?.trim() || 'sin cliente';
    const fecha = ` · ${textoFecha(tarea.despacho_fecha ?? tarea.cita_fecha, tarea.despacho_hora ?? tarea.cita_hora)}`;
    if (tarea.cot.includes('#')) {
      const tienda = tarea.lugar?.trim() || 'tienda';
      return despacho ? `COT ${cot} · ${tienda}${fecha}` : `Campaña ${cot} · ${tienda}${fecha}`;
    }
    if (!despacho && tarea.campana) return `Campaña ${cot} · ${quien}${fecha}`;
    return `COT ${cot} · ${quien}${fecha}`;
  }

  private async referencia(tareaId: string, despacho = false): Promise<{ linea: string } | null> {
    const filas = await this.conexiones.pg.query<{ cot: string; cliente: string | null; lugar: string | null; campana: boolean; despacho_fecha: string | null; despacho_hora: string | null }>(
      `SELECT tarea.cot, tarea.cliente, tarea.lugar, tarea.campana,
              to_char(COALESCE(urgente.entrega_fecha, tarea.cita_fecha), 'YYYY-MM-DD') AS despacho_fecha,
              CASE WHEN urgente.entrega_fecha IS NOT NULL THEN NULLIF(urgente.entrega_hora, '') ELSE NULLIF(tarea.cita_hora, '') END AS despacho_hora
       FROM tarea
       ${joinUrgente('tarea')}
       WHERE tarea.id = $1`,
      [tareaId],
    );
    const tarea = filas.rows[0];
    return tarea ? { linea: this.linea(tarea, despacho) } : null;
  }

  private async charla(telefono: string): Promise<Charla> {
    const filas = await this.conexiones.pg.query<{ paso: Paso; tarea_id: string | null; lista: string[]; pendiente: Pendiente | null }>(
      `SELECT paso, tarea_id, lista, pendiente FROM charla WHERE telefono = $1`,
      [telefono],
    );
    const fila = filas.rows[0];
    const paso = fila && PASOS.includes(fila.paso) ? fila.paso : 'menu';
    const pendiente = fila?.pendiente && typeof fila.pendiente === 'object' ? fila.pendiente : null;
    return { paso, tarea_id: fila?.tarea_id ?? null, lista: Array.isArray(fila?.lista) ? fila.lista : [], pendiente };
  }

  private async guardarCharla(telefono: string, paso: Paso, tareaId: string | null, lista: string[], pendiente: Pendiente | null): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO charla (telefono, paso, tarea_id, lista, pendiente, actualizado_en)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())
       ON CONFLICT (telefono) DO UPDATE
         SET paso = EXCLUDED.paso, tarea_id = EXCLUDED.tarea_id, lista = EXCLUDED.lista, pendiente = EXCLUDED.pendiente, actualizado_en = now()`,
      [telefono, paso, tareaId, JSON.stringify(lista), pendiente ? JSON.stringify(pendiente) : null],
    );
  }

  private async hayQr(): Promise<boolean> {
    try {
      await access(rutaQr());
      return true;
    } catch {
      return false;
    }
  }

  private async activos(): Promise<Array<{ telefono: string }>> {
    const filas = await this.conexiones.pg.query<{ telefono: string }>(
      `SELECT telefono FROM usuario
       WHERE activo AND rol = 'tecnico' AND telefono IS NOT NULL AND telefono <> ''
       ORDER BY telefono`,
    );
    return filas.rows;
  }

  private async datos(tareaId: string): Promise<FilaTarea | null> {
    const fila = await this.conexiones.pg.query<FilaTarea>(
      `SELECT id, cot, cliente, lugar, to_char(cita_fecha, 'YYYY-MM-DD') AS cita_fecha, cita_hora, cantidad
       FROM tarea WHERE id = $1`,
      [tareaId],
    );
    return fila.rows[0] ?? null;
  }

  private avisoDe(tarea: FilaTarea) {
    return {
      cot: tarea.cot,
      cliente: tarea.cliente,
      lugar: tarea.lugar,
      cita: citaVisible(tarea.cita_fecha, tarea.cita_hora),
      cantidad: tarea.cantidad,
    };
  }
}

const DESTINO_LINEA = '51929467505';

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function textoWhatsapp(estado: string, proceso: boolean, enLinea: boolean, fallo: string | null): string {
  if (fallo) return fallo;
  if (enLinea) return 'Sesión lista y el proceso responde.';
  if (!proceso) return 'El proceso del bot no responde.';
  if (estado === 'esperando_qr') return 'Falta escanear el código.';
  if (estado === 'desconectado') return 'WhatsApp está desconectado.';
  return 'WhatsApp no está listo.';
}

function esSaludo(texto: string): boolean {
  return /^(hola|hey|buenas|buenos dias|buenos días|buen dia|buen día|ola|oli|inicio|hi|ok|okay)$/i.test(texto);
}

function numeroCot(texto: string): string | null {
  return texto.match(/(?<!\d)(1002\d{7})(?!\d)/)?.[1] ?? null;
}

function comoLike(valor: string): string {
  return `%${valor.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

function campo(nombre: string, valor: string | null | undefined): string {
  return `${nombre}: ${valor?.trim() || '—'}`;
}

function direccionLimpia(valor: string | null): string | null {
  if (!valor) return null;
  const limpia = valor.replace(/<\s*https?:\/\/[^>]*>/gi, ' ').replace(/https?:\/\/\S+/gi, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return limpia || null;
}

function textoFecha(fecha?: string | null, hora?: string | null): string {
  if (!fecha) return 'sin fecha';
  const dia = fecha.slice(0, 10).split('-').reverse().join('/');
  return [dia, hora?.trim()].filter(Boolean).join(' ');
}

function horaLima(fecha: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(fecha));
}

function recorte(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > 60 ? `${limpio.slice(0, 59)}…` : limpio;
}

function tipoNota(charla: Charla): TipoNota {
  if (charla.pendiente?.tipo === 'incidente') return 'incidente';
  if (charla.pendiente?.tipo === 'cierre') return 'cierre';
  return 'seguimiento';
}

function textoDeError(error: BadRequestException): string {
  const respuesta = error.getResponse();
  if (typeof respuesta === 'string') return respuesta;
  if (typeof respuesta === 'object' && respuesta && 'message' in respuesta) {
    const mensaje = (respuesta as { message: unknown }).message;
    if (typeof mensaje === 'string') return mensaje;
    if (Array.isArray(mensaje)) return mensaje.join(' ');
  }
  return 'No pude guardar la nota.';
}
