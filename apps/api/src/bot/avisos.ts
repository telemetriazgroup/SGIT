export const PAUSA_MS = 5000;
export const NO_HABILITADO = 'No estás habilitado.';

export type DatosAviso = {
  cot: string;
  cliente: string | null;
  lugar: string | null;
  cita: string | null;
  cantidad: number | null;
};

export function textoTareaNueva(datos: DatosAviso): string {
  return [
    `COT ${datos.cot.split('+').join(' · ')}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    `Telemetrías: ${datos.cantidad ?? 'sin cantidad'}`,
  ].join('\n');
}

export function textoReprogramacion(datos: DatosAviso): string {
  return [`Reprogramación`, `COT ${datos.cot.split('+').join(' · ')}`, `Cita: ${datos.cita ?? 'sin cita'}`].join('\n');
}

export function momentosDeEnvio(cantidad: number, ahora: Date, pausaMs = PAUSA_MS): Date[] {
  return Array.from({ length: cantidad }, (_, indice) => new Date(ahora.getTime() + indice * pausaMs));
}

export function digitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function citaVisible(fecha: string | null, hora: string | null): string | null {
  if (!fecha && !hora) return null;
  const dia = fecha ? fecha.slice(0, 10).split('-').reverse().join('/') : '';
  return [dia, hora ? hora.slice(0, 5) : ''].filter(Boolean).join(' ');
}

export type MarcaLider = { dueno: string; vence: number };

export function puedeTomar(actual: MarcaLider | null, yo: string, ahora: number): boolean {
  if (!actual) return true;
  if (actual.vence <= ahora) return true;
  return actual.dueno === yo;
}

export function menuGeneral(): string {
  return [
    'Menú general. No hay una cotización abierta.',
    '1. Tareas recientes',
    '2. Buscar cotización',
    '3. Salir',
    'Escribe 1, 2 o 3. También puedes escribir el número de COT o el nombre del cliente.',
  ].join('\n');
}

export function opcionesCot(): string {
  return [
    '1. Datos de la cotización',
    '2. Registrar seguimiento',
    '3. Registrar incidente',
    '4. Último seguimiento',
    '5. Último incidente',
    '6. Resumen de registros',
    '7. Volver al menú general',
  ].join('\n');
}

export function menuCot(referencia: string): string {
  return [`Estás en ${referencia}`, opcionesCot()].join('\n');
}

export function salioDeCot(referencia: string): string {
  return [
    `Saliste de ${referencia}.`,
    'Volviste al menú general. No hay una cotización abierta.',
    '1. Tareas recientes',
    '2. Buscar cotización',
    '3. Salir',
    'Escribe 1, 2 o 3. También puedes escribir el número de COT o el nombre del cliente.',
  ].join('\n');
}

export function preguntaImagen(referencia: string, tipo: 'seguimiento' | 'incidente'): string {
  const nombre = tipo === 'incidente' ? 'un incidente' : 'un seguimiento';
  return [referencia, `Vas a registrar ${nombre}.`, '¿Vas a poner una imagen?', '1. Sí', '2. No'].join('\n');
}

export function pideImagen(referencia: string): string {
  return [referencia, 'Envía la imagen. Si ya no quieres imagen, escribe no.'].join('\n');
}

export function pideTexto(referencia: string): string {
  return [referencia, 'Escribe qué pasó.'].join('\n');
}

export function imagenRecibida(referencia: string): string {
  return [referencia, 'Imagen recibida. Escribe qué pasó.'].join('\n');
}

export function notaGuardada(referencia: string, tipo: 'seguimiento' | 'incidente', conImagen: boolean): string {
  const nombre = tipo === 'incidente' ? 'incidente' : 'seguimiento';
  const cierre = conImagen ? `El ${nombre} quedó en la ficha, con la imagen.` : `El ${nombre} quedó en la ficha.`;
  return [referencia, cierre, 'Sigues en esta cotización.', opcionesCot()].join('\n');
}
