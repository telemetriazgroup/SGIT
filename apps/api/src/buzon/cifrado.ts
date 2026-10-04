import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

function llave(secreto: string): Buffer {
  return scryptSync(secreto, 'sgit-buzon', 32);
}

export function cifrar(texto: string, secreto: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', llave(secreto), iv);
  const cuerpo = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return Buffer.concat([iv, etiqueta, cuerpo]).toString('base64url');
}

export function descifrar(paquete: string, secreto: string): string {
  const bytes = Buffer.from(paquete, 'base64url');
  const iv = bytes.subarray(0, 12);
  const etiqueta = bytes.subarray(12, 28);
  const cuerpo = bytes.subarray(28);
  const descifrador = createDecipheriv('aes-256-gcm', llave(secreto), iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(cuerpo), descifrador.final()]).toString('utf8');
}

export function firmarEstado(secreto: string, ahora = Date.now()): string {
  const cuerpo = Buffer.from(JSON.stringify({ exp: ahora + 10 * 60 * 1000 })).toString('base64url');
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function estadoVigente(token: string, secreto: string, ahora = Date.now()): boolean {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return false;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { exp?: number };
    return typeof carga.exp === 'number' && carga.exp > ahora;
  } catch {
    return false;
  }
}
