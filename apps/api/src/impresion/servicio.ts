import { randomBytes, randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { AlmacenCorreo } from '../buzon/almacen';
import { cifrar, descifrar } from '../buzon/cifrado';
import type { Conexiones } from '../conexiones';
import { leerConfiguracion } from '../configuracion';
import { esPdf, normalizarBase, textoTrabajo, type TrabajoImpresion } from './reglas';

const MAXIMO = 5 * 1024 * 1024;

export type ContextoImpresion = { via: 'whatsapp' | 'web' | 'orden'; telefono?: string; autor?: string };

export type ImpresionRealizada = {
  id: string;
  via: 'whatsapp' | 'web' | 'orden';
  nombre: string;
  estado: string;
  respuesta: string;
  telefono: string;
  autor: string;
  creadoEn: string;
};

export class ImpresionServicio {
  constructor(private readonly conexiones: Conexiones) {}

  async publica(): Promise<{ baseUrl: string; clavePuesta: boolean }> {
    const fila = await this.fila();
    return { baseUrl: fila?.base_url ?? '', clavePuesta: Boolean(fila?.clave) };
  }

  async guardar(baseUrl: string, claveNueva: string): Promise<{ baseUrl: string; clavePuesta: boolean }> {
    const base = this.base(baseUrl);
    const previa = await this.fila();
    const escrita = claveNueva.trim();
    const clave = escrita || (previa?.clave ? this.abrir(previa.clave) : '');
    if (!clave) throw new BadRequestException('Indica la clave de la API.');
    await this.conexiones.pg.query(
      `INSERT INTO configuracion_impresion (id, base_url, clave, actualizado_en)
       VALUES (true, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url, clave = EXCLUDED.clave, actualizado_en = now()`,
      [base, cifrar(clave, this.secreto())],
    );
    return { baseUrl: base, clavePuesta: true };
  }

  async probar(): Promise<string> {
    const acceso = await this.credenciales();
    if (typeof acceso === 'string') return acceso;
    const { base, clave } = acceso;
    const salud = await this.pedir(base, '/health');
    if (!salud.ok) return salud.texto;
    const cuerpo = salud.cuerpo;
    if (cuerpo.ok !== true) return 'La API respondió, pero no está en línea.';
    const impresora = await this.pedir(base, '/printer', clave);
    if (impresora.estado === 401) return 'La clave no fue aceptada.';
    if (impresora.estado === 502) return 'La API está en línea, pero no llega a la impresora.';
    if (!impresora.ok) return impresora.texto;
    const state = texto(impresora.cuerpo.state);
    const modelo = texto(impresora.cuerpo.model);
    const acepta = impresora.cuerpo.accepting_jobs === true && (state === 'idle' || state === 'processing');
    const nombre = modelo ? ` ${modelo}` : '';
    if (acepta) return `La API está en línea. Impresora${nombre}, estado ${state}, acepta trabajos.`;
    const aviso = texto(impresora.cuerpo.message);
    return `La API está en línea. La impresora${nombre} está en ${state || 'un estado desconocido'}.${aviso ? ` ${aviso}` : ''}`;
  }

  async realizadas(): Promise<ImpresionRealizada[]> {
    const filas = await this.conexiones.pg.query<{
      id: string;
      via: 'whatsapp' | 'web' | 'orden';
      nombre: string;
      estado: string;
      respuesta: string;
      telefono: string;
      autor: string;
      creado_en: Date;
    }>(
      `SELECT id, via, nombre, estado, respuesta, telefono, autor, creado_en
       FROM impresion_realizada
       ORDER BY creado_en DESC
       LIMIT 40`,
    );
    return filas.rows.map((fila) => ({
      id: fila.id,
      via: fila.via,
      nombre: fila.nombre,
      estado: fila.estado,
      respuesta: fila.respuesta,
      telefono: fila.telefono,
      autor: fila.autor,
      creadoEn: new Date(fila.creado_en).toISOString(),
    }));
  }

  async anotarSinArchivo(telefono: string): Promise<void> {
    await this.anotar({
      id: randomUUID(),
      via: 'whatsapp',
      nombre: '',
      clave: '',
      externalId: '',
      estado: 'sin_archivo',
      respuesta: 'Llegó el mensaje de WhatsApp sin el PDF. El proceso del bot no adjuntó el documento.',
      telefono,
      autor: '',
    });
  }

  async enviar(pdf: Buffer, nombre: string, externalId: string, contexto: ContextoImpresion = { via: 'web' }): Promise<string> {
    if (!esPdf(pdf)) return 'El archivo no es un PDF.';
    if (pdf.length > MAXIMO) return 'El PDF supera 5 MB. La impresora acepta hasta 20 MB, pero este envío llega por la aplicación.';
    const id = randomUUID();
    const nombreArchivo = nombreSeguro(nombre);
    const claveArchivo = `impresion/${id}/${nombreArchivo}`;
    const idExterno = externalId.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || `sgit-${Date.now()}`;
    const comun = { id, via: contexto.via, nombre: nombreArchivo, clave: claveArchivo, externalId: idExterno, telefono: contexto.telefono ?? '', autor: contexto.autor ?? '' };
    try {
      await new AlmacenCorreo(this.conexiones).guardar(claveArchivo, pdf, 'application/pdf');
    } catch {
      await this.anotar({ ...comun, clave: '', estado: 'fallo', respuesta: 'No pude guardar el PDF en el sistema.' });
      return 'No pude guardar el PDF en el sistema.';
    }
    await this.anotar({ ...comun, estado: 'guardado', respuesta: 'PDF guardado. Enviando a la impresora.' });
    const acceso = await this.credenciales();
    if (typeof acceso === 'string') {
      await this.cerrar(id, 'fallo', '', acceso);
      return acceso;
    }
    const { base, clave } = acceso;
    await this.cerrar(id, 'enviando', '', 'PDF guardado. Esperando a la impresora.');
    const formulario = cuerpoFormulario(pdf, nombreArchivo, idExterno);
    let creado: { estado: number; cuerpo: TrabajoImpresion; texto: string };
    try {
      creado = await this.enviarFormulario(base, clave, formulario);
    } catch {
      const textoFallo = `No llegué a la API de impresión en ${hostDe(base)}. Este servidor tiene que poder abrir esa dirección.`;
      await this.cerrar(id, 'fallo', '', textoFallo);
      return textoFallo;
    }
    if (creado.estado === 401 || creado.estado === 400 || creado.estado === 413 || (creado.estado !== 202 && creado.estado !== 200)) {
      const textoFallo = creado.estado === 401
        ? 'La clave de la API de impresión no sirve.'
        : creado.estado === 400
          ? 'La impresora no aceptó el archivo. Tiene que ser un PDF.'
          : creado.estado === 413
            ? 'El PDF supera el máximo de la impresora (20 MB).'
            : creado.texto || 'La API de impresión no aceptó el documento.';
      await this.cerrar(id, 'fallo', creado.cuerpo.id || '', textoFallo);
      return textoFallo;
    }
    let actual = creado.cuerpo;
    for (let intento = 0; intento < 3 && actual.status && !['completed', 'failed', 'canceled'].includes(actual.status); intento += 1) {
      await esperar(4000);
      const consulta = await this.pedir(base, `/jobs/${encodeURIComponent(actual.id || '')}`, clave);
      if (!consulta.ok || !consulta.cuerpo.id) break;
      actual = consulta.cuerpo as TrabajoImpresion;
    }
    const textoFinal = textoTrabajo(actual);
    const estado = actual.status === 'completed' && actual.printer_job_id != null && !actual.error
      ? 'impreso'
      : actual.status === 'failed' || actual.status === 'canceled'
        ? 'fallo'
        : 'enviado';
    await this.cerrar(id, estado, actual.id || '', textoFinal);
    return textoFinal;
  }

  private async anotar(fila: { id: string; via: string; nombre: string; clave: string; externalId: string; estado: string; respuesta: string; telefono: string; autor: string }): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO impresion_realizada (id, via, nombre, clave, external_id, estado, respuesta, telefono, autor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [fila.id, fila.via, fila.nombre, fila.clave, fila.externalId, fila.estado, fila.respuesta, fila.telefono, fila.autor],
    );
  }

  private async cerrar(id: string, estado: string, trabajoId: string, respuesta: string): Promise<void> {
    await this.conexiones.pg.query(
      `UPDATE impresion_realizada SET estado = $2, trabajo_id = $3, respuesta = $4, actualizado_en = now() WHERE id = $1`,
      [id, estado, trabajoId, respuesta],
    );
  }

  private async credenciales(): Promise<{ base: string; clave: string } | string> {
    const fila = await this.fila();
    if (!fila?.base_url || !fila.clave) return 'Falta la dirección y la clave. Se cargan en Imprimir.';
    try {
      return { base: this.base(fila.base_url), clave: this.abrir(fila.clave) };
    } catch (error) {
      return error instanceof BadRequestException ? mensajeDe(error) : 'No pude leer la impresión guardada.';
    }
  }

  private base(valor: string): string {
    try {
      return normalizarBase(valor);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'La dirección no es válida.');
    }
  }

  private abrir(paquete: string): string {
    try {
      return descifrar(paquete, this.secreto());
    } catch {
      throw new BadRequestException('No pude leer la clave guardada. Vuelve a guardarla en Imprimir.');
    }
  }

  private secreto(): string {
    return leerConfiguracion().claveCifrado;
  }

  private async fila(): Promise<{ base_url: string; clave: string } | null> {
    const filas = await this.conexiones.pg.query<{ base_url: string; clave: string }>(
      `SELECT base_url, clave FROM configuracion_impresion WHERE id = true`,
    );
    return filas.rows[0] ?? null;
  }

  private async pedir(base: string, ruta: string, clave?: string): Promise<{ ok: boolean; estado: number; cuerpo: Record<string, unknown> & TrabajoImpresion; texto: string }> {
    try {
      const respuesta = await fetch(`${base}${ruta}`, {
        headers: clave ? { 'X-API-Key': clave } : {},
        signal: AbortSignal.timeout(8000),
      });
      const cuerpo = await leerCuerpo(respuesta);
      return { ok: respuesta.ok, estado: respuesta.status, cuerpo, texto: textoDeEstado(respuesta.status, cuerpo) };
    } catch {
      return { ok: false, estado: 0, cuerpo: {}, texto: `No llegué a la API de impresión en ${hostDe(base)}. Este servidor tiene que poder abrir esa dirección.` };
    }
  }

  private async enviarFormulario(base: string, clave: string, formulario: { cuerpo: Buffer; tipo: string }): Promise<{ estado: number; cuerpo: TrabajoImpresion; texto: string }> {
    const respuesta = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: { 'X-API-Key': clave, 'content-type': formulario.tipo },
      body: new Uint8Array(formulario.cuerpo),
      signal: AbortSignal.timeout(20000),
    });
    const cuerpo = (await leerCuerpo(respuesta)) as TrabajoImpresion;
    return { estado: respuesta.status, cuerpo, texto: textoDeEstado(respuesta.status, cuerpo as Record<string, unknown>) };
  }
}

function cuerpoFormulario(pdf: Buffer, nombre: string, externalId: string): { cuerpo: Buffer; tipo: string } {
  const borde = `sgit${randomBytes(8).toString('hex')}`;
  const cabeza = `--${borde}\r\nContent-Disposition: form-data; name="file"; filename="${nombre}"\r\nContent-Type: application/pdf\r\n\r\n`;
  const cola = `\r\n--${borde}\r\nContent-Disposition: form-data; name="external_id"\r\n\r\n${externalId}\r\n--${borde}\r\nContent-Disposition: form-data; name="copies"\r\n\r\n1\r\n--${borde}--\r\n`;
  return { cuerpo: Buffer.concat([Buffer.from(cabeza), pdf, Buffer.from(cola)]), tipo: `multipart/form-data; boundary=${borde}` };
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre.replace(/[\r\n"]/g, '').trim() || 'documento.pdf';
  return limpio.toLowerCase().endsWith('.pdf') ? limpio : `${limpio}.pdf`;
}

function hostDe(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return 'la dirección guardada';
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

async function leerCuerpo(respuesta: Response): Promise<Record<string, unknown>> {
  const crudo = await respuesta.text();
  try {
    const json = JSON.parse(crudo) as unknown;
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  } catch {
    return { message: crudo.slice(0, 300) };
  }
}

function textoDeEstado(estado: number, cuerpo: Record<string, unknown>): string {
  const message = texto(cuerpo.message) || texto(cuerpo.detail) || texto(cuerpo.error);
  if (message) return message;
  if (estado === 0) return 'No llegué a la API de impresión.';
  return `La API de impresión respondió ${estado}.`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function mensajeDe(error: BadRequestException): string {
  const respuesta = error.getResponse();
  if (typeof respuesta === 'string') return respuesta;
  const message = (respuesta as { message?: unknown }).message;
  if (Array.isArray(message)) return String(message[0] ?? '');
  return typeof message === 'string' ? message : 'No pude imprimir.';
}
