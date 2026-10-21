import { BadRequestException } from '@nestjs/common';
import type { Conexiones } from '../conexiones';
import { fijarUrlImagen, registrarLectorImagen } from '../bot/proceso-imagen';

export type ConfiguracionLector = {
  url: string;
  guardada: string;
  origen: 'pantalla' | 'entorno';
};

export class LectorServicio {
  constructor(private readonly conexiones: Conexiones) {
    registrarLectorImagen(() => this.urlGuardada());
  }

  async publica(): Promise<ConfiguracionLector> {
    const guardada = await this.urlGuardada();
    const entorno = (process.env.PROCESO_IMAGEN_URL || '').trim().replace(/\/$/, '');
    return {
      url: guardada || entorno,
      guardada,
      origen: guardada ? 'pantalla' : 'entorno',
    };
  }

  async guardar(url: string): Promise<ConfiguracionLector> {
    const limpia = url.trim().replace(/\/$/, '');
    if (limpia && !/^https?:\/\//i.test(limpia)) throw new BadRequestException('La dirección tiene que empezar por http:// o https://.');
    await this.conexiones.pg.query(
      `INSERT INTO configuracion_imagen (id, url) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, actualizado_en = now()`,
      [limpia],
    );
    fijarUrlImagen(limpia);
    return this.publica();
  }

  async probar(url: string): Promise<string> {
    const destino = await this.destino(url);
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 8_000);
    try {
      const respuesta = await fetch(`${destino}/api/health`, { signal: control.signal });
      if (!respuesta.ok) throw new BadRequestException(`El lector respondió ${respuesta.status}.`);
      const cuerpo = (await respuesta.json()) as { status?: string };
      if (cuerpo.status !== 'ok') throw new BadRequestException('El lector no confirmó que está listo.');
      return `El lector en ${destino} respondió.`;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('No pude llegar al lector. Revisa la dirección desde el servidor de SGIT.');
    } finally {
      clearTimeout(reloj);
    }
  }

  async leer(entrada: { url?: string; caso?: string; nombre?: string; mime?: string; contenido?: string }): Promise<{
    codigo: string | null;
    tipo: string;
    confianza: number | null;
    mensaje: string;
    proceso: string;
    detalle: unknown;
  }> {
    if (!entrada.contenido) throw new BadRequestException('Falta la imagen.');
    const bytes = Buffer.from(entrada.contenido, 'base64');
    if (bytes.length === 0) throw new BadRequestException('La imagen está vacía.');
    if (bytes.length > 4_000_000) throw new BadRequestException('La imagen pasa de 4 MB.');
    const destino = await this.destino(entrada.url ?? '');
    const caso = entrada.caso === 'chip' ? 'chip' : '';
    const cuerpo = new FormData();
    cuerpo.append('file', new Blob([new Uint8Array(bytes)], { type: entrada.mime || 'image/jpeg' }), entrada.nombre || 'foto.jpg');
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 45_000);
    try {
      const respuesta = await fetch(`${destino}/api/ocr${caso ? '?caso=chip' : ''}`, { method: 'POST', body: cuerpo, signal: control.signal });
      const dato = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
      if (!respuesta.ok || !dato) {
        const detalle = dato && typeof dato.detail === 'string' ? dato.detail : `respuesta ${respuesta.status}`;
        throw new BadRequestException(`El lector no procesó la imagen. ${detalle}`.slice(0, 300));
      }
      const bloques = Array.isArray(dato.bloques) ? dato.bloques : [];
      const proceso = bloques
        .map((bloque) => {
          if (!bloque || typeof bloque !== 'object' || !('texto' in bloque)) return '';
          const fila = bloque as { texto?: unknown; confianza?: unknown };
          const confianza = fila.confianza == null ? '' : ` (${fila.confianza})`;
          return `${String(fila.texto ?? '')}${confianza}`;
        })
        .filter(Boolean)
        .join('\n');
      return {
        codigo: dato.codigo == null ? null : String(dato.codigo),
        tipo: String(dato.tipo ?? ''),
        confianza: dato.confianza == null ? null : Number(dato.confianza),
        mensaje: String(dato.mensaje ?? ''),
        proceso: proceso || 'El lector no devolvió bloques de texto.',
        detalle: dato,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('No pude llegar al lector.');
    } finally {
      clearTimeout(reloj);
    }
  }

  private async destino(url: string): Promise<string> {
    const pedida = url.trim().replace(/\/$/, '');
    if (pedida) {
      if (!/^https?:\/\//i.test(pedida)) throw new BadRequestException('La dirección tiene que empezar por http:// o https://.');
      return pedida;
    }
    const guardada = await this.urlGuardada();
    const entorno = (process.env.PROCESO_IMAGEN_URL || '').trim().replace(/\/$/, '');
    const destino = guardada || entorno;
    if (!destino) throw new BadRequestException('Falta la dirección del lector.');
    return destino;
  }

  private async urlGuardada(): Promise<string> {
    try {
      const fila = await this.conexiones.pg.query<{ url: string }>(`SELECT url FROM configuracion_imagen WHERE id = true`);
      return (fila.rows[0]?.url ?? '').trim().replace(/\/$/, '');
    } catch {
      return '';
    }
  }
}
