export const PAUSA_CORREO_MS = 20_000;
export const TOPE_SALIDA = 30;
export const TOPE_DESTINOS = 20;

export function telefonoSalida(valor: string): string {
  const limpio = valor.replace(/\D/g, '');
  if (limpio.length === 9) return `51${limpio}`;
  return limpio;
}

export function telefonoValido(valor: string): boolean {
  return valor.length >= 8 && valor.length <= 15;
}

export function candidatosTelefono(valor: string): string[] {
  const base = valor.replace(/\D/g, '');
  if (base.length < 8 || base.length > 15) return [];
  const vistos = new Set<string>([base]);
  if (base.length === 9) vistos.add(`51${base}`);
  if (base.startsWith('51') && base.length === 11) vistos.add(base.slice(2));
  return [...vistos];
}

export function correoValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) && valor.length <= 180;
}

export function separarCorreos(valor: string): { correos: string[]; motivo: string | null } {
  const trozos = valor
    .split(/[,;\s]+/)
    .map((pieza) => pieza.trim().toLowerCase())
    .filter(Boolean);
  if (trozos.length > TOPE_DESTINOS) {
    return { correos: [], motivo: `Cada lista admite hasta ${TOPE_DESTINOS} correos.` };
  }
  const vistos = new Set<string>();
  const correos: string[] = [];
  for (const pieza of trozos) {
    if (!correoValido(pieza)) return { correos: [], motivo: 'invalido' };
    if (vistos.has(pieza)) continue;
    vistos.add(pieza);
    correos.push(pieza);
  }
  return { correos, motivo: null };
}

export function momentoCorreo(ultimo: Date | null, ahora: Date): Date {
  if (!ultimo || ultimo.getTime() < ahora.getTime()) return new Date(ahora.getTime());
  return new Date(ultimo.getTime() + PAUSA_CORREO_MS);
}

export function textoContacto(contacto: string): string {
  return `Para continuar, comunícate al ${contacto}.`;
}

export function correoRaw(de: string, para: string, asunto: string, cuerpo: string, copia = '', copiaOculta = '', html = ''): string {
  const texto = cuerpo.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const diseno = html.trim().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const cabeceras = [`From: ${unaLinea(de)}`, `To: ${unaLinea(para)}`];
  if (copia.trim()) cabeceras.push(`Cc: ${unaLinea(copia)}`);
  if (copiaOculta.trim()) cabeceras.push(`Bcc: ${unaLinea(copiaOculta)}`);
  cabeceras.push(`Subject: ${asuntoCodificado(unaLinea(asunto))}`, 'MIME-Version: 1.0');
  const mensaje = diseno
    ? [...cabeceras, `Content-Type: multipart/alternative; boundary="${borde(diseno)}"`, '', parteTexto(borde(diseno), texto), parteHtml(borde(diseno), diseno), `--${borde(diseno)}--`].join('\r\n')
    : [...cabeceras, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', texto].join('\r\n');
  return Buffer.from(mensaje, 'utf8').toString('base64url');
}

function borde(html: string): string {
  return `sgit-${Buffer.from(html).toString('hex').slice(0, 24)}`;
}

function parteTexto(limite: string, texto: string): string {
  return [`--${limite}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', texto, ''].join('\r\n');
}

function parteHtml(limite: string, html: string): string {
  return [`--${limite}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', html, ''].join('\r\n');
}

function unaLinea(valor: string): string {
  return valor.replace(/[\r\n]+/g, ' ').trim();
}

function asuntoCodificado(asunto: string): string {
  if (/^[\x20-\x7E]*$/.test(asunto)) return asunto;
  return `=?UTF-8?B?${Buffer.from(asunto, 'utf8').toString('base64')}?=`;
}

export function listaDe<T>(valor: T | T[] | undefined): T[] {
  if (!valor) return [];
  return Array.isArray(valor) ? valor : [valor];
}
