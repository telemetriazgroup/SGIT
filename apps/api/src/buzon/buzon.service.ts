import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Configuracion } from '../configuracion';
import { Conexiones } from '../conexiones';
import { AlmacenCorreo } from './almacen';
import { cifrar, descifrar, firmarEstado } from './cifrado';
import { ALCANCE_GMAIL, INTERVALO_SYNC_MS, LOTE_SYNC, consultaRecibidos, esEnviado, type ClienteGmail, type MensajeDescargado } from './cliente-gmail';
import { canjearCodigo } from './cliente-gmail-google';
import { htmlSeguro } from './html-correo';
import { fusionar, huecos, type Intervalo } from './rangos';
import { anotarConexion } from '../conexion/bitacora';
import { TareasService } from '../tareas/tareas.service';

export type AvanceBuzon = {
  fase: 'ocioso' | 'listando' | 'importando' | 'listo' | 'error';
  total: number;
  yaTenidos: number;
  porBajar: number;
  hechos: number;
  nuevos: number;
  detalle: string;
};

type FilaBuzon = {
  id: string;
  correo: string;
  refresh_token_cifrado: string | null;
  history_id: string | null;
  ultima_sync_ok: Date | null;
  estado: string;
};

const AVANCE_QUIETO: AvanceBuzon = {
  fase: 'ocioso',
  total: 0,
  yaTenidos: 0,
  porBajar: 0,
  hechos: 0,
  nuevos: 0,
  detalle: '',
};

export class BuzonService {
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso = false;
  private readonly almacen: AlmacenCorreo;
  private importando = false;
  private ultimoError: string | null = null;
  private falloAnotado = false;
  private avance: AvanceBuzon = { ...AVANCE_QUIETO };

  constructor(
    private readonly conexiones: Conexiones,
    private readonly cliente: ClienteGmail,
    private readonly config: Configuracion,
  ) {
    this.almacen = new AlmacenCorreo(conexiones);
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.iniciarSync) return;
    if (await this.preferenciaSync()) this.arrancarSync();
  }

  onModuleDestroy(): void {
    this.detenerSync();
  }

  async fijarSyncAutomatica(activa: boolean) {
    await this.asegurarFila();
    await this.conexiones.pg.query(`UPDATE buzon SET sync_automatica = $1`, [activa]);
    if (activa) this.arrancarSync();
    else this.detenerSync();
    return this.resumen();
  }

  async reiniciarSync() {
    await this.asegurarFila();
    await this.conexiones.pg.query(`UPDATE buzon SET sync_automatica = true`);
    this.ultimoError = null;
    if (this.enCurso) {
      await anotarConexion(this.conexiones.pg, 'gmail', 'info', 'Ya hay una sincronización en curso. Sigue de 5 en 5, sin abrir otra.');
      return this.resumen();
    }
    this.detenerSync();
    void anotarConexion(this.conexiones.pg, 'gmail', 'info', 'Reinicio pedido desde la web. La sincronización sigue de 5 en 5.');
    this.arrancarSync();
    return this.resumen();
  }

  async resumen() {
    const fila = await this.fila();
    const cuentas = await this.contarEstados();
    const enLinea = this.gmailEnLinea(fila);
    return {
      correo: this.config.gmail?.correo ?? 'telemetria@zgroup.com.pe',
      conectado: Boolean(fila?.refresh_token_cifrado),
      clavesListas: Boolean(this.config.gmail),
      estado: fila?.estado ?? 'sin_conectar',
      enLinea,
      detalle: this.textoGmail(fila, enLinea),
      ultimaSync: fila?.ultima_sync_ok ?? null,
      guardados: cuentas.guardados,
      conversaciones: cuentas.conversaciones,
      completos: cuentas.completos,
      incompletos: cuentas.incompletos,
      syncAutomatica: this.temporizador !== null,
      intervaloMinutos: INTERVALO_SYNC_MS / 60000,
      avance: this.avance,
    };
  }

  enlaceOAuth(): string {
    const gmail = this.config.gmail;
    if (!gmail) {
      throw new BadRequestException('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.');
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', gmail.clientId);
    url.searchParams.set('redirect_uri', gmail.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ALCANCE_GMAIL);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('login_hint', gmail.correo);
    url.searchParams.set('state', firmarEstado(this.config.sesionSecreto));
    return url.toString();
  }

  async completarOAuth(correoAutorizado: string, refreshToken: string): Promise<void> {
    const esperado = (this.config.gmail?.correo ?? '').toLowerCase();
    if (correoAutorizado.toLowerCase() !== esperado) {
      throw new BadRequestException(
        `Se autorizó ${correoAutorizado}. La casilla definida es ${esperado}. Entra con esa cuenta.`,
      );
    }
    const id = randomUUID();
    await this.conexiones.pg.query(
      `INSERT INTO buzon (id, correo, refresh_token_cifrado, estado)
       VALUES ($1, $2, $3, 'conectado')
       ON CONFLICT (correo) DO UPDATE
         SET refresh_token_cifrado = EXCLUDED.refresh_token_cifrado,
             estado = 'conectado'`,
      [id, esperado, cifrar(refreshToken, this.config.claveCifrado)],
    );
  }

  async cambiarCodigo(code: string): Promise<void> {
    const canje = await canjearCodigo(this.config, code);
    await this.completarOAuth(canje.correo, canje.refreshToken);
  }

  async importarRango(desde: Date, hasta: Date): Promise<AvanceBuzon> {
    await this.exigirConectado();
    await this.asegurarFila();
    if (desde > hasta) throw new BadRequestException('La fecha inicial es posterior a la final.');
    if (this.importando) throw new BadRequestException('Ya hay una importación en curso.');
    this.importando = true;
    try {
      const resultado = await this.bajarRango(desde, hasta);
      this.avance = resultado;
      return resultado;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'La importación se cortó.';
      this.avance = { ...this.avance, fase: 'error', detalle: mensaje };
      throw error;
    } finally {
      this.importando = false;
    }
  }

  async sincronizarReciente(): Promise<void> {
    try {
      await this.reintentarIncompletos();
      const historyId = await this.leerHistory();
      if (!historyId) {
        await this.reponerDesdeUltimo();
        return;
      }
      try {
        const cambios = await this.cliente.historial(historyId);
        const faltantes = [];
        for (const id of cambios.ids) {
          if (!(await this.esCompleto(id))) faltantes.push(id);
        }
        await this.enTandas(faltantes, async (id) => {
          const mensaje = await this.leerSiExiste(id);
          if (!mensaje || esEnviado(mensaje.etiquetas)) return;
          await this.guardar(mensaje);
        });
        await this.guardarHistory(cambios.historyId);
        await this.marcarSyncOk();
      } catch (error) {
        if (!historyRechazado(error)) throw error;
        await this.reponerDesdeUltimo();
      }
    } finally {
      await this.procesarLoNuevo();
    }
  }

  async listarMensajes(pagina = 1, tamano = 25, busqueda = '') {
    const hoja = Math.max(1, pagina);
    const limite = Math.min(50, Math.max(1, tamano));
    const texto = busqueda.trim();
    const filtro = `%${texto}%`;
    const donde = texto
      ? `WHERE asunto ILIKE $1 OR de ILIKE $1 OR para ILIKE $1 OR cc ILIKE $1`
      : '';
    const parametros: unknown[] = texto ? [filtro] : [];
    const total = await this.conexiones.pg.query<{ total: string }>(
      `SELECT count(DISTINCT gmail_thread_id)::text AS total FROM mensaje_correo ${donde}`,
      parametros,
    );
    const cantidad = Number(total.rows[0]?.total ?? 0);
    const paginas = Math.max(1, Math.ceil(cantidad / limite));
    const actual = Math.min(hoja, paginas);
    const limiteParam = parametros.length + 1;
    const offsetParam = parametros.length + 2;
    const resultado = await this.conexiones.pg.query<{
      id: string;
      asunto: string;
      de: string;
      fecha: Date | null;
      replica: string;
      mensajes: number;
      extracto: string;
    }>(
      `WITH hilos AS (
         SELECT DISTINCT gmail_thread_id
         FROM mensaje_correo
         ${donde}
       )
       SELECT u.id, u.asunto, u.de, u.fecha, u.replica, u.mensajes, u.extracto
       FROM hilos h
       JOIN LATERAL (
         SELECT id, de, fecha, replica,
                first_value(asunto) OVER (ORDER BY fecha ASC NULLS LAST, creado_en ASC) AS asunto,
                count(*) OVER ()::int AS mensajes,
                left(regexp_replace(coalesce(texto, ''), '[[:space:]]+', ' ', 'g'), 180) AS extracto
         FROM mensaje_correo m
         WHERE m.gmail_thread_id = h.gmail_thread_id
         ORDER BY fecha DESC NULLS LAST, creado_en DESC
         LIMIT 1
       ) u ON true
       ORDER BY u.fecha DESC NULLS LAST
       LIMIT $${limiteParam} OFFSET $${offsetParam}`,
      [...parametros, limite, (actual - 1) * limite],
    );
    return { mensajes: resultado.rows, total: cantidad, pagina: actual, paginas, tamano: limite };
  }

  async hilo(id: string) {
    const ancla = await this.detalle(id);
    if (!ancla) return null;
    const hermanos = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM mensaje_correo
       WHERE gmail_thread_id = $1
       ORDER BY fecha ASC NULLS LAST, creado_en ASC`,
      [ancla.gmail_thread_id],
    );
    const mensajes = [];
    for (const hermano of hermanos.rows) {
      const pieza = hermano.id === ancla.id ? ancla : await this.detalle(hermano.id);
      if (pieza) mensajes.push(pieza);
    }
    return { asunto: mensajes[0]?.asunto || ancla.asunto, mensajes };
  }

  async detalle(id: string) {
    const mensaje = await this.conexiones.pg.query(
      `SELECT id, gmail_message_id, gmail_thread_id, de, para, cc, fecha, asunto, html_seguro, texto, replica, clasificacion
       FROM mensaje_correo WHERE id = $1`,
      [id],
    );
    const fila = mensaje.rows[0];
    if (!fila) return null;
    const adjuntos = await this.conexiones.pg.query(
      `SELECT id, nombre, mime, tamano, tipo, estado FROM adjunto_correo WHERE mensaje_id = $1 ORDER BY nombre`,
      [id],
    );
    return { ...fila, htmlSeguro: fila.html_seguro, adjuntos: adjuntos.rows };
  }

  async leerAdjunto(id: string): Promise<{ nombre: string; mime: string; bytes: Buffer } | null> {
    const resultado = await this.conexiones.pg.query<{
      nombre: string;
      mime: string;
      clave_almacen: string | null;
      estado: string;
    }>(`SELECT nombre, mime, clave_almacen, estado FROM adjunto_correo WHERE id = $1`, [id]);
    const fila = resultado.rows[0];
    if (!fila || fila.estado !== 'listo' || !fila.clave_almacen) return null;
    return { nombre: fila.nombre, mime: fila.mime, bytes: await this.almacen.leer(fila.clave_almacen) };
  }

  async contarMensajes(): Promise<number> {
    const resultado = await this.conexiones.pg.query<{ total: string }>(`SELECT count(*)::text AS total FROM mensaje_correo`);
    return Number(resultado.rows[0]?.total ?? 0);
  }

  async leerHistoryPublico(): Promise<string | null> {
    return this.leerHistory();
  }

  private async bajarRango(desde: Date, hasta: Date): Promise<AvanceBuzon> {
    const pedido = { desde, hasta };
    const cubiertos = await this.leerRangos();
    const faltantes = huecos(pedido, cubiertos);
    const guardados = await this.contarEnRango(desde, hasta);
    const quietos = await this.contarCompletosEnRango(desde, hasta);
    if (faltantes.length === 0) {
      const recuperados = await this.reintentarIncompletosEntre(desde, hasta);
      const detalle =
        recuperados > 0
          ? `Ese rango ya estaba cargado. Se completaron ${recuperados} que habían quedado a medias.`
          : `Ese rango ya está en el archivo: ${guardados} correos. No se volvieron a descargar.`;
      await this.marcarSyncOk();
      return { fase: 'listo', total: guardados, yaTenidos: quietos, porBajar: 0, hechos: recuperados, nuevos: 0, detalle };
    }

    this.avance = {
      fase: 'listando',
      total: guardados,
      yaTenidos: quietos,
      porBajar: 0,
      hechos: 0,
      nuevos: 0,
      detalle: 'Buscando en Gmail solo los días que todavía no están guardados…',
    };
    const ya = await this.leerHistory();
    const marca = ya ?? (await this.cliente.perfil()).historyId;
    const ids = await this.listarHuecos(faltantes);
    const conocidos = await this.idsCompletos(ids);
    const pendientes = ids.filter((id) => !conocidos.has(id));
    this.avance = {
      fase: 'importando',
      total: quietos + pendientes.length,
      yaTenidos: quietos,
      porBajar: pendientes.length,
      hechos: 0,
      nuevos: 0,
      detalle:
        pendientes.length === 0
          ? `${quietos} correos ya estaban guardados y no se modifican.`
          : `0 de ${pendientes.length} por guardar. ${quietos} ya estaban y no se modifican.`,
    };

    let nuevos = 0;
    let hechos = 0;
    await this.enTandas(pendientes, async (id) => {
      const mensaje = await this.cliente.obtener(id);
      if (!esEnviado(mensaje.etiquetas)) {
        await this.guardar(mensaje);
        nuevos += 1;
      }
      hechos += 1;
      this.avance = {
        ...this.avance,
        hechos,
        nuevos,
        detalle: `${hechos} de ${pendientes.length} por guardar. ${this.avance.yaTenidos} ya estaban y no se modifican.`,
      };
    });

    const ahora = new Date();
    const hastaCubierto = pedido.hasta.getTime() > ahora.getTime() ? ahora : pedido.hasta;
    await this.cubrir(fusionar([...cubiertos, { desde: pedido.desde, hasta: hastaCubierto }]));
    if (!ya) await this.guardarHistory(marca);
    await this.marcarSyncOk();
    const detalle =
      nuevos === 0
        ? `${this.avance.yaTenidos} correos ya estaban en el archivo. No se modificaron.`
        : `Se guardaron ${nuevos} correos nuevos. ${this.avance.yaTenidos} ya estaban y quedan igual.`;
    return { ...this.avance, fase: 'listo', nuevos, detalle };
  }

  private async reponerDesdeUltimo(): Promise<void> {
    const ultima = await this.ultimaFecha();
    const desde = ultima ? new Date(ultima.getTime() - 60_000) : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const hasta = new Date(Date.now() + 60_000);
    const marca = (await this.cliente.perfil()).historyId;
    const ids = await this.listarHuecos([{ desde, hasta }]);
    const conocidos = await this.idsCompletos(ids);
    await this.enTandas(
      ids.filter((id) => !conocidos.has(id)),
      async (id) => {
        const mensaje = await this.leerSiExiste(id);
        if (!mensaje || esEnviado(mensaje.etiquetas)) return;
        await this.guardar(mensaje);
      },
    );
    await this.guardarHistory(marca);
    await this.marcarSyncOk();
  }

  private async procesarLoNuevo(): Promise<void> {
    try {
      const cuenta = await new TareasService(this.conexiones).procesarPendientes();
      if (cuenta.mensajes === 0) return;
      const marca =
        cuenta.nuevas === 1
          ? '1 cotización nueva quedó marcada para seguimiento.'
          : `${cuenta.nuevas} cotizaciones nuevas quedaron marcadas para seguimiento.`;
      await anotarConexion(this.conexiones.pg, 'gmail', 'info', `Procesé ${cuenta.mensajes} correos pendientes. ${marca}`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'falló el proceso';
      await anotarConexion(this.conexiones.pg, 'gmail', 'fallo', `No pude procesar los correos nuevos. ${mensaje}`);
    }
  }

  private async ultimaFecha(): Promise<Date | null> {
    const resultado = await this.conexiones.pg.query<{ fecha: Date | null }>(
      `SELECT max(fecha) AS fecha FROM mensaje_correo`,
    );
    return resultado.rows[0]?.fecha ?? null;
  }

  private async listarHuecos(faltantes: Intervalo[]): Promise<string[]> {
    const ids: string[] = [];
    const vistos = new Set<string>();
    for (const hueco of faltantes) {
      const consulta = consultaRecibidos(hueco.desde, hueco.hasta);
      let page: string | undefined;
      do {
        const lote = await this.cliente.listar(consulta, page);
        for (const id of lote.ids) {
          if (vistos.has(id)) continue;
          vistos.add(id);
          ids.push(id);
        }
        this.avance = {
          ...this.avance,
          detalle: `Buscando en Gmail los días que faltan… ${ids.length} encontrados.`,
        };
        page = lote.nextPageToken;
      } while (page);
    }
    return ids;
  }

  private async esCompleto(gmailId: string): Promise<boolean> {
    const resultado = await this.conexiones.pg.query<{ replica: string }>(
      `SELECT replica FROM mensaje_correo WHERE gmail_message_id = $1`,
      [gmailId],
    );
    return resultado.rows[0]?.replica === 'completo';
  }

  private async idsCompletos(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const resultado = await this.conexiones.pg.query<{ gmail_message_id: string }>(
      `SELECT gmail_message_id FROM mensaje_correo
       WHERE replica = 'completo' AND gmail_message_id = ANY($1::text[])`,
      [ids],
    );
    return new Set(resultado.rows.map((fila) => fila.gmail_message_id));
  }

  private async contarCompletosEnRango(desde: Date, hasta: Date): Promise<number> {
    const resultado = await this.conexiones.pg.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM mensaje_correo
       WHERE replica = 'completo' AND fecha >= $1 AND fecha <= $2`,
      [desde, hasta],
    );
    return Number(resultado.rows[0]?.total ?? 0);
  }

  private async contarEnRango(desde: Date, hasta: Date): Promise<number> {
    const resultado = await this.conexiones.pg.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM mensaje_correo WHERE fecha >= $1 AND fecha <= $2`,
      [desde, hasta],
    );
    return Number(resultado.rows[0]?.total ?? 0);
  }

  private async contarEstados(): Promise<{
    guardados: number;
    conversaciones: number;
    completos: number;
    incompletos: number;
  }> {
    const resultado = await this.conexiones.pg.query<{ replica: string; total: string }>(
      `SELECT replica, count(*)::text AS total FROM mensaje_correo GROUP BY replica`,
    );
    const hilos = await this.conexiones.pg.query<{ total: string }>(
      `SELECT count(DISTINCT gmail_thread_id)::text AS total FROM mensaje_correo`,
    );
    let completos = 0;
    let incompletos = 0;
    for (const fila of resultado.rows) {
      if (fila.replica === 'completo') completos = Number(fila.total);
      else incompletos += Number(fila.total);
    }
    return {
      guardados: completos + incompletos,
      conversaciones: Number(hilos.rows[0]?.total ?? 0),
      completos,
      incompletos,
    };
  }

  private async leerRangos(): Promise<Intervalo[]> {
    const resultado = await this.conexiones.pg.query<{ desde: Date; hasta: Date }>(
      `SELECT desde, hasta FROM rango_correo ORDER BY desde`,
    );
    return resultado.rows;
  }

  private async cubrir(intervalos: Intervalo[]): Promise<void> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('DELETE FROM rango_correo');
      for (const intervalo of intervalos) {
        await cliente.query(`INSERT INTO rango_correo (id, desde, hasta) VALUES ($1, $2, $3)`, [
          randomUUID(),
          intervalo.desde,
          intervalo.hasta,
        ]);
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  private async reintentarIncompletosEntre(desde: Date, hasta: Date): Promise<number> {
    const pendientes = await this.conexiones.pg.query<{ gmail_message_id: string }>(
      `SELECT gmail_message_id FROM mensaje_correo
       WHERE replica = 'incompleto' AND fecha >= $1 AND fecha <= $2`,
      [desde, hasta],
    );
    await this.enTandas(
      pendientes.rows.map((fila) => fila.gmail_message_id),
      async (id) => {
        const mensaje = await this.leerSiExiste(id);
        if (mensaje) await this.guardar(mensaje);
      },
    );
    return pendientes.rows.length;
  }

  private async guardar(mensaje: MensajeDescargado): Promise<void> {
    if (esEnviado(mensaje.etiquetas)) return;
    const previo = await this.conexiones.pg.query<{ id: string; replica: string }>(
      `SELECT id, replica FROM mensaje_correo WHERE gmail_message_id = $1`,
      [mensaje.id],
    );
    if (previo.rows[0]?.replica === 'completo') return;
    const mensajeId = previo.rows[0]?.id ?? randomUUID();
    if (!previo.rows[0]) {
      await this.conexiones.pg.query(
        `INSERT INTO mensaje_correo
          (id, gmail_message_id, gmail_thread_id, de, para, cc, fecha, asunto, html, texto, replica)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'incompleto')`,
        [
          mensajeId,
          mensaje.id,
          mensaje.threadId,
          mensaje.de,
          mensaje.para,
          mensaje.cc,
          mensaje.fecha,
          mensaje.asunto,
          mensaje.html,
          mensaje.texto,
        ],
      );
    }

    const cidAId = new Map<string, string>();
    let fallo = false;
    for (const adjunto of mensaje.adjuntos) {
      const existente = await this.conexiones.pg.query<{ id: string; estado: string }>(
        `SELECT id, estado FROM adjunto_correo WHERE mensaje_id = $1 AND gmail_attachment_id = $2`,
        [mensajeId, adjunto.attachmentId],
      );
      const adjuntoId = existente.rows[0]?.id ?? randomUUID();
      if (adjunto.contentId) cidAId.set(adjunto.contentId, adjuntoId);
      if (existente.rows[0]?.estado === 'listo') continue;
      try {
        const bytes = await this.cliente.adjunto(mensaje.id, adjunto.attachmentId);
        const clave = `correo/${mensajeId}/${adjuntoId}`;
        await this.almacen.guardar(clave, bytes, adjunto.mime);
        await this.upsertAdjunto(adjuntoId, mensajeId, adjunto, clave, 'listo');
      } catch {
        fallo = true;
        await this.upsertAdjunto(adjuntoId, mensajeId, adjunto, null, 'fallo');
      }
    }

    const seguro = htmlSeguro(mensaje.html, (cid) => {
      const id = cidAId.get(cid);
      return id ? `/buzon/adjuntos/${id}` : null;
    });
    await this.conexiones.pg.query(
      `UPDATE mensaje_correo SET html_seguro = $2, replica = $3 WHERE id = $1`,
      [mensajeId, seguro, fallo ? 'incompleto' : 'completo'],
    );
  }

  private async upsertAdjunto(
    id: string,
    mensajeId: string,
    adjunto: MensajeDescargado['adjuntos'][number],
    clave: string | null,
    estado: string,
  ): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO adjunto_correo
        (id, mensaje_id, gmail_attachment_id, content_id, nombre, mime, tamano, clave_almacen, tipo, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (mensaje_id, gmail_attachment_id) DO UPDATE
         SET clave_almacen = EXCLUDED.clave_almacen,
             estado = EXCLUDED.estado,
             content_id = EXCLUDED.content_id`,
      [
        id,
        mensajeId,
        adjunto.attachmentId,
        adjunto.contentId,
        adjunto.nombre,
        adjunto.mime,
        adjunto.tamano,
        clave,
        adjunto.inline ? 'inline' : 'archivo',
        estado,
      ],
    );
  }

  private async enTandas(ids: string[], trabajo: (id: string) => Promise<void>): Promise<void> {
    for (let inicio = 0; inicio < ids.length; inicio += LOTE_SYNC) {
      await Promise.all(ids.slice(inicio, inicio + LOTE_SYNC).map((id) => trabajo(id)));
    }
  }

  private async leerSiExiste(id: string): Promise<MensajeDescargado | null> {
    try {
      return await this.cliente.obtener(id);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : '';
      if (mensaje.includes('Gmail 404')) return null;
      throw error;
    }
  }

  private async reintentarIncompletos(): Promise<void> {
    const pendientes = await this.conexiones.pg.query<{ gmail_message_id: string }>(
      `SELECT gmail_message_id FROM mensaje_correo WHERE replica = 'incompleto'`,
    );
    await this.enTandas(
      pendientes.rows.map((fila) => fila.gmail_message_id),
      async (id) => {
        const mensaje = await this.leerSiExiste(id);
        if (!mensaje) {
          await this.conexiones.pg.query(`UPDATE mensaje_correo SET replica = 'ausente' WHERE gmail_message_id = $1 AND replica = 'incompleto'`, [id]);
          return;
        }
        await this.guardar(mensaje);
      },
    );
  }

  private arrancarSync(): void {
    if (this.temporizador || !this.config.iniciarSync) return;
    const correr = () => {
      if (this.enCurso) return;
      this.enCurso = true;
      void this.sincronizarReciente()
        .then(() => {
          if (!this.falloAnotado) return;
          this.falloAnotado = false;
          void anotarConexion(this.conexiones.pg, 'gmail', 'info', 'Sincronización al día.');
        })
        .catch((error: unknown) => {
          const mensaje = error instanceof Error ? error.message : 'falló la sync';
          this.ultimoError = mensaje.slice(0, 180);
          this.falloAnotado = true;
          void anotarConexion(this.conexiones.pg, 'gmail', 'fallo', `La sincronización falló. ${mensaje}`);
          console.error(`Sync reciente: ${mensaje}`);
        })
        .finally(() => {
          this.enCurso = false;
        });
    };
    correr();
    this.temporizador = setInterval(correr, INTERVALO_SYNC_MS);
    this.temporizador.unref?.();
    void anotarConexion(this.conexiones.pg, 'gmail', 'info', 'Sincronización automática en marcha, de 5 en 5, cada 3 minutos.');
  }

  private detenerSync(): void {
    if (!this.temporizador) return;
    clearInterval(this.temporizador);
    this.temporizador = null;
  }

  private async preferenciaSync(): Promise<boolean> {
    try {
      const resultado = await this.conexiones.pg.query<{ sync_automatica: boolean }>(
        `SELECT sync_automatica FROM buzon ORDER BY creado_en LIMIT 1`,
      );
      return resultado.rows[0]?.sync_automatica ?? true;
    } catch (error) {
      const codigo = (error as { code?: string }).code;
      if (codigo === '42703') return true;
      throw error;
    }
  }

  private async asegurarFila(): Promise<void> {
    if (await this.fila()) return;
    await this.conexiones.pg.query(`INSERT INTO buzon (id, correo, estado) VALUES ($1, $2, 'conectado')`, [
      randomUUID(),
      this.config.gmail?.correo ?? 'telemetria@zgroup.com.pe',
    ]);
  }

  private async exigirConectado(): Promise<void> {
    const fila = await this.fila();
    if (!fila?.refresh_token_cifrado && !reemplazoActivo()) {
      throw new BadRequestException('El buzón todavía no está conectado.');
    }
  }

  private async fila(): Promise<FilaBuzon | null> {
    const resultado = await this.conexiones.pg.query<FilaBuzon>(
      `SELECT id, correo, refresh_token_cifrado, history_id, ultima_sync_ok, estado
       FROM buzon ORDER BY creado_en LIMIT 1`,
    );
    return resultado.rows[0] ?? null;
  }

  private async leerHistory(): Promise<string | null> {
    return (await this.fila())?.history_id ?? null;
  }

  private async guardarHistory(historyId: string): Promise<void> {
    await this.conexiones.pg.query(`UPDATE buzon SET history_id = $1, estado = 'conectado'`, [historyId]);
  }

  private async marcarSyncOk(): Promise<void> {
    this.ultimoError = null;
    await this.conexiones.pg.query(`UPDATE buzon SET ultima_sync_ok = now(), estado = 'conectado'`);
  }

  private gmailEnLinea(fila: FilaBuzon | null): boolean {
    if (!fila?.refresh_token_cifrado || this.temporizador === null || this.ultimoError || !fila.ultima_sync_ok) return false;
    const edad = Date.now() - new Date(fila.ultima_sync_ok).getTime();
    return edad < INTERVALO_SYNC_MS * 2 + 60_000;
  }

  private textoGmail(fila: FilaBuzon | null, enLinea: boolean): string {
    if (!fila?.refresh_token_cifrado) return 'Gmail no está conectado.';
    if (this.temporizador === null) return 'La sincronización está en pausa.';
    if (this.ultimoError) return this.ultimoError;
    if (!fila.ultima_sync_ok) return 'Todavía no hay una sync correcta.';
    if (!enLinea) return 'La última sync correcta ya no es reciente.';
    return 'Sincronización al día.';
  }
}

function historyRechazado(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : '';
  return mensaje.includes('start_history_id') || mensaje.includes('startHistoryId');
}

function reemplazoActivo(): boolean {
  return process.env.GMAIL_DOBLE === '1';
}

export async function refreshGuardado(conexiones: Conexiones, secreto: string): Promise<string> {
  const resultado = await conexiones.pg.query<{ refresh_token_cifrado: string | null }>(
    `SELECT refresh_token_cifrado FROM buzon ORDER BY creado_en LIMIT 1`,
  );
  const cifrado = resultado.rows[0]?.refresh_token_cifrado;
  if (!cifrado) throw new Error('gmail_sin_conectar');
  return descifrar(cifrado, secreto);
}
