import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Conexiones } from '../conexiones';
import { candidatosTelefono, correoValido, listaDe, momentoCorreo, telefonoSalida, telefonoValido, TOPE_SALIDA } from './reglas';

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
  asunto: string;
  cuerpo: string;
  estado: string;
  error: string | null;
  noEnviarAntes: string | null;
  enviadoEn: string | null;
  creadoEn: string;
};

export type PiezaWhatsapp = { telefono?: string; mensaje?: string; cuerpo?: string; contacto?: string };
export type PiezaCorreo = { direccion?: string; asunto?: string; cuerpo?: string };

export type ResultadoWhatsapp = { id: string; telefono: string; estado: 'en_cola' | 'en_espera' | 'rechazado'; aviso: string | null; motivo?: string };
export type ResultadoCorreo = { id: string; direccion: string; estado: 'en_cola' | 'en_espera' | 'rechazado'; noEnviarAntes: string | null; motivo?: string };

export class SalidaService {
  constructor(private readonly conexiones: Conexiones) {}

  async registros(busqueda = ''): Promise<{ whatsapp: FilaWhatsapp[]; correos: FilaCorreo[] }> {
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
      asunto: string;
      cuerpo: string;
      estado: string;
      error: string | null;
      no_enviar_antes: Date;
      enviado_en: Date | null;
      creado_en: Date;
    }>(
      `SELECT id, direccion, asunto, cuerpo, estado, error, no_enviar_antes, enviado_en, creado_en
       FROM salida_correo
       WHERE $1 = ''
          OR direccion ILIKE '%' || $1 || '%'
          OR asunto ILIKE '%' || $1 || '%'
          OR cuerpo ILIKE '%' || $1 || '%'
       ORDER BY creado_en DESC
       LIMIT 200`,
      [q],
    );
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
        asunto: fila.asunto,
        cuerpo: fila.cuerpo,
        estado: fila.estado,
        error: fila.error,
        noEnviarAntes: fila.no_enviar_antes ? new Date(fila.no_enviar_antes).toISOString() : null,
        enviadoEn: fila.enviado_en ? new Date(fila.enviado_en).toISOString() : null,
        creadoEn: new Date(fila.creado_en).toISOString(),
      })),
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

  async recibir(cuerpo: { whatsapp?: PiezaWhatsapp | PiezaWhatsapp[]; correo?: PiezaCorreo | PiezaCorreo[]; correos?: PiezaCorreo | PiezaCorreo[] }): Promise<{ whatsapp: ResultadoWhatsapp[]; correos: ResultadoCorreo[] }> {
    const whatsapp = listaDe(cuerpo.whatsapp);
    const correos = [...listaDe(cuerpo.correo), ...listaDe(cuerpo.correos)];
    if (whatsapp.length === 0 && correos.length === 0) throw new BadRequestException('Indica un WhatsApp o un correo.');
    if (whatsapp.length > TOPE_SALIDA || correos.length > TOPE_SALIDA) throw new BadRequestException(`El máximo es ${TOPE_SALIDA} mensajes por envío.`);
    return {
      whatsapp: await this.encolarWhatsapp(whatsapp),
      correos: await this.encolarCorreos(correos),
    };
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
      const puesto = await this.guardarWhatsapp(telefono, mensaje, contacto);
      salida.push(puesto);
    }
    return salida;
  }

  private async guardarWhatsapp(telefono: string, mensaje: string, contacto: string): Promise<ResultadoWhatsapp> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      const previo = await cliente.query<{ id: string; aviso: string | null }>(
        `SELECT s.id, a.estado AS aviso
         FROM salida_whatsapp s
         LEFT JOIN aviso a ON a.id = s.aviso_id
         WHERE s.telefono = ANY($1::text[])
         ORDER BY s.creado_en DESC
         FOR UPDATE OF s`,
        [candidatosTelefono(telefono)],
      );
      const enCola = previo.rows.find((fila) => fila.aviso === 'pendiente');
      if (enCola) {
        await cliente.query('COMMIT');
        return {
          id: enCola.id,
          telefono,
          estado: 'en_espera',
          aviso: 'pendiente',
          motivo: 'Ese número todavía tiene un mensaje sin salir. Cuando salga, se puede cargar otro.',
        };
      }
      const id = randomUUID();
      const avisoId = randomUUID();
      await cliente.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'salida', NULL, $2, $3, 'pendiente', now())`,
        [avisoId, telefono, mensaje],
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

  private async encolarCorreos(piezas: PiezaCorreo[]): Promise<ResultadoCorreo[]> {
    const salida: ResultadoCorreo[] = [];
    let cursor = await this.ultimoCorreo();
    for (const pieza of piezas) {
      const direccion = (pieza.direccion ?? '').trim().toLowerCase();
      const asunto = (pieza.asunto ?? '').trim();
      const texto = (pieza.cuerpo ?? '').trim();
      if (!correoValido(direccion)) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: 'La dirección de correo no es válida.' });
        continue;
      }
      if (!asunto || asunto.length > 180) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: 'El asunto es obligatorio y llega hasta 180 caracteres.' });
        continue;
      }
      if (!texto || texto.length > 8000) {
        salida.push({ id: '', direccion, estado: 'rechazado', noEnviarAntes: null, motivo: 'El cuerpo es obligatorio y llega hasta 8000 caracteres.' });
        continue;
      }
      const pendiente = await this.conexiones.pg.query<{ id: string; no_enviar_antes: Date }>(
        `SELECT id, no_enviar_antes FROM salida_correo
         WHERE direccion = $1 AND estado IN ('pendiente', 'enviando')
         ORDER BY creado_en DESC LIMIT 1`,
        [direccion],
      );
      const enCola = pendiente.rows[0];
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
        `INSERT INTO salida_correo (id, direccion, asunto, cuerpo, estado, no_enviar_antes)
         VALUES ($1, $2, $3, $4, 'pendiente', $5)`,
        [id, direccion, asunto, texto, cuando.toISOString()],
      );
      salida.push({ id, direccion, estado: 'en_cola', noEnviarAntes: cuando.toISOString() });
    }
    return salida;
  }

  private async ultimoCorreo(): Promise<Date | null> {
    const filas = await this.conexiones.pg.query<{ ultimo: Date | null }>(
      `SELECT max(no_enviar_antes) AS ultimo FROM salida_correo WHERE estado IN ('pendiente', 'enviando', 'enviado')`,
    );
    const ultimo = filas.rows[0]?.ultimo;
    return ultimo ? new Date(ultimo) : null;
  }
}

