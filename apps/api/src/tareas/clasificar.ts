import { cotsDe, normalizarSeccion, plano, referenciasDe, sinCabeceras, textoParaDiccionario } from './texto';

export const TERMINOS_INICIALES = [
  'eusebio',
  'luis',
  'telemetria',
  'ztrack',
  'usuario y contrasena',
  'acceso a la plataforma',
] as const;

export const COT_INTERNA = '10000000000';

export type Clase = 'evento_desarrollo' | 'pendiente' | 'otros' | 'interna';
export type Motivo = 'dos cot' | 'sin referencia' | 'falta cot' | 'interna' | null;

export function clasificar(asunto: string, cuerpo: string, terminosActivos: string[], de = ''): Clase {
  return dictaminar(asunto, cuerpo, terminosActivos, de).clase;
}

export function esPublicidad(de: string): boolean {
  const correo = de.toLowerCase();
  if (/linkedin\.com\b/.test(correo) || /\blinkedin\b/i.test(de)) return true;
  if (/canva\.com\b/.test(correo) || /\bcanva\b/i.test(de)) return true;
  if (/team@mail\.cursor\.com\b/.test(correo) || /cursor\s+team/i.test(de)) return true;
  return false;
}

export function dictaminar(
  asunto: string,
  cuerpo: string,
  terminosActivos: string[],
  de = '',
): { clase: Clase; motivo: Motivo } {
  if (esPublicidad(de)) return { clase: 'otros', motivo: null };
  const cots = cotsDe(asunto);
  const referencia = nosReferencia(asunto, cuerpo, terminosActivos);
  if (cots.length >= 1 && referencia) return { clase: 'evento_desarrollo', motivo: null };
  if (cots.length > 1) return { clase: 'pendiente', motivo: 'sin referencia' };
  if (cots.length === 1) return { clase: 'pendiente', motivo: 'sin referencia' };
  if (referencia) return { clase: 'interna', motivo: 'interna' };
  if (tieneTicket(asunto)) return { clase: 'pendiente', motivo: 'falta cot' };
  return { clase: 'otros', motivo: null };
}

export function referenciasCitadas(asunto: string, cuerpo: string, terminos: string[]): string[] {
  const delAsunto = referenciasDe(textoParaDiccionario(asunto, ''), terminos);
  const cuerpoLimpio = textoParaDiccionario('', cuerpo);
  let delCuerpo = referenciasDe(cuerpoLimpio, terminos);
  const acompana = delCuerpo.some((frase) => plano(frase) === 'eusebio') || delAsunto.some((frase) => plano(frase) === 'eusebio');
  if (!acompana) delCuerpo = delCuerpo.filter((frase) => plano(frase) !== 'luis');
  return unirReferencias(delAsunto, delCuerpo);
}

export function nosReferencia(asunto: string, cuerpo: string, terminos: string[]): boolean {
  if (involucraDesarrollo(asunto, cuerpo)) return true;
  return referenciasCitadas(asunto, cuerpo, terminos).length > 0;
}

function unirReferencias(primera: string[], segunda: string[]): string[] {
  const todas = [...primera];
  for (const frase of segunda) {
    if (!todas.some((previa) => plano(previa) === plano(frase))) todas.push(frase);
  }
  return todas;
}

export function tieneTicket(asunto: string): boolean {
  return /ticket(?:\s+de)?\s+ventas\s*#\s*\d+/i.test(asunto)
    || /ticket\s*#\s*\d+/i.test(asunto)
    || /(?:^|\/\/|\s)\s*#\s*\d{3,5}\b/.test(asunto);
}

export function etiquetaBuzon(cuerpo: string): boolean {
  return /@['"]?\s*telemetria\s+zgroup/i.test(cuerpo) || /@['"]?\s*ztrack\s+telemetr[iíy]a/i.test(cuerpo);
}

export function nombraEusebio(texto: string): boolean {
  return /\beusebio\b/i.test(texto);
}

export function involucraDesarrollo(asunto: string, cuerpo: string): boolean {
  const limpio = sinCabeceras(`${asunto}\n${cuerpo}`);
  if (tieneBloqueZtrack(cuerpo) || etiquetaBuzon(limpio)) return true;
  if (nombraEusebio(limpio)) return true;
  return plano(limpio).includes('asignar la telemetria');
}

export function tieneBloqueZtrack(cuerpo: string): boolean {
  return cuerpo.split(/\r?\n/).some((linea) => normalizarSeccion(linea) === 'ztrack');
}

export function bloqueEntre(cuerpo: string, seccion: string): string {
  const lineas = cuerpo.split(/\r?\n/);
  const tomadas: string[] = [];
  let dentro = false;
  for (const linea of lineas) {
    const titulo = normalizarSeccion(linea);
    if (titulo) {
      if (dentro) break;
      dentro = titulo === seccion;
      continue;
    }
    if (dentro) tomadas.push(linea);
  }
  return tomadas.join('\n').trim();
}

export function textoPlano(texto: string): string {
  return plano(texto);
}
