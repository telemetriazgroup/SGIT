export const PAUSA_MS = 5000;
export const NO_HABILITADO = 'No estás habilitado.';

export type DatosAviso = {
  cot: string;
  cliente: string | null;
  lugar: string | null;
  cita: string | null;
  cantidad: number | null;
};

export function cotVisible(cot: string): string {
  return cot.split('#')[0].split('+').join(' · ');
}

function esTienda(cot: string): boolean {
  return cot.includes('#');
}

function lineaSitio(cot: string, lugar: string | null | undefined): string | null {
  if (!esTienda(cot) || !lugar?.trim()) return null;
  return `Cadena y tienda: ${lugar.trim()}`;
}

function telemetrias(datos: DatosAviso): string {
  if (datos.cantidad !== null && datos.cantidad !== undefined) return String(datos.cantidad);
  return esTienda(datos.cot) ? 'una o más' : 'sin cantidad';
}

export function textoTareaNueva(datos: DatosAviso): string {
  return [
    `COT ${cotVisible(datos.cot)}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    lineaSitio(datos.cot, datos.lugar) ?? `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    `Telemetrías: ${telemetrias(datos)}`,
  ].join('\n');
}

export function textoApertura(datos: DatosAviso): string {
  const sitio = lineaSitio(datos.cot, datos.lugar);
  return [
    'Buenos días. Te escribe el asistente automático del área ZTrack.',
    `Tenemos una solicitud de telemetría en la cotización ${cotVisible(datos.cot)}, del cliente ${datos.cliente ?? 'sin cliente'}.`,
    sitio ? `${sitio}.` : '',
    datos.cantidad && datos.cantidad > 1
      ? `Tengo ${datos.cantidad} solicitudes de telemetría. Envíame las fotos de la máquina y del contenedor del primer equipo. Pueden ser varias juntas.`
      : 'Envíame el contenedor y la máquina asignados. Puedes escribir o mandar varias fotos juntas.',
    'Escribe 1 o datos para ver la cotización.',
    'Escribe menu para ver las demás pendientes.',
  ].filter(Boolean).join('\n');
}

export function textoFichaDespacho(datos: DatosAviso): string {
  return [
    `COT ${cotVisible(datos.cot)}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    lineaSitio(datos.cot, datos.lugar) ?? `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    `Telemetrías: ${telemetrias(datos)}`,
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
    `Entiendo que para la cotización ${cotVisible(cot)} está asignado:`,
    negrita(texto) || 'Sin texto.',
    imagenes > 0 ? `Imágenes: ${imagenes}` : '',
    'Responde ok si es así.',
    'Escribe otro para volver a redactarlo.',
  ].filter(Boolean).join('\n');
}

export function textoAvisoAsignacion(
  cot: string,
  cliente: string | null,
  autor: string,
  texto: string,
  imagenes: number,
  lecturas: string[] = [],
  validacion: string | null = null,
  lugar: string | null = null,
): string {
  const numeros = cotVisible(cot);
  const estado = validacion === 'sin_validar'
    ? 'Quedó registrado sin validar lo que envió despacho y lo que leyó el sistema.'
    : validacion === 'validada'
      ? 'Estas lecturas ya se validaron. Puedes corregir una si hace falta.'
      : '¿Las lecturas son correctas?';
  const sitio = lineaSitio(cot, lugar);
  return [
    esTienda(cot) ? `Campaña ${numeros}.` : `Estás en la cotización ${numeros}.`,
    `Cliente: ${cliente ?? 'sin cliente'}`,
    sitio ? `${sitio}.` : '',
    `${autor}:`,
    negrita(texto) || 'Envió la respuesta en imagen.',
    imagenes > 0 ? `Imágenes juntas: ${imagenes}` : '',
    ...lecturas,
    estado,
    'Escribe ok si sí.',
    lecturas.length > 0 ? 'O escribe el número de la lectura que quieres corregir.' : '',
    imagenes > 0 ? 'Escribe procesar para leer las imágenes.' : '',
    'Escribe menu para volver a la cotización.',
  ].filter(Boolean).join('\n');
}

export function ackDespacho(imagenes: number, texto: string): string {
  return [
    imagenes > 1 ? `Quedaron ${imagenes} imágenes.` : imagenes === 1 ? 'Quedó la imagen.' : 'Quedó anotado.',
    negrita(texto),
    'Si no envías más datos en los próximos 15 segundos, te pregunto si es todo.',
    'Escribe ok cuando termines.',
  ].filter(Boolean).join('\n');
}

export function silencioDespacho(cot: string, lugar: string | null = null): string {
  const sitio = lineaSitio(cot, lugar);
  return `No llegó el ok. Guardé el texto y las imágenes de la cotización ${cotVisible(cot)}${sitio ? `, ${sitio.toLowerCase()}` : ''}. Aviso a los técnicos cuando termine de leer los códigos.`;
}

export function sinValidarAviso(cot: string, lugar: string | null = null): string {
  const sitio = lineaSitio(cot, lugar);
  return [
    `Pasaron 5 minutos sin respuesta en la cotización ${cotVisible(cot)}.`,
    sitio ? `${sitio}.` : '',
    'Quedó registrado lo que envió despacho y lo que leyó el sistema, sin validar.',
    'Entra a Telemetrías, abre el hilo y en Área despacho revisa los últimos registros.',
  ].filter(Boolean).join('\n');
}

export function textoReconsultaDespacho(cot: string, pregunta: string, anterior: string, imagenes: number, lugar: string | null = null): string {
  const sitio = lineaSitio(cot, lugar);
  return [
    `El equipo técnico pregunta por la cotización ${cotVisible(cot)}:`,
    sitio ? `${sitio}.` : '',
    negrita(pregunta) || pregunta,
    'La asignación anterior fue:',
    negrita(anterior) || 'Sin texto.',
    imagenes > 0 ? `Imágenes: ${imagenes}` : '',
    'Responde con texto o con fotos. Pueden ser varias juntas. Escribe ok cuando termines.',
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
    `COT ${cotVisible(datos.cot)}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    lineaSitio(datos.cot, datos.lugar) ?? `Lugar: ${datos.lugar ?? 'sin lugar'}`,
    `Cita: ${datos.cita ?? 'sin cita'}`,
    'Responde citando la COT, el código y la máquina.',
    'Ejemplo: COT 10020000000 código ABC123 máquina TK-4',
  ].join('\n');
}

export function textoSnooze(datos: DatosAviso): string {
  return [
    'Recordatorio',
    `COT ${cotVisible(datos.cot)}`,
    `Cliente: ${datos.cliente ?? 'sin cliente'}`,
    lineaSitio(datos.cot, datos.lugar) ?? `Lugar: ${datos.lugar ?? 'sin lugar'}`,
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

export function avisoSilencioMenu(guardado = false): string {
  return [
    'Pasaron 5 minutos sin respuesta.',
    guardado
      ? 'Guardé el texto y las imágenes que ya habías enviado.'
      : 'Cerré esta consulta. Lo que no llegaste a confirmar no quedó guardado.',
    'Escribe menu o cualquier cosa y te envío el menú completo.',
  ].join('\n');
}

export function textoReprogramacion(datos: DatosAviso): string {
  return [`Reprogramación`, `COT ${cotVisible(datos.cot)}`, lineaSitio(datos.cot, datos.lugar) ?? '', `Cita: ${datos.cita ?? 'sin cita'}`].filter(Boolean).join('\n');
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
  ];
  if (elevado) {
    lineas.push('7. Cerrar por regularización');
    lineas.push('8. Telemetrías');
    lineas.push('9. Volver al menú anterior');
  } else {
    lineas.push('7. Telemetrías');
    lineas.push('8. Volver al menú anterior');
  }
  return lineas.join('\n');
}

export function menuDeHilo(linea: string, contexto: string, falta: string): string {
  return [linea, contexto, falta, '1. Área despacho', '2. Área almacén', '3. Esta telemetría no se instala', '4. Ya tiene telemetría. Regularizar o validar la instalación', '5. Orden de fabricación / instalación', '6. Volver al menú anterior'].filter(Boolean).join('\n');
}

export function menuOrden(titulo: string, cierre: string): string {
  return [titulo, cierre, '1. Pedir insumo en orden de fabricación', '2. Agregar o modificar insumos, si está en borrador', '3. Confirmar orden de fabricación', '4. Ver PDF de orden de producción', '5. Imprimir PDF de orden de producción', '6. Reporte de instalación', '7. Volver al menú anterior'].filter(Boolean).join('\n');
}

export function menuInstalacion(titulo: string, modem: string): string {
  return [titulo, modem, '1. Registrar imágenes de la instalación', '2. Agregar comentario', '3. Validar conexión Starcool', '4. Validar conexión Thermoking', '5. Validar conexión Genset', '6. Módulo 4G. IMEI de la instalación', '7. Volver al menú anterior'].filter(Boolean).join('\n');
}

export function menuAreaDespacho(titulo: string): string {
  return [titulo, '1. Validar lo que envió despacho', '2. Pedir ahora el contenedor y la máquina', '3. Regularizar el contenedor. Escríbelo o manda la foto', '4. Regularizar la máquina. Escríbela o manda la foto', '5. Ver los últimos registros de despacho', '6. Volver al menú anterior'].join('\n');
}

export function menuAreaAlmacen(titulo: string): string {
  return [titulo, '1. Ver lo que envió despacho', '2. Pedir chip a almacén', '3. Pedir módulo 4G', '4. Regularizar el chip. Escribe el IMEI o manda la foto', '5. Regularizar el módulo 4G. Escribe el SN o manda la foto', '6. Registrar entrega de solicitud a almacén', '7. Registrar recepción de insumos de almacén', '8. Ver estado de solicitud de insumos en almacén', '9. Volver al menú anterior'].join('\n');
}

export function menuSinInstalacion(titulo: string): string {
  return [titulo, '¿Por qué no se instala?', '1. La máquina es Carrier o Daikin', '2. Control interno. Se priorizan los pedidos regulares', '3. No hay stock de telemetría o de chip', 'Escribe otra razón si es distinta.', 'Escribe menu para volver al hilo.'].join('\n');
}

export function menuValidarInstalacion(titulo: string): string {
  return [titulo, '1. Regularizar el chip. Escribe el IMEI o manda la foto', '2. Regularizar el módulo 4G. Escribe el SN o manda la foto', '3. Asimilar orden de fabricación', '4. Registrar imágenes de la instalación / validación', '5. Validar conexión Starcool', '6. Validar conexión Thermoking', '7. Validar conexión Genset', '8. Volver al menú anterior'].join('\n');
}

export function preguntaHilosPendientes(pendientes: number): string {
  if (pendientes <= 1) return 'Hay 1 hilo pendiente. Envíame el contenedor y la máquina.';
  return `Hay ${pendientes} hilos pendientes. Envíame el contenedor y la máquina de cada uno.`;
}

export function textoColaHilos(pendientes: number, situacion: 'encolada' | 'en_curso' | 'sin_coordinador'): string {
  const cuantos = pendientes === 1 ? '1 hilo pendiente' : `${pendientes} hilos pendientes`;
  if (situacion === 'sin_coordinador') return `No hay un coordinador de despacho con WhatsApp. Quedó en la cola: ${cuantos} de contenedor y máquina.`;
  if (situacion === 'en_curso') return `Despacho ya está en esta cotización. Le quedó anotado que hay ${cuantos} de contenedor y máquina.`;
  return `Quedó en la cola de despacho. Cada 30 minutos se le pide el contenedor y la máquina. Hay ${cuantos} de esa información.`;
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
  if (que === 'despacho') {
    return [
      'Pasaron 15 segundos sin otra imagen ni texto.',
      '¿Es todo? Escribe ok para confirmar.',
      'Si pasa 1 minuto sin ese ok, guardo el texto y las imágenes que ya enviaste.',
    ].join('\n');
  }
  return ['Pasaron 10 segundos sin otra imagen ni texto.', '¿Es todo? Escribe ok para guardar, o manda otra imagen o texto.'].join('\n');
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
