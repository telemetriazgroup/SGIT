import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Conexiones } from '../conexiones';
import { leerConfiguracion } from '../configuracion';
import { asuntoRegistro, htmlFichaConductor, leerRegistro, mensajeWhatsappRegistro, textoRegistro } from './ficha-registro';
import { candidatosTelefono, htmlRegistro, leerReferencia, listaDe, momentoCorreo, MOTIVO_REFERENCIA_COLA, MOTIVO_YA_ENVIADO, NOMBRE_REGISTRO_CONDUCTORES, repetirReferencia, separarCorreos, telefonoSalida, telefonoValido, TOPE_SALIDA } from './reglas';

export type FilaWhatsapp = {
  id: string;
  telefono: string;
  cuerpo: string;
  contacto: string;
  aviso: string | null;
  escribioEn: string | null;
  creadoEn: string;
};

export type FilaCorreo = {
  id: string;
  direccion: string;
  copia: string;
  copiaOculta: string;
  asunto: string;
  cuerpo: string;
  estado: string;
  error: string | null;
  noEnviarAntes: string | null;
  enviadoEn: string | null;
  creadoEn: string;
};

export type CasillaSalida = { correo: string; conectado: boolean };

export type PiezaWhatsapp = { telefono?: string; mensaje?: string; cuerpo?: string; contacto?: string; referencia?: string };
export type PiezaCorreo = {
  direccion?: string;
  para?: string;
  copia?: string;
  cc?: string;
  copiaOculta?: string;
  cco?: string;
  bcc?: string;
  asunto?: string;
  cuerpo?: string;
  html?: string;
};

export type ResultadoWhatsapp = { id: string; telefono: string; estado: 'en_cola' | 'en_espera' | 'ya_enviado' | 'rechazado'; aviso: string | null; motivo?: string };
export type ResultadoCorreo = { id: string; direccion: string; estado: 'en_cola' | 'en_espera' | 'rechazado'; noEnviarAntes: string | null; motivo?: string };

export class SalidaService {
  constructor(private readonly conexiones: Conexiones) {}

  async registros(busqueda = ''): Promise<{ whatsapp: FilaWhatsapp[]; correos: FilaCorreo[]; casilla: CasillaSalida }> {
    const q = busqueda.trim().slice(0, 80);
    const whatsapp = await this.conexiones.pg.query<{
      id: string;
      telefono: string;
      cuerpo: string;
      contacto: string;
      aviso: string | null;
      escribio_en: Date | null;
      creado_en: Date;
    }>(
      `SELECT s.id, s.telefono, s.cuerpo, s.contacto, a.estado AS aviso, s.creado_en,
              (SELECT max(m.creado_en) FROM mensaje_whatsapp m WHERE m.telefono = s.telefono AND m.direccion = 'recibido') AS escribio_en
       FROM salida_whatsapp s
       LEFT JOIN aviso a ON a.id = s.aviso_id
       WHERE $1 = ''
          OR s.telefono ILIKE '%' || $1 || '%'
          OR s.contacto ILIKE '%' || $1 || '%'
          OR s.cuerpo ILIKE '%' || $1 || '%'
       ORDER BY s.creado_en DESC
       LIMIT 200`,
      [q],
    );
    const correos = await this.conexiones.pg.query<{
      id: string;
      direccion: string;
      copia: string;
      copia_oculta: string;
      asunto: string;
      cuerpo: string;
      estado: string;
      error: string | null;
      no_enviar_antes: Date;
      enviado_en: Date | null;
      creado_en: Date;
    }>(
      `SELECT id, direccion, copia, copia_oculta, asunto, cuerpo, estado, error, no_enviar_antes, enviado_en, creado_en
       FROM salida_correo
       WHERE $1 = ''
          OR direccion ILIKE '%' || $1 || '%'
          OR copia ILIKE '%' || $1 || '%'
          OR copia_oculta ILIKE '%' || $1 || '%'
          OR asunto ILIKE '%' || $1 || '%'
          OR cuerpo ILIKE '%' || $1 || '%'
       ORDER BY creado_en DESC
       LIMIT 200`,
      [q],
    );
    const casilla = await this.casilla();
    return {
      whatsapp: whatsapp.rows.map((fila) => ({
        id: fila.id,
        telefono: fila.telefono,
        cuerpo: fila.cuerpo,
        contacto: fila.contacto,
        aviso: fila.aviso,
        escribioEn: fila.escribio_en ? new Date(fila.escribio_en).toISOString() : null,
        creadoEn: new Date(fila.creado_en).toISOString(),
      })),
      correos: correos.rows.map((fila) => ({
        id: fila.id,
        direccion: fila.direccion,
        copia: fila.copia ?? '',
        copiaOculta: fila.copia_oculta ?? '',
        asunto: fila.asunto,
        cuerpo: fila.cuerpo,
        estado: fila.estado,
        error: fila.error,
        noEnviarAntes: fila.no_enviar_antes ? new Date(fila.no_enviar_antes).toISOString() : null,
        enviadoEn: fila.enviado_en ? new Date(fila.enviado_en).toISOString() : null,
        creadoEn: new Date(fila.creado_en).toISOString(),
      })),
      casilla,
    };
  }

  private async casilla(): Promise<CasillaSalida> {
    const config = leerConfiguracion();
    const filas = await this.conexiones.pg.query<{ correo: string; conectado: boolean }>(
      `SELECT correo, refresh_token_cifrado IS NOT NULL AS conectado
       FROM buzon
       ORDER BY creado_en
       LIMIT 1`,
    );
    const fila = filas.rows[0];
    return {
      correo: fila?.correo || config.gmail?.correo || '',
      conectado: Boolean(fila?.conectado),
    };
  }

  async cambiarContacto(id: string, contacto: string): Promise<void> {
    const numero = telefonoSalida(contacto);
    if (!telefonoValido(numero)) throw new BadRequestException('El número de la comercial tiene entre 8 y 15 dígitos.');
    const resultado = await this.conexiones.pg.query(`UPDATE salida_whatsapp SET contacto = $2 WHERE id = $1`, [id, numero]);
    if (resultado.rowCount === 0) throw new NotFoundException('Ese número ya no está en la lista.');
  }

  async quitarWhatsapp(id: string): Promise<void> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      const filas = await cliente.query<{ aviso_id: string | null }>(`SELECT aviso_id FROM salida_whatsapp WHERE id = $1 FOR UPDATE`, [id]);
      const fila = filas.rows[0];
      if (!fila) throw new NotFoundException('Ese número ya no está en la lista.');
      const avisoId = fila.aviso_id;
      if (avisoId) {
        await cliente.query(
          `UPDATE aviso SET estado = 'cerrado', ultimo_error = $2 WHERE id = $1 AND estado = 'pendiente'`,
          [avisoId, 'Quitado desde la administración antes de salir.'],
        );
      }
      await cliente.query(`DELETE FROM salida_whatsapp WHERE id = $1`, [id]);
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async recibir(
    cuerpo: { whatsapp?: PiezaWhatsapp | PiezaWhatsapp[]; correo?: PiezaCorreo | PiezaCorreo[]; correos?: PiezaCorreo | PiezaCorreo[] },
    opciones?: { htmlObligatorio?: boolean; remitenteNombre?: string },
  ): Promise<{ whatsapp: ResultadoWhatsapp[]; correos: ResultadoCorreo[] }> {
    const whatsapp = listaDe(cuerpo.whatsapp);
    const correos = [...listaDe(cuerpo.correo), ...listaDe(cuerpo.correos)];
    if (whatsapp.length === 0 && correos.length === 0) throw new BadRequestException('Indica un WhatsApp o un correo.');
    if (whatsapp.length > TOPE_SALIDA || correos.length > TOPE_SALIDA) throw new BadRequestException(`El máximo es ${TOPE_SALIDA} mensajes por envío.`);
    return {
      whatsapp: await this.encolarWhatsapp(whatsapp),
      correos: await this.encolarCorreos(correos, opciones),
    };
  }

  async recibirRegistro(cuerpo: {
    whatsapp?: PiezaWhatsapp | PiezaWhatsapp[];
    correo?: PiezaCorreo | PiezaCorreo[];
    correos?: PiezaCorreo | PiezaCorreo[];
    registro?: unknown;
  }): Promise<{ whatsapp: ResultadoWhatsapp[]; correos: ResultadoCorreo[] }> {
    const whatsapp = listaDe(cuerpo.whatsapp);
    const correos = [...listaDe(cuerpo.correo), ...listaDe(cuerpo.correos)];
    if (whatsapp.length === 0 && correos.length === 0) throw new BadRequestException('Indica un WhatsApp o un correo.');
    if (whatsapp.length > TOPE_SALIDA || correos.length > TOPE_SALIDA) throw new BadRequestException(`El máximo es ${TOPE_SALIDA} mensajes por envío.`);
    const leido = leerRegistro(cuerpo.registro);
    if ('error' in leido) {
      return {
        whatsapp: whatsapp.map((pieza) => ({
          id: '',
          telefono: telefonoSalida(pieza.telefono ?? ''),
          estado: 'rechazado',
          aviso: null,
          motivo: leido.error,
        })),
        correos: correos.map((pieza) => ({
          id: '',
          direccion: pieza.direccion ?? pieza.para ?? '',
          estado: 'rechazado',
          noEnviarAntes: null,
          motivo: leido.error,
        })),
      };
    }
    const ficha = leido.ficha;
    return this.recibir(
      {
        whatsapp: whatsapp.map((pieza) => ({
          telefono: pieza.telefono,
          contacto: pieza.contacto,
          mensaje: mensajeWhatsappRegistro(ficha),
          referencia: pieza.referencia,
        })),
        correo: correos.map((pieza) => ({
          direccion: pieza.direccion,
          para: pieza.para,
          copia: pieza.copia,
          cc: pieza.cc,
          copiaOculta: pieza.copiaOculta,
          cco: pieza.cco,
          bcc: pieza.bcc,
          asunto: (pieza.asunto ?? '').trim() || asuntoRegistro(ficha),
          cuerpo: textoRegistro(ficha),
          html: htmlFichaConductor(ficha),
        })),
      },
      { htmlObligatorio: true, remitenteNombre: NOMBRE_REGISTRO_CONDUCTORES },
    );
  }

  private async encolarWhatsapp(piezas: PiezaWhatsapp[]): Promise<ResultadoWhatsapp[]> {
    const salida: ResultadoWhatsapp[] = [];
    for (const pieza of piezas) {
      const telefono = telefonoSalida(pieza.telefono ?? '');
      const contacto = telefonoSalida(pieza.contacto ?? '');
      const mensaje = (pieza.mensaje ?? pieza.cuerpo ?? '').trim();
      if (!telefonoValido(telefono)) {
        salida.push({ id: '', telefono, estado: 'rechazado', aviso: null, motivo: 'El teléfono tiene entre 8 y 15 dígitos.' });
        continue;
      }
      if (!telefonoValido(contacto)) {
        salida.push({ id: '', telefono, estado: 'rechazado', aviso: null, motivo: 'Falta el número al que debe contactarse.' });
        continue;
      }
      if (!mensaje || mensaje.length > 4000) {
        salida.push({ id: '', telefono, estado: 'rechazado', aviso: null, motivo: 'El mensaje es obligatorio y llega hasta 4000 caracteres.' });
        continue;
      }
      const referencia = leerReferencia(pieza.referencia);
      if (referencia.motivo) {
        salida.push({ id: '', telefono, estado: 'rechazado', aviso: null, motivo: referencia.motivo });
        continue;
      }
      const puesto = await this.guardarWhatsapp(telefono, mensaje, contacto, referencia.referencia);
      salida.push(puesto);
    }
    return salida;
  }

  private async guardarWhatsapp(telefono: string, mensaje: string, contacto: string, referencia = ''): Promise<ResultadoWhatsapp> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      if (referencia) {
        const misma = await cliente.query<{ id: string; estado: string; enviado_en: Date | null; salida_id: string | null }>(
          `SELECT a.id, a.estado, a.enviado_en, s.id AS salida_id
           FROM aviso a
           LEFT JOIN salida_whatsapp s ON s.aviso_id = a.id
           WHERE a.referencia = $1
           ORDER BY a.creado_en DESC
           LIMIT 1
           FOR UPDATE OF a`,
          [referencia],
        );
        const repetido = repetirReferencia(misma.rows[0]?.estado ?? null, misma.rows[0]?.enviado_en ?? null, new Date());
        if (repetido === 'en_espera') {
          await cliente.query('COMMIT');
          return { id: misma.rows[0]?.salida_id ?? '', telefono, estado: 'en_espera', aviso: 'pendiente', motivo: MOTIVO_REFERENCIA_COLA };
        }
        if (repetido === 'ya_enviado') {
          await cliente.query('COMMIT');
          return { id: misma.rows[0]?.salida_id ?? '', telefono, estado: 'ya_enviado', aviso: 'enviado', motivo: MOTIVO_YA_ENVIADO };
        }
      }
      const previo = await cliente.query<{ id: string; aviso: string | null }>(
        `SELECT s.id, a.estado AS aviso
         FROM salida_whatsapp s
         LEFT JOIN aviso a ON a.id = s.aviso_id
         WHERE s.telefono = ANY($1::text[])
         ORDER BY s.creado_en DESC
         FOR UPDATE OF s`,
        [candidatosTelefono(telefono)],
      );
      const pendientes = previo.rows.filter((fila) => fila.aviso === 'pendiente');
      const tope = referencia.startsWith('zdry:') ? 2 : 1;
      if (pendientes.length >= tope) {
        await cliente.query('COMMIT');
        return {
          id: pendientes[0]?.id ?? '',
          telefono,
          estado: 'en_espera',
          aviso: 'pendiente',
          motivo: 'Ese número todavía tiene un mensaje sin salir. Cuando salga, se puede cargar otro.',
        };
      }
      const id = randomUUID();
      const avisoId = randomUUID();
      await cliente.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes, referencia)
         VALUES ($1, 'salida', NULL, $2, $3, 'pendiente', now(), $4)`,
        [avisoId, telefono, mensaje, referencia],
      );
      await cliente.query(
        `INSERT INTO salida_whatsapp (id, telefono, cuerpo, contacto, aviso_id) VALUES ($1, $2, $3, $4, $5)`,
        [id, telefono, mensaje, contacto, avisoId],
      );
      await cliente.query('COMMIT');
      return { id, telefono, estado: 'en_cola', aviso: 'pendiente' };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async estado(referencias: string[]): Promise<Array<{ referencia: string; estado: string; enviadoEn: string | null; motivo: string }>> {
    const lista = [...new Set(referencias.map((item) => leerReferencia(item).referencia).filter(Boolean))].slice(0, 30);
    if (!lista.length) return [];
    const filas = await this.conexiones.pg.query<{ referencia: string; estado: string; enviado_en: Date | null; ultimo_error: string | null }>(
      `SELECT DISTINCT ON (referencia) referencia, estado, enviado_en, ultimo_error
       FROM aviso
       WHERE referencia = ANY($1::text[])
       ORDER BY referencia, creado_en DESC`,
      [lista],
    );
    return filas.rows.map((fila) => ({
      referencia: fila.referencia,
      estado: fila.estado,
      enviadoEn: fila.enviado_en ? new Date(fila.enviado_en).toISOString() : null,
      motivo: (fila.ultimo_error ?? '').slice(0, 300),
    }));
  }

  private async encolarCorreos(piezas: PiezaCorreo[], opciones?: { htmlObligatorio?: boolean; remitenteNombre?: string }): Promise<ResultadoCorreo[]> {
    const salida: ResultadoCorreo[] = [];
    let cursor = await this.ultimoCorreo();
    const remitente = opciones?.htmlObligatorio ? (opciones.remitenteNombre ?? '').trim() : '';
    for (const pieza of piezas) {
      const destinos = leerDestinos(pieza);
      const direccion = destinos.direccion;
      if (destinos.motivo) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: destinos.motivo });
        continue;
      }
      const asunto = (pieza.asunto ?? '').trim();
      const texto = (pieza.cuerpo ?? '').trim();
      if (!asunto || asunto.length > 180) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: 'El asunto es obligatorio y llega hasta 180 caracteres.' });
        continue;
      }
      if (!texto || texto.length > 8000) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: 'El cuerpo es obligatorio y llega hasta 8000 caracteres.' });
        continue;
      }
      const leido = opciones?.htmlObligatorio ? htmlRegistro(pieza.html) : { html: (pieza.html ?? '').trim().slice(0, 20000), motivo: null };
      if (leido.motivo) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: leido.motivo });
        continue;
      }
      const html = leido.html;
      const enCola = await this.correoEnEspera(destinos.para);
      if (enCola) {
        salida.push({
          id: enCola.id,
          direccion,
          estado: 'en_espera',
          noEnviarAntes: new Date(enCola.no_enviar_antes).toISOString(),
          motivo: 'Ese correo todavía no sale. Cuando salga, se puede cargar otro.',
        });
        continue;
      }
      const cuando = momentoCorreo(cursor, new Date());
      cursor = cuando;
      const id = randomUUID();
      await this.conexiones.pg.query(
        `INSERT INTO salida_correo (id, direccion, copia, copia_oculta, asunto, cuerpo, html, remitente_nombre, estado, no_enviar_antes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendiente', $9)`,
        [id, direccion, destinos.copia, destinos.copiaOculta, asunto, texto, html, remitente, cuando.toISOString()],
      );
      salida.push({ id, direccion, estado: 'en_cola', noEnviarAntes: cuando.toISOString() });
    }
    return salida;
  }

  private async correoEnEspera(destinos: string[]): Promise<{ id: string; no_enviar_antes: Date } | null> {
    const pendientes = await this.conexiones.pg.query<{ id: string; direccion: string; no_enviar_antes: Date }>(
      `SELECT id, direccion, no_enviar_antes
       FROM salida_correo
       WHERE estado IN ('pendiente', 'enviando')
       ORDER BY creado_en DESC
       LIMIT 200`,
    );
    const buscados = new Set(destinos);
    for (const fila of pendientes.rows) {
      const suyos = separarCorreos(fila.direccion).correos;
      if (suyos.some((correo) => buscados.has(correo))) return fila;
    }
    return null;
  }

  private async ultimoCorreo(): Promise<Date | null> {
    const filas = await this.conexiones.pg.query<{ ultimo: Date | null }>(
      `SELECT max(no_enviar_antes) AS ultimo FROM salida_correo WHERE estado IN ('pendiente', 'enviando', 'enviado')`,
    );
    const ultimo = filas.rows[0]?.ultimo;
    return ultimo ? new Date(ultimo) : null;
  }
}

function leerDestinos(pieza: PiezaCorreo): { direccion: string; para: string[]; copia: string; copiaOculta: string; motivo: string | null } {
  const vacio = { direccion: '', para: [] as string[], copia: '', copiaOculta: '', motivo: null as string | null };
  const para = separarCorreos([pieza.direccion, pieza.para].filter(Boolean).join(','));
  if (para.motivo === 'invalido') return { ...vacio, motivo: 'La dirección de correo no es válida.' };
  if (para.motivo) return { ...vacio, motivo: para.motivo };
  if (para.correos.length === 0) return { ...vacio, motivo: 'La dirección de correo no es válida.' };
  const copia = separarCorreos([pieza.copia, pieza.cc].filter(Boolean).join(','));
  if (copia.motivo) {
    return { ...vacio, motivo: copia.motivo === 'invalido' ? 'La copia no es un correo válido.' : copia.motivo };
  }
  const oculta = separarCorreos([pieza.copiaOculta, pieza.cco, pieza.bcc].filter(Boolean).join(','));
  if (oculta.motivo) {
    return { ...vacio, motivo: oculta.motivo === 'invalido' ? 'La copia oculta no es un correo válido.' : oculta.motivo };
  }
  const enCopia = copia.correos.filter((correo) => !para.correos.includes(correo));
  const enOculta = oculta.correos.filter((correo) => !para.correos.includes(correo) && !enCopia.includes(correo));
  return {
    direccion: para.correos.join(', '),
    para: para.correos,
    copia: enCopia.join(', '),
    copiaOculta: enOculta.join(', '),
    motivo: null,
  };
}

