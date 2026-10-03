import { createHmac, timingSafeEqual } from 'crypto';
import type { Rol, UsuarioPublico } from '@sgit/shared';

type Carga = UsuarioPublico & { exp: number };

const DOCE_HORAS = 12 * 60 * 60;

export function emitirToken(usuario: UsuarioPublico, secreto: string, ahora = Date.now()): string {
  const carga: Carga = { ...usuario, exp: Math.floor(ahora / 1000) + DOCE_HORAS };
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url');
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function leerToken(token: string, secreto: string, ahora = Date.now()): UsuarioPublico | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;

  const esperada = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  const firmaBuf = Buffer.from(firma);
  const esperadaBuf = Buffer.from(esperada);
  if (firmaBuf.length !== esperadaBuf.length || !timingSafeEqual(firmaBuf, esperadaBuf)) {
    return null;
  }

  try {
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Carga;
    if (!carga.exp || carga.exp * 1000 <= ahora) return null;
    if (!carga.correo || !carga.nombre || !carga.rol) return null;
    return { nombre: carga.nombre, correo: carga.correo, rol: carga.rol as Rol };
  } catch {
    return null;
  }
}
