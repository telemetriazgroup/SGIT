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

export function textoApertura(datos: DatosAviso): string {
  const cot = datos.cot.split('+').join(' · ');
  return [
    'Buenos días. Te escribe el asistente automático del área ZTrack.',
    `Tenemos una solicitud de telemetría en la cotización ${cot}, del cliente ${datos.cliente ?? 'sin cliente'}.`,
    'Envíame el contenedor y la máquina asignados. Puedes escribir o mandar imágenes.',
    'Escribe 1 o datos para ver la cotización.',
    'Escribe menu para ver las demás pendientes.',
  ].join('\n');
}

export function textoFichaDespacho(datos: DatosAviso): string {
  return [
    `COT ${datos.cot.split('+').join(' · ')}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    `Telemetrías: ${datos.cantidad ?? 'sin cantidad'}`,
    'Envíame el contenedor y la máquina asignados.',
  ].join('\n');
}

export function negrita(texto: string): string {
  const lineas = texto
    .replace(/\*/g, '')
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);
  return lineas.map((linea) => `*${linea}*`).join('\n');
}

export function textoEcoAsignacion(cot: string, texto: string, imagenes = 0): string {
  return [
    `Entiendo que para la cotización ${cot.split('+').join(' · ')} está asignado:`,
    negrita(texto) || 'Sin texto.',
    imagenes > 0 ? `Imágenes: ${imagenes}` : '',
    'Responde ok si es así.',
    'Escribe otro para volver a redactarlo.',
  ].filter(Boolean).join('\n');
}

export function textoAvisoAsignacion(cot: string, cliente: string | null, autor: string, texto: string, imagenes: number, lecturas: string[] = []): string {
  return [
    `Despacho respondió la cotización ${cot.split('+').join(' · ')}.`,
    `Cliente: ${cliente ?? 'sin cliente'}`,
    `${autor}:`,
    negrita(texto) || 'Envió la respuesta en imagen.',
    imagenes > 0 ? `Imágenes: ${imagenes}` : '',
    ...lecturas,
    lecturas.length > 0 ? 'Si un código no es ese, en la cotización escribe 9 y luego 4 para corregirlo.' : '',
    'En la cotización escribe 9 para verla de nuevo o para seguir consultando.',
  ].filter(Boolean).join('\n');
}

export function textoReconsultaDespacho(cot: string, pregunta: string, anterior: string, imagenes: number): string {
  return [
    `El equipo técnico pregunta por la cotización ${cot.split('+').join(' · ')}:`,
    negrita(pregunta) || pregunta,
    'La asignación anterior fue:',
    negrita(anterior) || 'Sin texto.',
    imagenes > 0 ? `Imágenes: ${imagenes}` : '',
    'Responde con texto o una imagen. Escribe ok cuando termines.',
  ].filter(Boolean).join('\n');
}

export const PREGUNTAS_DESPACHO = [
  '¿El equipo está en patio?',
  '¿Se va a cambiar la máquina?',
  '¿Se despachará hoy?',
  '¿Está en gambeta?',
] as const;

export function textoConsultaDespacho(datos: DatosAviso): string {
  return [
    '¿Qué código y máquina van en esta atención?',
    `COT ${datos.cot.split('+').join(' · ')}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    'Responde citando la COT, el código y la máquina.',
    'Ejemplo: COT 10020000000 código ABC123 máquina TK-4',
  ].join('\n');
}

export function textoSnooze(datos: DatosAviso): string {
  return [
    'Recordatorio',
    `COT ${datos.cot.split('+').join(' · ')}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
  ].join('\n');
}

export function propuestaEquipo(texto: string): { cot: string | null; codigo: string; maquina: string } | null {
  const codigo = texto.match(/c[oó]digo\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9./_-]{0,40})/i)?.[1] ?? null;
  if (!codigo) return null;
  const maquina = texto.match(/m[aá]quina\s*[:\-]?\s*([^\n]{1,80})/i)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
  const cot = texto.match(/(?<!\d)(1002\d{7})(?!\d)/)?.[1] ?? null;
  return { cot, codigo, maquina };
}

export function menuDespacho(): string {
  return ['1. Tareas recientes', '2. Buscar', '3. Salir'].join('\n');
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

export function menuGeneral(elevado = false): string {
  if (elevado) {
    return [
      'Menú general. No hay una cotización abierta.',
      '1. Tareas recientes',
      '2. Asuntos internos',
      '3. Pendientes de decisión',
      '4. Buscar cotización',
      '5. Salir',
      'Escribe el número. También puedes escribir el número de COT o el nombre del cliente.',
    ].join('\n');
  }
  return [
    'Menú general. No hay una cotización abierta.',
    '1. Tareas recientes',
    '2. Buscar cotización',
    '3. Salir',
    'Escribe 1, 2 o 3. También puedes escribir el número de COT o el nombre del cliente.',
  ].join('\n');
}

export function opcionesCot(elevado = false): string {
  const lineas = [
    '1. Datos de la cotización',
    '2. Registrar seguimiento',
    '3. Registrar incidente',
    '4. Último seguimiento',
    '5. Último incidente',
    '6. Resumen de registros',
    '7. Volver al menú general',
  ];
  if (elevado) lineas.push('8. Cerrar por regularización');
  lineas.push('9. Respuesta de despacho');
  return lineas.join('\n');
}

export function menuCot(referencia: string, elevado = false): string {
  return [`Estás en ${referencia}`, opcionesCot(elevado)].join('\n');
}

export function salioDeCot(referencia: string, elevado = false): string {
  return [`Saliste de ${referencia}.`, menuGeneral(elevado)].join('\n');
}

export function menuAsunto(asunto: string): string {
  return [
    `Asunto: ${asunto}`,
    '1. Registrar seguimiento',
    '2. Registrar incidente',
    '3. Cerrar por regularización',
    '4. Volver al menú general',
  ].join('\n');
}

export function menuDecision(asunto: string): string {
  return [`Asunto: ${asunto}`, '1. Cerrar por regularización', '2. Volver al menú general'].join('\n');
}

export function preguntaImagen(referencia: string, tipo: 'seguimiento' | 'incidente' | 'cierre'): string {
  const nombre = tipo === 'incidente' ? 'un incidente' : tipo === 'cierre' ? 'el cierre por regularización' : 'un seguimiento';
  return [referencia, `Vas a registrar ${nombre}.`, '¿Vas a poner una imagen?', '1. Sí', '2. No'].join('\n');
}

export function pideImagen(referencia: string, varias = false): string {
  if (!varias) return [referencia, 'Envía la imagen. Si ya no quieres imagen, escribe no.'].join('\n');
  return [
    referencia,
    'Envía una o varias imágenes, y el texto si quieres.',
    'Si paras 10 segundos te pregunto si es todo.',
    'Escribe ok para guardar, o no para seguir sin imagen.',
  ].join('\n');
}

export function imagenesJuntas(referencia: string, total: number): string {
  const nombre = total === 1 ? '1 imagen' : `${total} imágenes`;
  return [referencia, `Recibí ${nombre}.`, 'Puedes mandar otra o escribir qué pasó.', 'Si paras 10 segundos te pregunto si es todo. Escribe ok para guardar.'].join('\n');
}

export function preguntaSiEsTodo(que: 'nota' | 'despacho'): string {
  const cierre = que === 'despacho' ? 'procesar la respuesta' : 'guardar';
  return [`Pasaron 10 segundos sin otra imagen ni texto.`, `¿Es todo? Escribe ok para ${cierre}, o manda otra imagen o texto.`].join('\n');
}

export function pideTexto(referencia: string, cierre = false): string {
  return [referencia, cierre ? 'Escribe por qué se cierra.' : 'Escribe qué pasó.'].join('\n');
}

export function imagenRecibida(referencia: string): string {
  return [referencia, 'Imagen recibida. Escribe qué pasó.'].join('\n');
}

export function notaGuardada(
  referencia: string,
  tipo: 'seguimiento' | 'incidente' | 'cierre',
  conImagen: boolean,
  elevado = false,
  imagenes = conImagen ? 1 : 0,
  escrito = '',
): string {
  const dicho = negrita(escrito);
  if (tipo === 'cierre') {
    const cierre = conImagen ? 'Quedó resuelto, con la imagen. Ya no se lista.' : 'Quedó resuelto. Ya no se lista.';
    return [referencia, dicho, `Seguimiento de cierre. ${cierre}`, menuGeneral(elevado)].filter(Boolean).join('\n');
  }
  const nombre = tipo === 'incidente' ? 'incidente' : 'seguimiento';
  const fotos = imagenes > 1 ? `, con ${imagenes} imágenes` : conImagen ? ', con la imagen' : '';
  return [referencia, dicho, `El ${nombre} quedó en la ficha${fotos}.`, 'Sigues en esta cotización.', opcionesCot(elevado)].filter(Boolean).join('\n');
}
