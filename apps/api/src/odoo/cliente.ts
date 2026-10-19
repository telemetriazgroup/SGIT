import type { LecturaOdoo } from '../configuracion';
import type { MetaCampo } from './lectura';

const ESPERA_MS = 20_000;
const cache = new Map<string, { en: number; campos: Record<string, MetaCampo> }>();

export async function autenticar(config: LecturaOdoo): Promise<number> {
  const uid = await rpc(config, 'common', 'authenticate', [config.db, config.usuario, config.clave, {}]);
  if (typeof uid !== 'number' || uid <= 0) throw new Error('Odoo no aceptó el usuario. Revisa el correo y la clave de API.');
  return uid;
}

export async function camposDe(config: LecturaOdoo, uid: number, modelo: string): Promise<Record<string, MetaCampo>> {
  const clave = `${config.url}|${config.db}|${modelo}`;
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.en < 10 * 60_000) return guardado.campos;
  const crudo = await rpc(config, 'object', 'execute_kw', [config.db, uid, config.clave, modelo, 'fields_get', [[]], { attributes: ['string', 'type', 'selection'] }]);
  const campos = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? (crudo as Record<string, MetaCampo>) : {};
  cache.set(clave, { en: Date.now(), campos });
  return campos;
}

export async function buscar(
  config: LecturaOdoo,
  uid: number,
  modelo: string,
  dominio: unknown[],
  campos: string[],
  limite: number,
  esperaMs = ESPERA_MS,
): Promise<Record<string, unknown>[]> {
  if (dominio.length === 0) return [];
  const filas = await rpc(config, 'object', 'execute_kw', [
    config.db,
    uid,
    config.clave,
    modelo,
    'search_read',
    [dominio],
    { fields: campos, limit: limite, order: 'id desc' },
  ], esperaMs);
  if (!Array.isArray(filas)) return [];
  return filas.filter((fila): fila is Record<string, unknown> => Boolean(fila) && typeof fila === 'object');
}

export function presentes(meta: Record<string, MetaCampo>, pedidos: string[]): string[] {
  return ['id', ...pedidos.filter((campo) => campo !== 'id' && meta[campo])];
}

export function limpiarCache(): void {
  cache.clear();
}

async function rpc(config: LecturaOdoo, servicio: string, metodo: string, args: unknown[], esperaMs = ESPERA_MS): Promise<unknown> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), esperaMs);
  try {
    const respuesta = await fetch(`${config.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service: servicio, method: metodo, args } }),
      signal: control.signal,
    });
    if (!respuesta.ok) throw new Error(`Odoo respondió ${respuesta.status}.`);
    const cuerpo = (await respuesta.json()) as { result?: unknown; error?: { data?: { message?: string }; message?: string } };
    if (cuerpo.error) {
      const mensaje = cuerpo.error.data?.message || cuerpo.error.message || 'Odoo rechazó la lectura.';
      throw new Error(sinClave(mensaje, config.clave).slice(0, 300));
    }
    return cuerpo.result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Odoo no respondió a tiempo.');
    if (error instanceof Error) throw new Error(sinClave(error.message, config.clave).slice(0, 300));
    throw new Error('Odoo no respondió.');
  } finally {
    clearTimeout(reloj);
  }
}

function sinClave(mensaje: string, clave: string): string {
  if (!clave) return mensaje;
  return mensaje.split(clave).join('clave');
}
