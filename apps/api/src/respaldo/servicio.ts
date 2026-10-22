import { randomUUID } from 'crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AlmacenCorreo } from '../buzon/almacen';
import { fusionar } from '../buzon/rangos';
import type { Conexiones } from '../conexiones';
import {
  NOMBRE_PARTIDA,
  borrarCarpeta,
  carpetaPartida,
  carpetaTemporal,
  desempaquetar,
  directorioDatos,
  empaquetar,
  esPartida,
  leerJson,
  rutaPartida,
  textoPartida,
  type ManifiestoPartida,
} from './paquete';
import {
  nombreParte,
  partir,
  type AdjuntoExportado,
  type ParteAdjuntos,
  type ParteClasificacion,
  type ParteMensajes,
  type TareaExportada,
} from './partes';

const TOPE_MENSAJE = 4_500_000;
const TOPE_ADJUNTO = 4_000_000;

type Resumen = {
  mensajes: number;
  partesMensajes: number;
  bytesMensajes: number;
  adjuntos: number;
  partesAdjuntos: number;
  bytesAdjuntos: number;
  tareas: number;
  internos: number;
  diccionario: number;
};

type FasePartida = 'ocioso' | 'extrayendo' | 'importando' | 'listo' | 'error';

export class RespaldoServicio {
  private readonly almacen: AlmacenCorreo;
  private corriendo = false;
  private asimilacion: { fase: FasePartida; texto: string } = { fase: 'ocioso', texto: '' };

  constructor(private readonly conexiones: Conexiones) {
    this.almacen = new AlmacenCorreo(conexiones);
  }

  async resumen(): Promise<Resumen> {
    const mensajes = await this.piezasMensaje();
    const adjuntos = await this.piezasAdjunto();
    const cuentas = await this.conexiones.pg.query<{ tareas: string; internos: string; diccionario: string }>(
      `SELECT
         (SELECT count(*) FROM tarea)::text AS tareas,
         (SELECT count(*) FROM asunto_interno)::text AS internos,
         (SELECT count(*) FROM termino_diccionario)::text AS diccionario`,
    );
    const fila = cuentas.rows[0];
    return {
      mensajes: mensajes.length,
      partesMensajes: partir(mensajes, TOPE_MENSAJE, 12).length,
      bytesMensajes: mensajes.reduce((suma, pieza) => suma + pieza.peso, 0),
      adjuntos: adjuntos.length,
      partesAdjuntos: partir(adjuntos, TOPE_ADJUNTO, 150).length,
      bytesAdjuntos: adjuntos.reduce((suma, pieza) => suma + pieza.peso, 0),
      tareas: Number(fila?.tareas ?? 0),
      internos: Number(fila?.internos ?? 0),
      diccionario: Number(fila?.diccionario ?? 0),
    };
  }

  async mensajes(parte: number): Promise<{ nombre: string; cuerpo: ParteMensajes }> {
    const piezas = await this.piezasMensaje();
    const grupos = partir(piezas, TOPE_MENSAJE, 12);
    const ids = grupos[parte - 1];
    if (!ids) throw new NotFoundException('Esa parte de correos no existe.');
    const filas = await this.conexiones.pg.query<{
      id: string;
      gmail_message_id: string;
      gmail_thread_id: string;
      de: string;
      para: string;
      cc: string;
      fecha: Date | null;
      asunto: string;
      html: string;
      texto: string;
      html_seguro: string;
      replica: string;
      clasificacion: string | null;
      extraccion: unknown;
    }>(
      `SELECT id, gmail_message_id, gmail_thread_id, de, para, cc, fecha, asunto, html, texto, html_seguro, replica, clasificacion, extraccion
       FROM mensaje_correo WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const porId = new Map(filas.rows.map((fila) => [fila.id, fila]));
    return {
      nombre: nombreParte('mensajes', parte),
      cuerpo: {
        version: 1,
        tipo: 'mensajes',
        parte,
        partes: grupos.length,
        mensajes: ids.flatMap((id) => {
          const fila = porId.get(id);
          if (!fila) return [];
          return [{
            id: fila.id,
            gmailMensajeId: fila.gmail_message_id,
            gmailHiloId: fila.gmail_thread_id,
            de: fila.de,
            para: fila.para,
            cc: fila.cc,
            fecha: fila.fecha ? fila.fecha.toISOString() : null,
            asunto: fila.asunto,
            html: fila.html,
            texto: fila.texto,
            htmlSeguro: fila.html_seguro,
            replica: fila.replica,
            clasificacion: fila.clasificacion,
            extraccion: fila.extraccion,
          }];
        }),
      },
    };
  }

  async adjuntos(parte: number): Promise<{ nombre: string; cuerpo: ParteAdjuntos }> {
    const grupos = await this.gruposAdjunto();
    const ids = grupos[parte - 1];
    if (!ids) throw new NotFoundException('Esa parte de adjuntos no existe.');
    const filas = await this.filasAdjunto(ids);
    const grande = ids.length === 1 && (filas[0]?.tamano ?? 0) > TOPE_ADJUNTO;
    const adjuntos: AdjuntoExportado[] = [];
    for (const fila of filas) {
      const base = this.metaAdjunto(fila);
      if (grande) {
        adjuntos.push({ ...base, archivo: nombreParte('adjuntos', parte, 'bin') });
        continue;
      }
      if (!fila.clave_almacen || fila.estado !== 'listo') {
        adjuntos.push(base);
        continue;
      }
      try {
        const bytes = await this.almacen.leer(fila.clave_almacen);
        adjuntos.push({ ...base, contenido: bytes.toString('base64') });
      } catch {
        adjuntos.push(base);
      }
    }
    return {
      nombre: nombreParte('adjuntos', parte),
      cuerpo: { version: 1, tipo: 'adjuntos', parte, partes: grupos.length, adjuntos },
    };
  }

  async archivoAdjunto(parte: number): Promise<{ nombre: string; mime: string; bytes: Buffer }> {
    const grupos = await this.gruposAdjunto();
    const ids = grupos[parte - 1];
    const filas = ids?.length === 1 ? await this.filasAdjunto(ids) : [];
    const fila = filas[0];
    if (!fila || fila.tamano <= TOPE_ADJUNTO || !fila.clave_almacen) throw new NotFoundException('Esa parte no tiene un archivo suelto.');
    const bytes = await this.almacen.leer(fila.clave_almacen);
    return { nombre: nombreParte('adjuntos', parte, 'bin'), mime: fila.mime || 'application/octet-stream', bytes };
  }

  async clasificacion(): Promise<ParteClasificacion> {
    const diccionario = await this.conexiones.pg.query<{ termino: string; activo: boolean }>(
      `SELECT termino, activo FROM termino_diccionario ORDER BY termino`,
    );
    const decisiones = await this.conexiones.pg.query<{ gmail_thread_id: string; destino: string; motivo: string }>(
      `SELECT gmail_thread_id, destino, motivo FROM decision_hilo ORDER BY gmail_thread_id`,
    );
    const internos = await this.conexiones.pg.query<{ gmail_thread_id: string; estado: string; respuesta: string }>(
      `SELECT gmail_thread_id, estado, respuesta FROM asunto_interno ORDER BY gmail_thread_id`,
    );
    const tareas = await this.conexiones.pg.query<Record<string, unknown>>(
      `SELECT t.id, t.cot, t.estado, t.ticket, t.descripcion, t.lugar, t.cliente, t.cantidad, t.temperatura, t.producto, t.contenedor,
              t.comercial_nombre, t.comercial_cargo, t.comercial_correo, t.comercial_telefono,
              t.cita_fecha::text AS cita_fecha, t.cita_hora, t.cita_direccion, t.cita_mapa,
              t.cita_parcial_fecha::text AS cita_parcial_fecha, t.cita_parcial_hora, t.fragmentos,
              m.gmail_message_id, t.cots, t.referencias, t.campos_corregidos, t.responsable_correo, t.responsable_nombre,
              t.recordar_en, t.codigo_equipo, t.maquina_equipo, t.campana, p.cot AS padre_cot
       FROM tarea t
       LEFT JOIN mensaje_correo m ON m.id = t.mensaje_id
       LEFT JOIN tarea p ON p.id = t.padre_id
       ORDER BY t.campana DESC, t.cot`,
    );
    const situaciones = await this.conexiones.pg.query<{
      id: string;
      cot: string;
      gmail_message_id: string;
      tipo: string;
      resumen: string;
      cita_anterior: unknown;
      cita_nueva: unknown;
    }>(
      `SELECT s.id, t.cot, m.gmail_message_id, s.tipo, s.resumen, s.cita_anterior, s.cita_nueva
       FROM situacion_hilo s
       JOIN tarea t ON t.id = s.tarea_id
       JOIN mensaje_correo m ON m.id = s.mensaje_id
       ORDER BY s.creado_en`,
    );
    const habilitados = await this.conexiones.pg.query<{ clase: string; clave: string }>(
      `SELECT clase, clave FROM habilitado ORDER BY clase, clave`,
    );
    return {
      version: 1,
      tipo: 'clasificacion',
      diccionario: diccionario.rows,
      decisiones: decisiones.rows.map((fila) => ({ gmailHiloId: fila.gmail_thread_id, destino: fila.destino, motivo: fila.motivo })),
      internos: internos.rows.map((fila) => ({ gmailHiloId: fila.gmail_thread_id, estado: fila.estado, respuesta: fila.respuesta })),
      tareas: tareas.rows.map((fila) => ({
        id: String(fila.id),
        cot: String(fila.cot),
        estado: String(fila.estado),
        ticket: texto(fila.ticket),
        descripcion: texto(fila.descripcion),
        lugar: texto(fila.lugar),
        cliente: texto(fila.cliente),
        cantidad: fila.cantidad == null ? null : Number(fila.cantidad),
        temperatura: texto(fila.temperatura),
        producto: texto(fila.producto),
        contenedor: texto(fila.contenedor),
        comercialNombre: texto(fila.comercial_nombre),
        comercialCargo: texto(fila.comercial_cargo),
        comercialCorreo: texto(fila.comercial_correo),
        comercialTelefono: texto(fila.comercial_telefono),
        citaFecha: texto(fila.cita_fecha),
        citaHora: texto(fila.cita_hora),
        citaDireccion: texto(fila.cita_direccion),
        citaMapa: texto(fila.cita_mapa),
        citaParcialFecha: texto(fila.cita_parcial_fecha),
        citaParcialHora: texto(fila.cita_parcial_hora),
        fragmentos: fila.fragmentos ?? {},
        gmailMensajeId: texto(fila.gmail_message_id),
        cots: lista(fila.cots),
        referencias: lista(fila.referencias),
        camposCorregidos: lista(fila.campos_corregidos),
        responsableCorreo: texto(fila.responsable_correo),
        responsableNombre: texto(fila.responsable_nombre),
        recordarEn: fila.recordar_en instanceof Date ? fila.recordar_en.toISOString() : texto(fila.recordar_en),
        codigoEquipo: texto(fila.codigo_equipo),
        maquinaEquipo: texto(fila.maquina_equipo),
        campana: Boolean(fila.campana),
        padreCot: texto(fila.padre_cot),
      })),
      situaciones: situaciones.rows.map((fila) => ({
        id: fila.id,
        cot: fila.cot,
        gmailMensajeId: fila.gmail_message_id,
        tipo: fila.tipo,
        resumen: fila.resumen,
        citaAnterior: fila.cita_anterior,
        citaNueva: fila.cita_nueva,
      })),
      habilitados: habilitados.rows,
    };
  }

  async importar(dato: unknown): Promise<string> {
    if (!dato || typeof dato !== 'object' || (dato as { version?: number }).version !== 1) {
      throw new BadRequestException('El archivo no es un respaldo de SGIT.');
    }
    const tipo = (dato as { tipo?: string }).tipo;
    if (tipo === 'mensajes') return this.importarMensajes(dato as ParteMensajes);
    if (tipo === 'adjuntos') return this.importarAdjuntos(dato as ParteAdjuntos);
    if (tipo === 'clasificacion') return this.importarClasificacion(dato as ParteClasificacion);
    throw new BadRequestException('Ese archivo no es de correos ni de la clasificación.');
  }

  async estadoPartida(): Promise<{ presente: boolean; ruta: string; nombre: string; manifiesto: null; texto: string; fase: FasePartida; bytes: number }> {
    const ruta = rutaPartida();
    const info = await stat(ruta).catch((error: unknown) => {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    });
    const bytes = info?.size ?? 0;
    if (this.asimilacion.fase !== 'ocioso') {
      return { presente: Boolean(info), ruta, nombre: NOMBRE_PARTIDA, manifiesto: null, texto: this.asimilacion.texto, fase: this.asimilacion.fase, bytes };
    }
    if (!info) {
      return { presente: false, ruta, nombre: NOMBRE_PARTIDA, manifiesto: null, texto: 'Todavía no hay una partida en el servidor.', fase: 'ocioso', bytes: 0 };
    }
    return {
      presente: true,
      ruta,
      nombre: NOMBRE_PARTIDA,
      manifiesto: null,
      texto: `Partida en el servidor (${tamanoLegible(bytes)}). Pulsa Asimilar. Se abre en el servidor y puedes dejar esta pantalla.`,
      fase: 'ocioso',
      bytes,
    };
  }

  async crearPartida(): Promise<{ ruta: string; nombre: string; manifiesto: ManifiestoPartida; texto: string }> {
    const carpeta = await carpetaTemporal();
    try {
      await mkdir(path.join(carpeta, 'correos'), { recursive: true });
      const manifiesto = await this.manifiesto();
      await writeFile(path.join(carpeta, 'manifiesto.json'), JSON.stringify(manifiesto));
      await writeFile(path.join(carpeta, 'clasificacion.json'), JSON.stringify(await this.clasificacion()));
      await writeFile(path.join(carpeta, 'chips.json'), JSON.stringify(await this.exportarChips()));
      await writeFile(path.join(carpeta, 'modems.json'), JSON.stringify(await this.exportarModems()));
      const mensajes = await this.piezasMensaje();
      const gruposMensaje = partir(mensajes, TOPE_MENSAJE, 12);
      for (let indice = 0; indice < gruposMensaje.length; indice += 1) {
        const parte = await this.mensajes(indice + 1);
        await writeFile(path.join(carpeta, 'correos', parte.nombre), JSON.stringify(parte.cuerpo));
      }
      const gruposAdjunto = await this.gruposAdjunto();
      for (let indice = 0; indice < gruposAdjunto.length; indice += 1) {
        const parte = await this.adjuntos(indice + 1);
        await writeFile(path.join(carpeta, 'correos', parte.nombre), JSON.stringify(parte.cuerpo));
        if (parte.cuerpo.adjuntos.some((adjunto) => adjunto.archivo)) {
          const suelto = await this.archivoAdjunto(indice + 1);
          await writeFile(path.join(carpeta, 'correos', suelto.nombre), suelto.bytes);
        }
      }
      await mkdir(directorioDatos(), { recursive: true });
      const destino = rutaPartida();
      await empaquetar(carpeta, destino);
      return { ruta: destino, nombre: NOMBRE_PARTIDA, manifiesto, texto: textoPartida(manifiesto) };
    } finally {
      await borrarCarpeta(carpeta);
    }
  }

  async asimilarPartida(): Promise<string> {
    if (this.corriendo) return this.asimilacion.texto;
    this.corriendo = true;
    let info: { size: number } | null = null;
    try {
      info = await stat(rutaPartida());
    } catch (error: unknown) {
      this.corriendo = false;
      if ((error as { code?: string }).code === 'ENOENT') {
        throw new BadRequestException('No hay una partida de SGIT en el servidor. Copia sgit-partida.tar.gz a la carpeta de datos.');
      }
      throw error;
    }
    if (!info) {
      this.corriendo = false;
      throw new BadRequestException('No hay una partida de SGIT en el servidor. Copia sgit-partida.tar.gz a la carpeta de datos.');
    }
    const aviso = `Estoy abriendo la partida (${tamanoLegible(info.size)}). Puedes dejar esta pantalla; sigue en el servidor.`;
    this.asimilacion = { fase: 'extrayendo', texto: aviso };
    void this.correrAsimilacion().catch((error: unknown) => {
      this.asimilacion = { fase: 'error', texto: error instanceof Error ? error.message : 'No se pudo asimilar la partida.' };
      this.corriendo = false;
    });
    return aviso;
  }

  private async correrAsimilacion(): Promise<void> {
    const ruta = rutaPartida();
    const carpeta = carpetaPartida();
    const marca = path.join(carpeta, '.extraida');
    try {
      const extraida = await stat(marca).then(() => true).catch(() => false);
      if (!extraida) {
        await borrarCarpeta(carpeta);
        await mkdir(carpeta, { recursive: true });
        await desempaquetar(ruta, carpeta);
        await writeFile(marca, new Date().toISOString());
      }
      const leido = await leerJson<unknown>(path.join(carpeta, 'manifiesto.json'));
      if (!esPartida(leido)) throw new BadRequestException('Ese archivo no es una partida de SGIT.');
      const correos = path.join(carpeta, 'correos');
      const nombres = await nombresDe(correos);
      const mensajes = nombres.filter((item) => item.includes('mensajes') && item.endsWith('.json'));
      const adjuntos = nombres.filter((item) => item.includes('adjuntos') && item.endsWith('.json'));
      this.asimilacion = { fase: 'importando', texto: 'Estoy guardando los correos.' };
      for (let indice = 0; indice < mensajes.length; indice += 1) {
        this.asimilacion = { fase: 'importando', texto: `Estoy guardando correos, parte ${indice + 1} de ${mensajes.length}.` };
        await this.importarMensajes(await leerJson<ParteMensajes>(dentro(correos, mensajes[indice] ?? '')));
      }
      for (let indice = 0; indice < adjuntos.length; indice += 1) {
        this.asimilacion = { fase: 'importando', texto: `Estoy guardando adjuntos, parte ${indice + 1} de ${adjuntos.length}.` };
        const parte = await leerJson<ParteAdjuntos>(dentro(correos, adjuntos[indice] ?? ''));
        await this.importarAdjuntos(parte);
        const conArchivo = (parte.adjuntos ?? []).filter((adjunto) => adjunto.archivo);
        for (let archivo = 0; archivo < conArchivo.length; archivo += 1) {
          const adjunto = conArchivo[archivo];
          if (!adjunto?.archivo) continue;
          if (archivo % 20 === 0) {
            this.asimilacion = { fase: 'importando', texto: `Estoy guardando adjuntos, parte ${indice + 1} de ${adjuntos.length}, archivo ${archivo + 1} de ${conArchivo.length}.` };
          }
          const bytes = await readFile(dentro(correos, adjunto.archivo));
          await this.guardarArchivo({
            mensaje: adjunto.gmailMensajeId,
            adjunto: adjunto.gmailAdjuntoId,
            nombre: adjunto.nombre || adjunto.archivo,
            mime: adjunto.mime || 'application/octet-stream',
            tipo: adjunto.tipo || 'archivo',
            contentId: adjunto.contentId || '',
          }, bytes);
        }
      }
      this.asimilacion = { fase: 'importando', texto: 'Estoy guardando la clasificación, los chips y el M2M.' };
      await this.importarClasificacion(await leerJson<ParteClasificacion>(path.join(carpeta, 'clasificacion.json')));
      await this.importarChips(await leerSiExiste(path.join(carpeta, 'chips.json'), { chips: [] }));
      await this.importarModems(await leerSiExiste(path.join(carpeta, 'modems.json'), { modems: [], movimientos: [] }));
      await this.cubrirRangos(leido.correos.rangos);
      this.asimilacion = { fase: 'listo', texto: textoPartida(leido, true) };
      await borrarCarpeta(carpeta).catch(() => undefined);
    } finally {
      this.corriendo = false;
    }
  }

  async guardarArchivo(encabezado: { mensaje: string; adjunto: string; nombre: string; mime: string; tipo: string; contentId: string }, bytes: Buffer): Promise<string> {
    if (!encabezado.mensaje || !encabezado.adjunto) throw new BadRequestException('Falta el correo o el adjunto de ese archivo.');
    const mensaje = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM mensaje_correo WHERE gmail_message_id = $1`,
      [encabezado.mensaje],
    );
    const mensajeId = mensaje.rows[0]?.id;
    if (!mensajeId) throw new BadRequestException('Ese archivo pertenece a un correo que todavía no se subió.');
    const id = await this.asegurarAdjunto(mensajeId, {
      id: randomUUID(),
      gmailMensajeId: encabezado.mensaje,
      gmailAdjuntoId: encabezado.adjunto,
      contentId: encabezado.contentId || null,
      nombre: encabezado.nombre || 'archivo',
      mime: encabezado.mime || 'application/octet-stream',
      tamano: bytes.length,
      tipo: encabezado.tipo || 'archivo',
      estado: 'listo',
      clave: null,
    });
    const clave = `correo/${mensajeId}/${id}`;
    await this.almacen.guardar(clave, bytes, encabezado.mime || 'application/octet-stream');
    await this.conexiones.pg.query(
      `UPDATE adjunto_correo SET clave_almacen = $2, estado = 'listo', tamano = $3, mime = $4, nombre = $5 WHERE id = $1`,
      [id, clave, bytes.length, encabezado.mime || 'application/octet-stream', encabezado.nombre || 'archivo'],
    );
    return 'El archivo quedó guardado con su correo.';
  }

  private async importarMensajes(parte: ParteMensajes): Promise<string> {
    const mensajes = Array.isArray(parte.mensajes) ? parte.mensajes : [];
    let puestos = 0;
    for (const mensaje of mensajes) {
      if (!mensaje?.gmailMensajeId) continue;
      const valores = [
        mensaje.id || randomUUID(),
        mensaje.gmailMensajeId,
        mensaje.gmailHiloId || '',
        mensaje.de || '',
        mensaje.para || '',
        mensaje.cc || '',
        mensaje.fecha,
        mensaje.asunto || '',
        mensaje.html || '',
        mensaje.texto || '',
        mensaje.htmlSeguro || '',
        mensaje.replica || 'completo',
        mensaje.clasificacion,
        JSON.stringify(mensaje.extraccion ?? null),
      ];
      await this.conexiones.pg.query(
        `INSERT INTO mensaje_correo
          (id, gmail_message_id, gmail_thread_id, de, para, cc, fecha, asunto, html, texto, html_seguro, replica, clasificacion, extraccion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         ON CONFLICT (gmail_message_id) DO UPDATE SET
           gmail_thread_id = EXCLUDED.gmail_thread_id,
           de = EXCLUDED.de, para = EXCLUDED.para, cc = EXCLUDED.cc, fecha = EXCLUDED.fecha, asunto = EXCLUDED.asunto,
           html = EXCLUDED.html, texto = EXCLUDED.texto, html_seguro = EXCLUDED.html_seguro, replica = EXCLUDED.replica,
           clasificacion = EXCLUDED.clasificacion, extraccion = EXCLUDED.extraccion`,
        valores,
      );
      puestos += 1;
    }
    return `Quedaron ${puestos} correos de la parte ${parte.parte || ''}.`.trim();
  }

  private async importarAdjuntos(parte: ParteAdjuntos): Promise<string> {
    const adjuntos = Array.isArray(parte.adjuntos) ? parte.adjuntos : [];
    let puestos = 0;
    let sinCorreo = 0;
    let sinArchivo = 0;
    for (const adjunto of adjuntos) {
      if (!adjunto?.gmailMensajeId || !adjunto.gmailAdjuntoId) continue;
      const mensaje = await this.conexiones.pg.query<{ id: string }>(
        `SELECT id FROM mensaje_correo WHERE gmail_message_id = $1`,
        [adjunto.gmailMensajeId],
      );
      const mensajeId = mensaje.rows[0]?.id;
      if (!mensajeId) {
        sinCorreo += 1;
        continue;
      }
      const id = await this.asegurarAdjunto(mensajeId, adjunto);
      if (adjunto.contenido) {
        const bytes = Buffer.from(adjunto.contenido, 'base64');
        const clave = adjunto.clave || `correo/${mensajeId}/${id}`;
        await this.almacen.guardar(clave, bytes, adjunto.mime || 'application/octet-stream');
        await this.conexiones.pg.query(
          `UPDATE adjunto_correo SET clave_almacen = $2, estado = 'listo', tamano = $3 WHERE id = $1`,
          [id, clave, bytes.length],
        );
      } else if (adjunto.archivo) sinArchivo += 1;
      puestos += 1;
    }
    const faltan = [
      sinCorreo ? `${sinCorreo} sin su correo` : '',
      sinArchivo ? `${sinArchivo} esperan el archivo grande` : '',
    ].filter(Boolean);
    return `Quedaron ${puestos} adjuntos.${faltan.length ? ` ${faltan.join('. ')}.` : ''}`;
  }

  private async importarClasificacion(parte: ParteClasificacion): Promise<string> {
    for (const termino of parte.diccionario ?? []) {
      const nombre = termino.termino?.trim().toLowerCase();
      if (!nombre) continue;
      await this.conexiones.pg.query(
        `INSERT INTO termino_diccionario (id, termino, activo) VALUES ($1, $2, $3)
         ON CONFLICT (termino) DO UPDATE SET activo = EXCLUDED.activo`,
        [randomUUID(), nombre, termino.activo !== false],
      );
    }
    for (const decision of parte.decisiones ?? []) {
      if (!decision.gmailHiloId || !decision.destino) continue;
      await this.conexiones.pg.query(
        `INSERT INTO decision_hilo (gmail_thread_id, destino, motivo) VALUES ($1, $2, $3)
         ON CONFLICT (gmail_thread_id) DO UPDATE SET destino = EXCLUDED.destino, motivo = EXCLUDED.motivo, actualizado_en = now()`,
        [decision.gmailHiloId, decision.destino, decision.motivo || ''],
      );
    }
    for (const interno of parte.internos ?? []) {
      if (!interno.gmailHiloId) continue;
      await this.conexiones.pg.query(
        `INSERT INTO asunto_interno (gmail_thread_id, estado, respuesta) VALUES ($1, $2, $3)
         ON CONFLICT (gmail_thread_id) DO UPDATE SET estado = EXCLUDED.estado, respuesta = EXCLUDED.respuesta, actualizado_en = now()`,
        [interno.gmailHiloId, interno.estado || 'por_atender', interno.respuesta || ''],
      );
    }
    const padres = new Map<string, string>();
    for (const tarea of ordenarTareas(parte.tareas ?? [])) {
      const id = await this.guardarTarea(tarea);
      padres.set(tarea.cot, id);
    }
    for (const tarea of parte.tareas ?? []) {
      if (!tarea.padreCot) continue;
      const padre = padres.get(tarea.padreCot) ?? (await this.idDeCot(tarea.padreCot));
      const propia = padres.get(tarea.cot);
      if (padre && propia) await this.conexiones.pg.query(`UPDATE tarea SET padre_id = $2 WHERE id = $1`, [propia, padre]);
    }
    let situaciones = 0;
    for (const situacion of parte.situaciones ?? []) {
      const tareaId = await this.idDeCot(situacion.cot);
      const mensaje = await this.conexiones.pg.query<{ id: string }>(
        `SELECT id FROM mensaje_correo WHERE gmail_message_id = $1`,
        [situacion.gmailMensajeId],
      );
      const mensajeId = mensaje.rows[0]?.id;
      if (!tareaId || !mensajeId) continue;
      await this.conexiones.pg.query(
        `INSERT INTO situacion_hilo (id, tarea_id, mensaje_id, tipo, resumen, cita_anterior, cita_nueva)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         ON CONFLICT (mensaje_id) DO UPDATE SET tipo = EXCLUDED.tipo, resumen = EXCLUDED.resumen, cita_anterior = EXCLUDED.cita_anterior, cita_nueva = EXCLUDED.cita_nueva`,
        [situacion.id || randomUUID(), tareaId, mensajeId, situacion.tipo, situacion.resumen || '', JSON.stringify(situacion.citaAnterior ?? null), JSON.stringify(situacion.citaNueva ?? null)],
      );
      situaciones += 1;
    }
    for (const marca of parte.habilitados ?? []) {
      if (!marca.clase || !marca.clave) continue;
      await this.conexiones.pg.query(
        `INSERT INTO habilitado (clase, clave) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [marca.clase, marca.clave],
      );
    }
    return `Quedó la clasificación: ${parte.tareas?.length ?? 0} tareas, ${parte.internos?.length ?? 0} asuntos internos y ${situaciones} situaciones de correo.`;
  }

  private async guardarTarea(tarea: TareaExportada): Promise<string> {
    const mensaje = tarea.gmailMensajeId
      ? await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM mensaje_correo WHERE gmail_message_id = $1`, [tarea.gmailMensajeId])
      : { rows: [] as Array<{ id: string }> };
    const valores = [
      tarea.id || randomUUID(),
      tarea.cot,
      tarea.estado || 'detectada',
      tarea.ticket,
      tarea.descripcion,
      tarea.lugar,
      tarea.cliente,
      tarea.cantidad,
      tarea.temperatura,
      tarea.producto,
      tarea.contenedor,
      tarea.comercialNombre,
      tarea.comercialCargo,
      tarea.comercialCorreo,
      tarea.comercialTelefono,
      tarea.citaFecha,
      tarea.citaHora,
      tarea.citaDireccion,
      tarea.citaMapa,
      tarea.citaParcialFecha,
      tarea.citaParcialHora,
      JSON.stringify(tarea.fragmentos ?? {}),
      mensaje.rows[0]?.id ?? null,
      tarea.cots ?? [],
      tarea.referencias ?? [],
      tarea.camposCorregidos ?? [],
      tarea.responsableCorreo,
      tarea.responsableNombre,
      tarea.recordarEn,
      tarea.codigoEquipo,
      tarea.maquinaEquipo,
      Boolean(tarea.campana),
    ];
    const puesta = await this.conexiones.pg.query<{ id: string }>(
      `INSERT INTO tarea (
         id, cot, estado, ticket, descripcion, lugar, cliente, cantidad, temperatura, producto, contenedor,
         comercial_nombre, comercial_cargo, comercial_correo, comercial_telefono,
         cita_fecha, cita_hora, cita_direccion, cita_mapa, cita_parcial_fecha, cita_parcial_hora, fragmentos, mensaje_id,
         cots, referencias, campos_corregidos, responsable_correo, responsable_nombre, recordar_en, codigo_equipo, maquina_equipo, campana
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
       )
       ON CONFLICT (cot) DO UPDATE SET
         estado = EXCLUDED.estado, ticket = EXCLUDED.ticket, descripcion = EXCLUDED.descripcion, lugar = EXCLUDED.lugar,
         cliente = EXCLUDED.cliente, cantidad = EXCLUDED.cantidad, temperatura = EXCLUDED.temperatura, producto = EXCLUDED.producto,
         contenedor = EXCLUDED.contenedor, comercial_nombre = EXCLUDED.comercial_nombre, comercial_cargo = EXCLUDED.comercial_cargo,
         comercial_correo = EXCLUDED.comercial_correo, comercial_telefono = EXCLUDED.comercial_telefono,
         cita_fecha = EXCLUDED.cita_fecha, cita_hora = EXCLUDED.cita_hora, cita_direccion = EXCLUDED.cita_direccion, cita_mapa = EXCLUDED.cita_mapa,
         cita_parcial_fecha = EXCLUDED.cita_parcial_fecha, cita_parcial_hora = EXCLUDED.cita_parcial_hora, fragmentos = EXCLUDED.fragmentos,
         mensaje_id = COALESCE(EXCLUDED.mensaje_id, tarea.mensaje_id), cots = EXCLUDED.cots, referencias = EXCLUDED.referencias,
         campos_corregidos = EXCLUDED.campos_corregidos, responsable_correo = EXCLUDED.responsable_correo,
         responsable_nombre = EXCLUDED.responsable_nombre, recordar_en = EXCLUDED.recordar_en, codigo_equipo = EXCLUDED.codigo_equipo,
         maquina_equipo = EXCLUDED.maquina_equipo, campana = EXCLUDED.campana
       RETURNING id`,
      valores,
    );
    return puesta.rows[0].id;
  }

  private async asegurarAdjunto(mensajeId: string, adjunto: AdjuntoExportado): Promise<string> {
    const previa = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM adjunto_correo WHERE mensaje_id = $1 AND gmail_attachment_id = $2`,
      [mensajeId, adjunto.gmailAdjuntoId],
    );
    if (previa.rows[0]) return previa.rows[0].id;
    const id = adjunto.id || randomUUID();
    await this.conexiones.pg.query(
      `INSERT INTO adjunto_correo
        (id, mensaje_id, gmail_attachment_id, content_id, nombre, mime, tamano, clave_almacen, tipo, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9)
       ON CONFLICT (mensaje_id, gmail_attachment_id) DO NOTHING`,
      [id, mensajeId, adjunto.gmailAdjuntoId, adjunto.contentId, adjunto.nombre || 'archivo', adjunto.mime || 'application/octet-stream', adjunto.tamano || 0, adjunto.tipo || 'archivo', 'pendiente'],
    );
    const puesta = await this.conexiones.pg.query<{ id: string }>(
      `SELECT id FROM adjunto_correo WHERE mensaje_id = $1 AND gmail_attachment_id = $2`,
      [mensajeId, adjunto.gmailAdjuntoId],
    );
    return puesta.rows[0].id;
  }

  private async idDeCot(cot: string): Promise<string | null> {
    const fila = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM tarea WHERE cot = $1`, [cot]);
    return fila.rows[0]?.id ?? null;
  }

  private async manifiesto(): Promise<ManifiestoPartida> {
    const correos = await this.conexiones.pg.query<{ desde: Date | null; hasta: Date | null; cantidad: string }>(
      `SELECT min(fecha) AS desde, max(fecha) AS hasta, count(*)::text AS cantidad FROM mensaje_correo`,
    );
    const rangos = await this.conexiones.pg.query<{ desde: Date; hasta: Date }>(
      `SELECT desde, hasta FROM rango_correo ORDER BY desde`,
    );
    const clases = await this.conexiones.pg.query<{ clasificacion: string | null; total: string }>(
      `SELECT clasificacion, count(*)::text AS total FROM mensaje_correo GROUP BY clasificacion`,
    );
    const cuentas = await this.conexiones.pg.query<{ tareas: string; diccionario: string; chips: string; modems: string }>(
      `SELECT
         (SELECT count(*) FROM tarea)::text AS tareas,
         (SELECT count(*) FROM termino_diccionario)::text AS diccionario,
         (SELECT count(*) FROM chip)::text AS chips,
         (SELECT count(*) FROM modem)::text AS modems`,
    );
    const correo = correos.rows[0];
    const cuenta = cuentas.rows[0];
    const numero = (clase: string) => Number(clases.rows.find((fila) => fila.clasificacion === clase)?.total ?? 0);
    const intervalos = rangos.rows.length > 0
      ? rangos.rows.map((fila) => ({ desde: fila.desde.toISOString(), hasta: fila.hasta.toISOString() }))
      : correo?.desde && correo.hasta
        ? [{ desde: correo.desde.toISOString(), hasta: correo.hasta.toISOString() }]
        : [];
    return {
      version: 1,
      tipo: 'partida',
      generadoEn: new Date().toISOString(),
      correos: {
        desde: correo?.desde ? correo.desde.toISOString() : null,
        hasta: correo?.hasta ? correo.hasta.toISOString() : null,
        cantidad: Number(correo?.cantidad ?? 0),
        rangos: intervalos,
      },
      clasificacion: {
        tareasProcesadas: Number(cuenta?.tareas ?? 0),
        diccionario: Number(cuenta?.diccionario ?? 0),
        tarea: numero('evento_desarrollo'),
        asuntoInterno: numero('interna'),
        otros: numero('otros'),
      },
      chips: Number(cuenta?.chips ?? 0),
      modems: Number(cuenta?.modems ?? 0),
    };
  }

  private async exportarChips(): Promise<{ version: 1; tipo: 'chips'; chips: Array<Record<string, unknown>> }> {
    const filas = await this.conexiones.pg.query(
      `SELECT producto, marca, imei, celular, archivado, estado, telemetria, orden_mo, ocupado_en
       FROM chip ORDER BY imei`,
    );
    return { version: 1, tipo: 'chips', chips: filas.rows };
  }

  private async exportarModems(): Promise<{ version: 1; tipo: 'modems'; modems: Array<Record<string, unknown>>; movimientos: Array<Record<string, unknown>> }> {
    const modems = await this.conexiones.pg.query(
      `SELECT odoo_id, serie, producto, estado, orden_mo, chip, salida, cantidad, ocupado_en
       FROM modem ORDER BY serie`,
    );
    const movimientos = await this.conexiones.pg.query(
      `SELECT m.serie, v.odoo_linea, v.cuando, v.referencia, v.desde, v.hacia, v.cantidad, v.estado
       FROM modem_movimiento v
       JOIN modem m ON m.id = v.modem_id
       ORDER BY m.serie, v.odoo_linea`,
    );
    return { version: 1, tipo: 'modems', modems: modems.rows, movimientos: movimientos.rows };
  }

  private async importarChips(dato: { chips?: Array<Record<string, unknown>> }): Promise<void> {
    for (const chip of dato.chips ?? []) {
      const imei = texto(chip.imei);
      if (!imei) continue;
      await ignorarDuplicado(this.conexiones.pg.query(
        `INSERT INTO chip (id, producto, marca, imei, celular, archivado, estado, telemetria, orden_mo, ocupado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (imei) DO UPDATE SET
           producto = EXCLUDED.producto, marca = EXCLUDED.marca, celular = EXCLUDED.celular, archivado = EXCLUDED.archivado,
           estado = EXCLUDED.estado, telemetria = EXCLUDED.telemetria, orden_mo = EXCLUDED.orden_mo, ocupado_en = EXCLUDED.ocupado_en`,
        [
          randomUUID(),
          texto(chip.producto) || '',
          texto(chip.marca) || '',
          imei,
          texto(chip.celular) || '',
          Boolean(chip.archivado),
          texto(chip.estado) || 'sin_dato',
          texto(chip.telemetria) || '',
          texto(chip.orden_mo) || '',
          momento(chip.ocupado_en),
        ],
      ));
    }
  }

  private async importarModems(dato: { modems?: Array<Record<string, unknown>>; movimientos?: Array<Record<string, unknown>> }): Promise<void> {
    for (const modem of dato.modems ?? []) {
      const serie = texto(modem.serie);
      const odooId = Number(modem.odoo_id);
      if (!serie || !Number.isInteger(odooId)) continue;
      const cantidad = Number(modem.cantidad);
      await ignorarDuplicado(this.conexiones.pg.query(
        `INSERT INTO modem (id, odoo_id, serie, producto, estado, orden_mo, chip, salida, cantidad, ocupado_en, leido_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (serie) DO UPDATE SET
           odoo_id = EXCLUDED.odoo_id, producto = EXCLUDED.producto, estado = EXCLUDED.estado, orden_mo = EXCLUDED.orden_mo,
           chip = EXCLUDED.chip, salida = EXCLUDED.salida, cantidad = EXCLUDED.cantidad, ocupado_en = EXCLUDED.ocupado_en, leido_en = now()`,
        [
          randomUUID(),
          odooId,
          serie,
          texto(modem.producto) || '',
          texto(modem.estado) || 'disponible',
          texto(modem.orden_mo) || '',
          texto(modem.chip) || '',
          texto(modem.salida) || '',
          Number.isFinite(cantidad) ? cantidad : 0,
          momento(modem.ocupado_en),
        ],
      ));
    }
    for (const movimiento of dato.movimientos ?? []) {
      const serie = texto(movimiento.serie);
      const linea = Number(movimiento.odoo_linea);
      if (!serie || !Number.isInteger(linea)) continue;
      const modem = await this.conexiones.pg.query<{ id: string }>(`SELECT id FROM modem WHERE serie = $1`, [serie]);
      const modemId = modem.rows[0]?.id;
      if (!modemId) continue;
      await this.conexiones.pg.query(
        `INSERT INTO modem_movimiento (id, modem_id, odoo_linea, cuando, referencia, desde, hacia, cantidad, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (odoo_linea) DO NOTHING`,
        [
          randomUUID(),
          modemId,
          linea,
          movimiento.cuando ?? null,
          texto(movimiento.referencia) || '',
          texto(movimiento.desde) || '',
          texto(movimiento.hacia) || '',
          movimiento.cantidad == null ? null : Number(movimiento.cantidad),
          texto(movimiento.estado) || '',
        ],
      );
    }
  }

  private async cubrirRangos(rangos: Array<{ desde: string; hasta: string }>): Promise<void> {
    const actuales = await this.conexiones.pg.query<{ desde: Date; hasta: Date }>(`SELECT desde, hasta FROM rango_correo`);
    const llegados = rangos.flatMap((rango) => {
      const desde = new Date(rango.desde);
      const hasta = new Date(rango.hasta);
      return Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) ? [] : [{ desde, hasta }];
    });
    const fusionados = fusionar([...actuales.rows, ...llegados]);
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('DELETE FROM rango_correo');
      for (const intervalo of fusionados) {
        await cliente.query(`INSERT INTO rango_correo (id, desde, hasta) VALUES ($1, $2, $3)`, [randomUUID(), intervalo.desde, intervalo.hasta]);
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  private async piezasMensaje(): Promise<Array<{ id: string; peso: number }>> {
    const filas = await this.conexiones.pg.query<{ id: string; peso: string }>(
      `SELECT id, (octet_length(html) + octet_length(texto) + octet_length(html_seguro))::text AS peso
       FROM mensaje_correo ORDER BY fecha NULLS LAST, id`,
    );
    return filas.rows.map((fila) => ({ id: fila.id, peso: Number(fila.peso) }));
  }

  private async piezasAdjunto(): Promise<Array<{ id: string; peso: number }>> {
    const filas = await this.conexiones.pg.query<{ id: string; peso: number }>(
      `SELECT id, tamano AS peso FROM adjunto_correo ORDER BY id`,
    );
    return filas.rows.map((fila) => ({ id: fila.id, peso: Number(fila.peso) || 0 }));
  }

  private async gruposAdjunto(): Promise<string[][]> {
    return partir(await this.piezasAdjunto(), TOPE_ADJUNTO, 150);
  }

  private async filasAdjunto(ids: string[]): Promise<Array<{
    id: string;
    gmail_message_id: string;
    gmail_attachment_id: string;
    content_id: string | null;
    nombre: string;
    mime: string;
    tamano: number;
    clave_almacen: string | null;
    tipo: string;
    estado: string;
  }>> {
    const filas = await this.conexiones.pg.query<{
      id: string;
      gmail_message_id: string;
      gmail_attachment_id: string;
      content_id: string | null;
      nombre: string;
      mime: string;
      tamano: number;
      clave_almacen: string | null;
      tipo: string;
      estado: string;
    }>(
      `SELECT a.id, m.gmail_message_id, a.gmail_attachment_id, a.content_id, a.nombre, a.mime, a.tamano, a.clave_almacen, a.tipo, a.estado
       FROM adjunto_correo a JOIN mensaje_correo m ON m.id = a.mensaje_id
       WHERE a.id = ANY($1::uuid[])`,
      [ids],
    );
    const porId = new Map(filas.rows.map((fila) => [fila.id, fila]));
    return ids.flatMap((id) => {
      const fila = porId.get(id);
      return fila ? [fila] : [];
    });
  }

  private metaAdjunto(fila: {
    id: string;
    gmail_message_id: string;
    gmail_attachment_id: string;
    content_id: string | null;
    nombre: string;
    mime: string;
    tamano: number;
    clave_almacen: string | null;
    tipo: string;
    estado: string;
  }): AdjuntoExportado {
    return {
      id: fila.id,
      gmailMensajeId: fila.gmail_message_id,
      gmailAdjuntoId: fila.gmail_attachment_id,
      contentId: fila.content_id,
      nombre: fila.nombre,
      mime: fila.mime,
      tamano: fila.tamano,
      tipo: fila.tipo,
      estado: fila.estado,
      clave: fila.clave_almacen,
    };
  }
}

function tamanoLegible(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function ordenarTareas(tareas: TareaExportada[]): TareaExportada[] {
  return [...tareas].sort((a, b) => Number(Boolean(a.padreCot)) - Number(Boolean(b.padreCot)));
}

function texto(valor: unknown): string | null {
  if (valor == null || valor === '') return null;
  return String(valor);
}

function lista(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map(String) : [];
}

async function nombresDe(carpeta: string): Promise<string[]> {
  try {
    return (await readdir(carpeta)).sort();
  } catch {
    return [];
  }
}

function dentro(base: string, relativo: string): string {
  const destino = path.resolve(base, relativo);
  const raiz = path.resolve(base);
  if (destino !== raiz && !destino.startsWith(`${raiz}${path.sep}`)) {
    throw new BadRequestException('La partida trae un archivo fuera de su carpeta.');
  }
  return destino;
}

async function leerSiExiste<T>(archivo: string, vacio: T): Promise<T> {
  try {
    return await leerJson<T>(archivo);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return vacio;
    throw error;
  }
}

function momento(valor: unknown): string | null {
  if (valor instanceof Date) return valor.toISOString();
  const textoValor = texto(valor);
  if (!textoValor) return null;
  return Number.isNaN(new Date(textoValor).getTime()) ? null : textoValor;
}

async function ignorarDuplicado(consulta: Promise<unknown>): Promise<void> {
  try {
    await consulta;
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
  }
}
