import { COT_INTERNA, dictaminar, etiquetaBuzon, involucraDesarrollo, nombraEusebio, referenciasCitadas, tieneBloqueZtrack, type Motivo } from './clasificar';
import { cotsDe, normalizarSeccion, plano, sinCabeceras } from './texto';

export type Momento = {
  area: string | null;
  cuando: string | null;
  de: string | null;
  extracto: string;
  frases: string[];
};

export type AreaEncargo = {
  area: string;
  texto: string;
  nuestra: boolean;
};

export type Paso = {
  cuando: string | null;
  de: string;
  resumen: string;
  convoca: boolean;
};

export type Seguimiento = {
  momento: Momento | null;
  areas: AreaEncargo[];
  linea: Paso[];
};

type MensajeSeguimiento = {
  de: string;
  fecha: Date | string | null;
  asunto: string;
  texto: string;
};

type Bloque = {
  de: string;
  fecha: Date | null;
  asunto: string | null;
  cuerpo: string;
  citado: boolean;
};

const MESES: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

const NOMBRE_AREA: Record<string, string> = {
  ztrack: 'ZTRACK',
  despacho: 'Despacho',
  ssoma: 'SSOMA',
  almacen: 'Almacén',
  transporte: 'Transporte',
  'area tecnica': 'Área técnica',
  entrega: 'Entrega',
};

export const AREAS = ['Despacho', 'Entrega', 'SSOMA', 'ZTRACK', 'Almacén', 'Área técnica', 'Transporte'] as const;

export type ResumenHilo = {
  seguimiento: Seguimiento;
  cots: string[];
  motivo: Motivo;
  resumen: string;
};

export function armarSeguimiento(mensajes: MensajeSeguimiento[], terminos: string[]): Seguimiento {
  const ordenados = [...mensajes].sort((a, b) => instante(a.fecha) - instante(b.fecha));
  const bloques = ordenados.flatMap((mensaje) => bloquesDe(mensaje));
  const referencias = referenciasDelHilo(ordenados, terminos);
  const elegido = elegirConvocatoria(bloques, terminos);
  const momento = elegido ? momentoDe(elegido, referencias) : null;
  const areas = areasDelHilo(bloques);
  return { momento, areas, linea: lineaDe(ordenados, elegido) };
}

export function resumenHilo(mensajes: MensajeSeguimiento[], terminos: string[]): ResumenHilo {
  const seguimiento = armarSeguimiento(mensajes, terminos);
  const cots: string[] = [];
  let motivo: Motivo = null;
  for (const mensaje of mensajes) {
    for (const cot of cotsDe(mensaje.asunto)) {
      if (!cots.includes(cot)) cots.push(cot);
    }
    const dictamen = dictaminar(mensaje.asunto, mensaje.texto, terminos, mensaje.de);
    if (peso(dictamen.motivo) > peso(motivo)) motivo = dictamen.motivo;
  }
  return { seguimiento, cots, motivo, resumen: redactar(motivo, cots, seguimiento.areas) };
}

function peso(motivo: Motivo): number {
  if (motivo === 'interna') return 4;
  if (motivo === 'dos cot') return 3;
  if (motivo === 'sin referencia') return 2;
  if (motivo === 'falta cot') return 1;
  return 0;
}

function redactar(motivo: Motivo, cots: string[], areas: AreaEncargo[]): string {
  const nombres = areas.map((area) => area.area).join(', ');
  const cola = nombres ? ` Áreas: ${nombres}.` : '';
  if (motivo === 'interna') return `Asunto interno de ZGROUP, COT ${COT_INTERNA}. No es una cotización de cliente ni una instalación.${cola}`;
  if (cots.length > 1) {
    const porque = motivo === 'sin referencia' ? 'No citan a Luis ni a Eusebio.' : 'Van juntas en la misma tarea.';
    return `Hay ${cots.length} cotizaciones (${cots.join(', ')}). ${porque}${cola}`;
  }
  if (motivo === 'sin referencia') return `La cotización ${cots[0] ?? ''} no cita a Luis ni a Eusebio.${cola}`;
  if (motivo === 'falta cot') return `El asunto no trae una COT.${cola}`;
  return nombres ? `Áreas: ${nombres}.` : 'Sin áreas en el encargo.';
}

function areasDelHilo(bloques: Bloque[]): AreaEncargo[] {
  const areas = areasDelBloqueMasCompleto(bloques);
  const presentes = new Set(areas.map((area) => area.area));
  const limpio = plano(bloques.map((bloque) => bloque.cuerpo).join('\n').replace(/<mailto:[^>]+>/gi, ' ').replace(/[a-z0-9._+-]+@[a-z0-9.-]+/gi, ' '))
    .replace(/\bztrack telemetry\b/g, ' ')
    .replace(/\bztrack telemetria\b/g, ' ');
  const menciones: Array<[string, string]> = [
    ['SSOMA', 'ssoma'],
    ['ZTRACK', 'ztrack'],
    ['Área técnica', 'area tecnica'],
  ];
  for (const [nombre, aguja] of menciones) {
    if (presentes.has(nombre) || !limpio.includes(aguja)) continue;
    areas.push({ area: nombre, texto: 'Mencionada en el hilo.', nuestra: nombre === 'ZTRACK' });
  }
  return areas;
}

function areasDelBloqueMasCompleto(bloques: Bloque[]): AreaEncargo[] {
  let mejores: AreaEncargo[] = [];
  for (const bloque of bloques) {
    const areas = areasDe(bloque.cuerpo);
    if (areas.length > mejores.length) mejores = areas;
  }
  return mejores;
}

export function leerFechaCorreo(texto: string): Date | null {
  const limpio = texto.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  const fecha = limpio.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i)
    ?? limpio.match(/(\d{1,2})\s+([a-záéíóúñ]{3,12})\.?\s+(\d{4})/i);
  if (!fecha) return null;
  const mes = MESES[plano(fecha[2])];
  if (!mes) return null;
  const horaTexto = limpio.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i) ?? limpio.match(/(\d{1,2}):(\d{2})/);
  let hora = horaTexto ? Number(horaTexto[1]) : 0;
  const minuto = horaTexto ? Number(horaTexto[2]) : 0;
  const meridiano = horaTexto?.[3]?.toLowerCase();
  if (meridiano === 'p' && hora < 12) hora += 12;
  if (meridiano === 'a' && hora === 12) hora = 0;
  if (hora > 23 || minuto > 59) return null;
  const iso = `${fecha[3]}-${dos(mes)}-${dos(Number(fecha[1]))}T${dos(hora)}:${dos(minuto)}:00-05:00`;
  const leida = new Date(iso);
  return Number.isNaN(leida.getTime()) ? null : leida;
}

function bloquesDe(mensaje: MensajeSeguimiento): Bloque[] {
  const partes = partirCorreo(mensaje.texto);
  const bloques: Bloque[] = [];
  if (partes.preambulo.trim()) {
    bloques.push({
      de: nombreDe(mensaje.de),
      fecha: comoFecha(mensaje.fecha),
      asunto: mensaje.asunto,
      cuerpo: partes.preambulo,
      citado: false,
    });
  }
  for (const cita of partes.citas) {
    bloques.push({ de: cita.de, fecha: cita.fecha, asunto: cita.asunto, cuerpo: cita.cuerpo, citado: true });
  }
  return bloques;
}

function referenciasDelHilo(mensajes: MensajeSeguimiento[], terminos: string[]): string[] {
  const todas: string[] = [];
  for (const mensaje of mensajes) {
    for (const frase of referenciasCitadas(mensaje.asunto, mensaje.texto, terminos)) {
      if (!todas.some((previa) => plano(previa) === plano(frase))) todas.push(frase);
    }
  }
  return todas;
}

function elegirConvocatoria(bloques: Bloque[], terminos: string[]): Bloque | null {
  const candidatos = bloques.filter(
    (bloque) => involucraDesarrollo(bloque.asunto ?? '', bloque.cuerpo) || referenciasCitadas(bloque.asunto ?? '', bloque.cuerpo, terminos).length > 0,
  );
  const conFrase = candidatos.filter(
    (bloque) => nombraEusebio(bloque.cuerpo) || /asignar la telemetr/i.test(bloque.cuerpo) || tieneBloqueZtrack(bloque.cuerpo) || etiquetaBuzon(bloque.cuerpo),
  );
  const lista = (conFrase.length > 0 ? conFrase : candidatos).sort((a, b) => instante(a.fecha) - instante(b.fecha));
  return lista[0] ?? null;
}

function momentoDe(bloque: Bloque, referencias: string[]): Momento {
  const extracto = extractoDe(bloque.cuerpo, referencias);
  return {
    area: tieneBloqueZtrack(bloque.cuerpo) || etiquetaBuzon(bloque.cuerpo) || nombraEusebio(bloque.cuerpo) ? 'ZTRACK' : null,
    cuando: fechaVisible(bloque.fecha),
    de: bloque.de || null,
    extracto,
    frases: referencias,
  };
}

function extractoDe(cuerpo: string, referencias: string[] = []): string {
  const lineas = sinCabeceras(cuerpo).split(/\r?\n/).map((linea) => linea.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const mejor = lineas
    .map((linea) => ({ linea, marcas: referencias.filter((frase) => linea.toLowerCase().includes(frase.toLowerCase())).length }))
    .sort((a, b) => b.marcas - a.marcas)[0];
  if (mejor && mejor.marcas > 0) return recortar(mejor.linea, 500);
  const directa = lineas.find((linea) => /eusebio\s*\/\s*luis|luis\s*\/\s*eusebio|\beusebio\b|asignar la telemetr|@['"]?\s*telemetria\s+zgroup|@['"]?\s*ztrack\s+telemetr/i.test(linea));
  if (directa) return recortar(directa, 500);
  const bloque = [];
  let dentro = false;
  for (const linea of lineas) {
    const seccion = normalizarSeccion(linea);
    if (seccion) {
      if (dentro) break;
      dentro = seccion === 'ztrack';
      continue;
    }
    if (dentro) bloque.push(linea);
  }
  const texto = bloque.filter((linea) => linea.length > 20 && !/^https?:/i.test(linea)).slice(0, 2).join(' ');
  return recortar(texto || cuerpo.replace(/\s+/g, ' ').trim(), 500);
}

function areasDe(cuerpo: string): AreaEncargo[] {
  const lineas = cuerpo.split(/\r?\n/);
  const areas: AreaEncargo[] = [];
  let actual: { clave: string; lineas: string[] } | null = null;
  const cerrar = () => {
    if (!actual) return;
    const texto = fraseDeArea(actual.clave, actual.lineas);
    if (texto && !areas.some((area) => area.area === NOMBRE_AREA[actual!.clave])) {
      areas.push({ area: NOMBRE_AREA[actual.clave] ?? actual.clave, texto, nuestra: actual.clave === 'ztrack' });
    }
    actual = null;
  };
  for (const linea of lineas) {
    const seccion = normalizarSeccion(linea);
    if (seccion) {
      cerrar();
      actual = { clave: seccion, lineas: [] };
      continue;
    }
    if (actual) actual.lineas.push(linea);
  }
  cerrar();
  return areas;
}

function fraseDeArea(clave: string, lineas: string[]): string {
  const utiles = lineas
    .map((linea) => limpiarLinea(linea))
    .filter((linea) => linea.length > 12 && !/^\d+\b/.test(linea) && !/^e mail\b/i.test(linea));
  if (clave === 'entrega') {
    const cita = utiles.find((linea) => /fecha:|hora:|direcci[oó]n:/i.test(linea));
    if (cita) return recortar(cita, 220);
  }
  const saludo = utiles[0] ?? '';
  const pedido = utiles.find((linea) => /por favor|favor de|asignar|despachar/i.test(linea));
  if (pedido && pedido !== saludo) return recortar(`${saludo} ${pedido}`, 280);
  return recortar(saludo, 280);
}

function lineaDe(mensajes: MensajeSeguimiento[], elegido: Bloque | null): Paso[] {
  const pasos: Array<Paso & { orden: number }> = mensajes.map((mensaje) => {
    const partes = partirCorreo(mensaje.texto);
    const convoca = involucraDesarrollo('', partes.preambulo);
    return {
      orden: instante(mensaje.fecha),
      cuando: fechaVisible(comoFecha(mensaje.fecha)),
      de: nombreDe(mensaje.de),
      resumen: resumir(partes.preambulo) || 'Retoma el hilo.',
      convoca,
    };
  });
  if (elegido?.citado && elegido.fecha) {
    const orden = elegido.fecha.getTime();
    const repetido = pasos.some((paso) => paso.convoca && Math.abs(paso.orden - orden) < 120_000);
    if (!repetido) {
      pasos.push({
        orden,
        cuando: fechaVisible(elegido.fecha),
        de: elegido.de,
        resumen: elegido.asunto ? recortar(elegido.asunto, 220) : resumir(elegido.cuerpo) || 'Encargo del comercial.',
        convoca: true,
      });
    }
  }
  return pasos
    .sort((a, b) => a.orden - b.orden)
    .slice(0, 40)
    .map(({ cuando, de, resumen, convoca }) => ({ cuando, de, resumen, convoca }));
}

type Cita = { de: string; fecha: Date | null; asunto: string | null; cuerpo: string };

function partirCorreo(texto: string): { preambulo: string; citas: Cita[] } {
  const lineas = texto.split(/\r?\n/);
  const citas: Cita[] = [];
  const previo: string[] = [];
  let actual: { de: string; fecha: Date | null; asunto: string | null; lineas: string[] } | null = null;
  const cerrar = () => {
    if (!actual) return;
    const cuerpo = actual.lineas.join('\n').trim();
    if (cuerpo) citas.push({ de: actual.de, fecha: actual.fecha, asunto: actual.asunto, cuerpo });
    actual = null;
  };
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i] ?? '';
    if (esOutlook(linea, lineas.slice(i + 1, i + 8))) {
      cerrar();
      const cabecera = leerOutlook(lineas, i);
      actual = { de: cabecera.de, fecha: cabecera.fecha, asunto: cabecera.asunto, lineas: [] };
      i = cabecera.hasta;
      continue;
    }
    if (/escribi[oó]:\s*$/i.test(linea.trim()) || /wrote:\s*$/i.test(linea.trim())) {
      cerrar();
      const leida = leerEscribio(linea);
      actual = { de: leida.de, fecha: leida.fecha, asunto: null, lineas: [] };
      continue;
    }
    if (actual) actual.lineas.push(linea);
    else previo.push(linea);
  }
  cerrar();
  return { preambulo: previo.join('\n').trim(), citas };
}

function esOutlook(linea: string, siguientes: string[]): boolean {
  if (!/^(de|from)\s*:/i.test(linea.trim())) return false;
  return siguientes.some((candidata) => /^(enviado el|enviado|sent|date|asunto|subject)\s*:/i.test(candidata.trim()));
}

function leerOutlook(lineas: string[], inicio: number): { de: string; fecha: Date | null; asunto: string | null; hasta: number } {
  let de = 'Comercial';
  let fecha: Date | null = null;
  let asunto: string | null = null;
  let i = inicio;
  const cabe = /^(de|from|enviado el|enviado|sent|date|para|to|cc|cco|bcc|asunto|subject)\s*:/i;
  while (i < lineas.length && (cabe.test((lineas[i] ?? '').trim()) || (i > inicio && /^\s+\S/.test(lineas[i] ?? '')))) {
    const linea = (lineas[i] ?? '').trim();
    if (/^(de|from)\s*:/i.test(linea)) de = nombreDe(linea.replace(/^(de|from)\s*:/i, ''));
    else if (/^(enviado el|enviado|sent|date)\s*:/i.test(linea)) fecha = leerFechaCorreo(linea);
    else if (/^(asunto|subject)\s*:/i.test(linea)) asunto = linea.replace(/^(asunto|subject)\s*:/i, '').trim();
    i += 1;
  }
  return { de, fecha, asunto, hasta: i - 1 };
}

function leerEscribio(linea: string): { de: string; fecha: Date | null } {
  const correo = linea.match(/[a-z0-9._+-]+@[a-z0-9.-]+/i)?.[0] ?? null;
  const nombre = linea.match(/,\s*([^,<(]+?)\s*[<(]/)?.[1]?.trim();
  return { de: nombre || (correo ? correo.split('@')[0] : 'Comercial'), fecha: leerFechaCorreo(linea) };
}

function limpiarLinea(linea: string): string {
  return linea
    .replace(/<mailto:[^>]+>/gi, ' ')
    .replace(/<https?:\/\/[^>]+>/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/^[\*\-•]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resumir(texto: string): string {
  return recortar(limpiarLinea(texto.replace(/\[cid:[^\]]+\]/gi, ' ')), 320);
}

function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= tope) return limpio;
  return `${limpio.slice(0, tope - 1).replace(/\s+\S*$/, '')}…`;
}

function nombreDe(texto: string): string {
  const sinEnlaces = texto.replace(/<mailto:[^>]+>/gi, ' ').replace(/[a-z0-9._+-]+@[a-z0-9.-]+/gi, ' ');
  const nombre = sinEnlaces.replace(/<[^>]*>/g, ' ').replace(/[<>']/g, ' ').replace(/\s+/g, ' ').trim();
  if (nombre) return nombre;
  const correo = texto.match(/[a-z0-9._+-]+@[a-z0-9.-]+/i)?.[0];
  return correo ? correo.split('@')[0] : 'Sin nombre';
}

function fechaVisible(fecha: Date | null): string | null {
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const tomar = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${tomar('day')}/${tomar('month')}/${tomar('year')} ${tomar('hour')}:${tomar('minute')}`;
}

function comoFecha(fecha: Date | string | null): Date | null {
  if (!fecha) return null;
  const leida = fecha instanceof Date ? fecha : new Date(fecha);
  return Number.isNaN(leida.getTime()) ? null : leida;
}

function instante(fecha: Date | string | null): number {
  return comoFecha(fecha)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function dos(numero: number): string {
  return String(numero).padStart(2, '0');
}
