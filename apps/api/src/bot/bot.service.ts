import { access, readFile } from 'fs/promises';
import path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenCorreo } from '../buzon/almacen';
import type { Conexiones } from '../conexiones';
import {
  NO_HABILITADO,
  PAUSA_MS,
  citaVisible,
  digitos,
  imagenRecibida,
  menuCot,
  menuGeneral,
  momentosDeEnvio,
  notaGuardada,
  opcionesCot,
  pideImagen,
  pideTexto,
  preguntaImagen,
  salioDeCot,
  textoReprogramacion,
  textoTareaNueva,
} from './avisos';

type Autor = { correo: string; nombre: string };
type ArchivoNota = { nombre: string; mime: string; contenido: Buffer };
type Anotador = {
  anotar(id: string, autor: Autor, tipo: string, texto: string, archivo: ArchivoNota | null, canal?: 'web' | 'whatsapp'): Promise<void>;
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
  | 'detalle';
type ImagenPendiente = { nombre: string; mime: string; contenido: string };
type Pendiente = { tipo?: 'seguimiento' | 'incidente'; imagen?: ImagenPendiente | null; pagina?: number };
type Charla = { paso: Paso; tarea_id: string | null; lista: string[]; pendiente: Pendiente | null };
type ArchivoSalida = { nombre: string; mime: string; contenido: string };
type RespuestaBot = { habilitado: boolean; respuesta: string; archivo: ArchivoSalida | null };
type TareaBreve = { id: string; cot: string; cliente: string | null };
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
    detalle: string;
  }> {
    const fila = await this.conexiones.pg.query<{ estado: string; actualizado_en: Date | null; ultimo_envio_en: Date | null }>(
      `SELECT estado, actualizado_en, ultimo_envio_en FROM sesion_bot WHERE id = 1`,
    );
    const lider = await this.conexiones.pg.query<{ vivo: boolean }>(`SELECT vence_en > now() AS vivo FROM lider_bot WHERE id = 1`);
    const sesion = fila.rows[0];
    const estado = sesion?.estado ?? 'desconectado';
    const proceso = Boolean(lider.rows[0]?.vivo);
    const enLinea = estado === 'listo' && proceso;
    return {
      estado,
      actualizadoEn: sesion?.actualizado_en ? new Date(sesion.actualizado_en).toISOString() : null,
      ultimoEnvioEn: sesion?.ultimo_envio_en ? new Date(sesion.ultimo_envio_en).toISOString() : null,
      qr: await this.hayQr(),
      enLinea,
      proceso,
      detalle: textoWhatsapp(estado, proceso, enLinea),
    };
  }

  async marcarReinicio(): Promise<{ estado: string; enLinea: boolean; proceso: boolean; detalle: string }> {
    await this.conexiones.pg.query(`UPDATE sesion_bot SET reiniciar = true WHERE id = 1`);
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

  async tomarReinicio(): Promise<boolean> {
    const resultado = await this.conexiones.pg.query(`UPDATE sesion_bot SET reiniciar = false WHERE id = 1 AND reiniciar = true RETURNING id`);
    return (resultado.rowCount ?? 0) > 0;
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
    await this.conexiones.pg.query(`UPDATE sesion_bot SET estado = $1, actualizado_en = $2 WHERE id = 1`, [estado, ahora.toISOString()]);
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

  async guardarTelefono(correo: string, telefono: string): Promise<void> {
    const limpio = digitos(telefono);
    if (limpio && (limpio.length < 8 || limpio.length > 15)) throw new BadRequestException('El teléfono tiene entre 8 y 15 dígitos.');
    const resultado = await this.conexiones.pg.query(`UPDATE usuario SET telefono = $2 WHERE correo = $1`, [correo.trim().toLowerCase(), limpio || null]);
    if (resultado.rowCount === 0) throw new NotFoundException('No está ese miembro.');
  }

  async alNacer(tareaId: string, ahora = new Date()): Promise<number> {
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

  async tomarAviso(ahora = new Date()): Promise<{ id: string; destino: string; cuerpo: string } | null> {
    const sesion = await this.estado();
    if (sesion.estado !== 'listo') return null;
    const pendiente = await this.conexiones.pg.query<{ id: string; destino: string; cuerpo: string; no_enviar_antes: Date }>(
      `SELECT id, destino, cuerpo, no_enviar_antes
       FROM aviso
       WHERE estado = 'pendiente'
       ORDER BY no_enviar_antes, creado_en
       LIMIT 1`,
    );
    const aviso = pendiente.rows[0];
    if (!aviso) return null;
    const ultimo = sesion.ultimoEnvioEn ? new Date(sesion.ultimoEnvioEn) : null;
    const porPausa = ultimo ? new Date(ultimo.getTime() + PAUSA_MS) : new Date(aviso.no_enviar_antes);
    const noAntes = new Date(Math.max(new Date(aviso.no_enviar_antes).getTime(), porPausa.getTime()));
    if (noAntes > ahora) return null;
    return { id: aviso.id, destino: aviso.destino, cuerpo: aviso.cuerpo };
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
      await cliente.query(`UPDATE sesion_bot SET ultimo_envio_en = $1 WHERE id = 1`, [ahora.toISOString()]);
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
    const miembro = await this.conexiones.pg.query<{ correo: string; nombre: string }>(
      `SELECT correo, nombre FROM usuario WHERE telefono = $1 AND activo`,
      [numero],
    );
    const quien = miembro.rows[0];
    if (!quien) return this.dejar(numero, false, NO_HABILITADO);

    const charla = await this.charla(numero);
    const limpio = texto.trim();
    const paso = charla.paso;
    const general = paso === 'menu' || paso === 'recientes' || paso === 'busca' || paso === 'confirma' || paso === 'resultados';
    if (general && /^salir$/i.test(limpio)) return this.cerrarConsulta(numero);
    if (paso === 'menu' && limpio === '3') return this.cerrarConsulta(numero);

    if (paso === 'nota' && charla.tarea_id) return this.enNota(numero, charla, quien, limpio, archivo, anotador);
    if (paso === 'espera_imagen' && charla.tarea_id && charla.pendiente?.tipo) return this.enEsperaImagen(numero, charla, quien, limpio, archivo, anotador);
    if (paso === 'pregunta_imagen' && charla.tarea_id && charla.pendiente?.tipo) return this.enPreguntaImagen(numero, charla, quien, limpio, archivo, anotador);
    if (paso === 'cot' && charla.tarea_id) return this.enCot(numero, charla.tarea_id, limpio);
    if (paso === 'pregunta_resumen' && charla.tarea_id) return this.enPreguntaResumen(numero, charla.tarea_id, limpio);
    if (paso === 'resumen' && charla.tarea_id) return this.enResumen(numero, charla, limpio);
    if (paso === 'detalle' && charla.tarea_id) return this.enDetalle(numero, charla, limpio);
    if (paso === 'recientes' || paso === 'resultados') return this.enLista(numero, charla, limpio);
    if (paso === 'busca') return this.enBusca(numero, limpio);
    if (paso === 'confirma' && charla.tarea_id) return this.enConfirma(numero, charla.tarea_id, limpio);
    return this.enMenu(numero, limpio);
  }

  private async enMenu(telefono: string, limpio: string): Promise<RespuestaBot> {
    if (limpio === '1' || /^tareas recientes$/i.test(limpio)) return this.recientes(telefono);
    if (limpio === '2' || /^buscar( cotizacion| cotización)?$/i.test(limpio)) {
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
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    return this.dejar(telefono, true, `Encontré ${ref.linea}\n1. Entrar\n2. Seguir en el menú general`);
  }

  private async enLista(telefono: string, charla: Charla, limpio: string): Promise<RespuestaBot> {
    if (/^(menu|menú)$/i.test(limpio)) return this.abrirMenu(telefono);
    const indice = Number(limpio);
    if (Number.isInteger(indice) && indice >= 1) {
      const id = charla.lista[indice - 1];
      if (!id) return this.dejar(telefono, true, 'Ese número no está en la lista.');
      return this.entrarEn(telefono, id);
    }
    if (numeroCot(limpio) || (limpio.length >= 2 && !/^\d+$/.test(limpio))) return this.buscar(telefono, limpio);
    return this.dejar(telefono, true, 'Escribe el número para entrar. Escribe menú para quedarte en el menú general.');
  }

  private async enCot(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(1|datos|datos de la cotizacion|datos de la cotización)$/i.test(limpio)) return this.datosDeCot(telefono, tareaId);
    if (/^(2|seguimiento|registrar seguimiento)$/i.test(limpio)) return this.empezarRegistro(telefono, tareaId, 'seguimiento');
    if (/^(3|incidente|registrar incidente)$/i.test(limpio)) return this.empezarRegistro(telefono, tareaId, 'incidente');
    if (/^(4|ultimo seguimiento|último seguimiento)$/i.test(limpio)) return this.ultimo(telefono, tareaId, 'seguimiento');
    if (/^(5|ultimo incidente|último incidente)$/i.test(limpio)) return this.ultimo(telefono, tareaId, 'incidente');
    if (/^(6|resumen|resumen de registros)$/i.test(limpio)) return this.resumen(telefono, tareaId, 0);
    if (/^(7|volver|salir|menu general|menú general)$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    return this.menuDeCot(telefono, tareaId);
  }

  private async enPreguntaResumen(telefono: string, tareaId: string, limpio: string): Promise<RespuestaBot> {
    if (/^(1|si|sí|s|resumen)$/i.test(limpio)) return this.resumen(telefono, tareaId, 0);
    if (/^(2|no|n)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (/^salir$/i.test(limpio)) return this.salirDeCot(telefono, tareaId);
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
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
    const tareaId = charla.tarea_id as string;
    const tipo = charla.pendiente?.tipo === 'incidente' ? 'incidente' : 'seguimiento';
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (archivo) return this.recibirImagen(telefono, charla, quien, limpio, archivo, anotador, ref.linea);
    if (/^(1|si|sí|s)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'espera_imagen', tareaId, [], { tipo, imagen: null });
      return this.dejar(telefono, true, pideImagen(ref.linea));
    }
    if (/^(2|no|n)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'nota', tareaId, [], { tipo, imagen: null });
      return this.dejar(telefono, true, pideTexto(ref.linea));
    }
    return this.dejar(telefono, true, preguntaImagen(ref.linea, tipo));
  }

  private async enEsperaImagen(
    telefono: string,
    charla: Charla,
    quien: { correo: string; nombre: string },
    limpio: string,
    archivo: ArchivoNota | null,
    anotador: Anotador,
  ): Promise<RespuestaBot> {
    const tareaId = charla.tarea_id as string;
    const tipo = charla.pendiente?.tipo === 'incidente' ? 'incidente' : 'seguimiento';
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.menuDeCot(telefono, tareaId);
    if (/^(no|n|2)$/i.test(limpio)) {
      await this.guardarCharla(telefono, 'nota', tareaId, [], { tipo, imagen: null });
      return this.dejar(telefono, true, pideTexto(ref.linea));
    }
    if (!archivo) return this.dejar(telefono, true, pideImagen(ref.linea));
    return this.recibirImagen(telefono, charla, quien, limpio, archivo, anotador, ref.linea);
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
    const tipo = charla.pendiente?.tipo === 'incidente' ? 'incidente' : 'seguimiento';
    const rechazo = this.rechazoImagen(archivo);
    if (rechazo) return this.dejar(telefono, true, `${linea}\n${rechazo} Envíala otra vez, o escribe no para seguir sin imagen.`);
    const imagen = this.serializar(archivo);
    const nota = limpio && !/^(1|si|sí|s|foto)$/i.test(limpio) ? limpio : '';
    if (nota) return this.cerrarNota(telefono, { ...charla, pendiente: { tipo, imagen } }, quien, nota, null, anotador);
    await this.guardarCharla(telefono, 'nota', charla.tarea_id, [], { tipo, imagen });
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
    const ref = await this.referencia(charla.tarea_id as string);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    if (/^(menu|menú|cancelar|salir)$/i.test(limpio)) return this.menuDeCot(telefono, charla.tarea_id as string);
    if (!limpio && !archivo) return this.dejar(telefono, true, pideTexto(ref.linea));
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
    const tipo = charla.pendiente?.tipo === 'incidente' ? 'incidente' : 'seguimiento';
    const imagen = archivo ?? this.bufferDe(charla.pendiente?.imagen ?? null);
    const ref = charla.tarea_id ? await this.referencia(charla.tarea_id) : null;
    const rechazo = imagen ? this.rechazoImagen(imagen) : null;
    if (rechazo || !charla.tarea_id || !ref) {
      return this.dejar(telefono, true, rechazo ? `${ref?.linea ?? 'Menú general'}\n${rechazo}` : `Esa cotización ya no está.\n${menuGeneral()}`);
    }
    try {
      await anotador.anotar(charla.tarea_id, quien, tipo, limpio || 'Foto', imagen, 'whatsapp');
    } catch (error) {
      if (error instanceof BadRequestException) return this.dejar(telefono, true, `${ref.linea}\n${textoDeError(error)}`);
      throw error;
    }
    await this.guardarCharla(telefono, 'cot', charla.tarea_id, [], null);
    return this.dejar(telefono, true, notaGuardada(ref.linea, tipo, Boolean(imagen)));
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

  private async abrirMenu(telefono: string, texto = menuGeneral()): Promise<RespuestaBot> {
    await this.guardarCharla(telefono, 'menu', null, [], null);
    return this.dejar(telefono, true, texto);
  }

  private async cerrarConsulta(telefono: string): Promise<RespuestaBot> {
    await this.guardarCharla(telefono, 'menu', null, [], null);
    return this.dejar(telefono, true, 'Listo. La consulta quedó cerrada.\nCuando escribas, vuelves al menú general.');
  }

  private async menuDeCot(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    await this.guardarCharla(telefono, 'cot', tareaId, [], null);
    return this.dejar(telefono, true, menuCot(ref.linea));
  }

  private async salirDeCot(telefono: string, tareaId: string): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    await this.guardarCharla(telefono, 'menu', null, [], null);
    if (!ref) return this.dejar(telefono, true, menuGeneral());
    return this.dejar(telefono, true, salioDeCot(ref.linea));
  }

  private async entrarEn(telefono: string, tareaId: string): Promise<RespuestaBot> {
    return this.menuDeCot(telefono, tareaId);
  }

  private async empezarRegistro(telefono: string, tareaId: string, tipo: 'seguimiento' | 'incidente'): Promise<RespuestaBot> {
    const ref = await this.referencia(tareaId);
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
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
    const tareas = await this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente
       FROM tarea
       LEFT JOIN LATERAL (
         SELECT max(c.fecha) AS fecha
         FROM mensaje_correo origen
         JOIN mensaje_correo c ON c.gmail_thread_id = origen.gmail_thread_id
         WHERE origen.id = tarea.mensaje_id
       ) ult ON true
       WHERE tarea.cot <> '10000000000'
       ORDER BY ult.fecha DESC NULLS LAST, tarea.creado_en DESC
       LIMIT 10`,
    );
    if (tareas.length === 0) return this.abrirMenu(telefono, `No hay tareas recientes.\n${menuGeneral()}`);
    await this.guardarCharla(telefono, 'recientes', null, tareas.map((tarea) => tarea.id), null);
    const lineas = tareas.map((tarea, indice) => `${indice + 1}. ${this.linea(tarea)}`);
    return this.dejar(telefono, true, ['Tareas recientes:', ...lineas, 'Escribe el número para entrar. Escribe menú para quedarte en el menú general.'].join('\n'));
  }

  private async buscar(telefono: string, texto: string): Promise<RespuestaBot> {
    const cot = numeroCot(texto);
    const tareas = cot ? await this.porNumero(cot) : texto.trim().length >= 2 ? await this.porCliente(texto.trim()) : [];
    if (tareas.length === 0) return this.abrirMenu(telefono, `No encontré esa cotización.\n${menuGeneral()}`);
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
    if (!tarea) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
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
      campo('Lugar', tarea.lugar),
      campo('Cita', citaVisible(tarea.cita_fecha, tarea.cita_hora)),
      campo('Dirección', direccionLimpia(tarea.cita_direccion)),
      campo('Mapa', tarea.cita_mapa),
      campo('También citado', citaVisible(tarea.cita_parcial_fecha, tarea.cita_parcial_hora)),
      campo('Temperatura', temperatura || null),
      campo('Telemetrías', tarea.cantidad === null ? null : String(tarea.cantidad)),
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
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
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
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    const notas = await this.conexiones.pg.query<NotaBreve>(
      `SELECT id, tipo, texto, autor_nombre, archivo_nombre, archivo_clave, archivo_mime, creado_en
       FROM nota_bitacora
       WHERE tarea_id = $1 AND tipo IN ('seguimiento', 'incidente')
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
      return `${indice + 1}. ${etiqueta} · ${horaLima(nota.creado_en)} · ${foto} · ${recorte(nota.texto)}`;
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
    if (!ref) return this.abrirMenu(telefono, `Esa cotización ya no está.\n${menuGeneral()}`);
    const nota = await this.notaDe(tareaId, null, notaId);
    if (!nota) return this.resumen(telefono, tareaId, charla.pendiente?.pagina ?? 0);
    await this.guardarCharla(telefono, 'detalle', tareaId, charla.lista, { pagina: charla.pendiente?.pagina ?? 0 });
    const archivo = await this.archivoDeNota(nota);
    const etiqueta = nota.tipo === 'incidente' ? 'Incidente' : 'Seguimiento';
    const cuerpo = [
      ref.linea,
      `${etiqueta} · ${horaLima(nota.creado_en)} · ${nota.autor_nombre}`,
      nota.texto,
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
      nota.texto,
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
       WHERE tarea_id = $1 AND ($2::text IS NULL OR tipo = $2) AND ($3::uuid IS NULL OR id = $3)
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

  private async porNumero(cot: string): Promise<TareaBreve[]> {
    return this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente
       FROM tarea
       LEFT JOIN LATERAL (
         SELECT max(c.fecha) AS fecha
         FROM mensaje_correo origen
         JOIN mensaje_correo c ON c.gmail_thread_id = origen.gmail_thread_id
         WHERE origen.id = tarea.mensaje_id
       ) ult ON true
       WHERE tarea.cot <> '10000000000' AND (tarea.cot = $1 OR $1 = ANY(tarea.cots))
       ORDER BY ult.fecha DESC NULLS LAST, tarea.creado_en DESC
       LIMIT 10`,
      [cot],
    );
  }

  private async porCliente(nombre: string): Promise<TareaBreve[]> {
    return this.tareasBreves(
      `SELECT tarea.id, tarea.cot, tarea.cliente
       FROM tarea
       LEFT JOIN LATERAL (
         SELECT max(c.fecha) AS fecha
         FROM mensaje_correo origen
         JOIN mensaje_correo c ON c.gmail_thread_id = origen.gmail_thread_id
         WHERE origen.id = tarea.mensaje_id
       ) ult ON true
       WHERE tarea.cot <> '10000000000' AND tarea.cliente ILIKE $1 ESCAPE '\\'
       ORDER BY ult.fecha DESC NULLS LAST, tarea.creado_en DESC
       LIMIT 10`,
      [comoLike(nombre)],
    );
  }

  private async tareasBreves(sql: string, valores: unknown[] = []): Promise<TareaBreve[]> {
    const filas = await this.conexiones.pg.query<TareaBreve>(sql, valores);
    return filas.rows;
  }

  private linea(tarea: { cot: string; cliente: string | null }): string {
    return `COT ${tarea.cot.split('+').join(' · ')} · ${tarea.cliente?.trim() || 'sin cliente'}`;
  }

  private async referencia(tareaId: string): Promise<{ linea: string } | null> {
    const filas = await this.conexiones.pg.query<{ cot: string; cliente: string | null }>(`SELECT cot, cliente FROM tarea WHERE id = $1`, [tareaId]);
    const tarea = filas.rows[0];
    return tarea ? { linea: this.linea(tarea) } : null;
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

function textoWhatsapp(estado: string, proceso: boolean, enLinea: boolean): string {
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
