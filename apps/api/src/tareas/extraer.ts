import { bloqueEntre } from './clasificar';
import { cotsDe, normalizarFecha, normalizarHora, normalizarSeccion } from './texto';

export type Campo = {
  valor: string | null;
  fragmento: string | null;
};

export type Extraccion = {
  cot: Campo;
  ticket: Campo;
  descripcion: Campo;
  lugar: Campo;
  cliente: Campo;
  fecha: Campo;
  hora: Campo;
  direccion: Campo;
  mapa: Campo;
  temperatura: Campo;
  producto: Campo;
  cantidad: Campo;
  contenedor: Campo;
  comercialNombre: Campo;
  comercialCargo: Campo;
  comercialCorreo: Campo;
  comercialTelefono: Campo;
  citaParcialFecha: Campo;
  citaParcialHora: Campo;
};

const VACIO: Campo = { valor: null, fragmento: null };

export function extraer(asunto: string, cuerpo: string, anio?: number): Extraccion {
  const asuntoPartido = partirAsunto(asunto);
  const entregas = bloquesEntrega(cuerpo);
  const conDireccion = [...entregas].reverse().find((bloque) => /direcci[oó]n\s*:/i.test(bloque));
  const vigente = conDireccion ?? entregas[0] ?? '';
  const parcial = entregas.find((bloque) => bloque !== vigente) ?? '';
  const citaSeccion = leerCita(vigente, anio);
  const suelta = leerCitaSuelta(cuerpo, anio);
  const cita = citaSeccion.fecha.valor ? citaSeccion : suelta;
  const parcialSeccion = leerCita(parcial, anio);
  const citaParcial = parcialSeccion.fecha.valor || citaSeccion.fecha.valor ? parcialSeccion : leerCitaSuelta(cuerpo, anio, 1);
  const firma = leerFirma(cuerpo);
  const ztrack = bloqueEntre(cuerpo, 'ztrack');
  const despacho = bloqueEntre(cuerpo, 'despacho');
  const contenedor =
    leerContenedor(despacho, true) ??
    leerContenedor(cuerpo, true) ??
    leerContenedor(asuntoPartido.descripcion.valor ?? '') ??
    leerContenedor(despacho) ??
    leerContenedor(cuerpo);
  const llegada = horaDeLlegada(cuerpo);
  const cliente = asuntoPartido.cliente.valor ? asuntoPartido.cliente : razonSocialDelCliente(cuerpo);
  const lugar = asuntoPartido.lugar.valor ? asuntoPartido.lugar : destinoFinal(cuerpo);
  return {
    cot: asuntoPartido.cot,
    ticket: asuntoPartido.ticket.valor
      ? asuntoPartido.ticket
      : buscar(/ticket(?:\s+de)?\s+ventas\s*#\s*\d+/i, cuerpo, (m) => m.match(/\d+/)?.[0] ?? null),
    descripcion: asuntoPartido.descripcion,
    lugar,
    cliente,
    fecha: cita.fecha,
    hora: llegada.valor ? llegada : cita.hora,
    direccion: cita.direccion,
    mapa: cita.mapa,
    temperatura: leerTemperatura(cuerpo),
    producto: leerProducto(cuerpo),
    cantidad: leerCantidad(ztrack),
    contenedor: contenedor ?? VACIO,
    comercialNombre: firma.nombre,
    comercialCargo: firma.cargo,
    comercialCorreo: firma.correo,
    comercialTelefono: firma.telefono,
    citaParcialFecha: citaParcial.fecha,
    citaParcialHora: citaParcial.hora,
  };
}

export function partirAsunto(asunto: string): Pick<Extraccion, 'cot' | 'ticket' | 'descripcion' | 'lugar' | 'cliente'> {
  const limpio = asunto.replace(/^(?:(?:re|rv|fw|fwd)\s*:\s*)+/i, '').trim();
  const cots = cotsDe(limpio);
  const ticket = ticketDe(limpio);
  let descripcion: string | null = null;
  let lugar: string | null = null;
  let cliente: string | null = null;
  for (const segmento of limpio.split(/\s*(?:\/\/|\|\|)\s*/)) {
    const leido = interpretarSegmento(segmento);
    if (!leido.descripcion && leido.lugar && descripcion?.includes(`(${leido.lugar})`)) {
      cliente = cliente ?? leido.lugar;
      continue;
    }
    descripcion = descripcion ?? leido.descripcion;
    lugar = lugar ?? leido.lugar;
    cliente = cliente ?? leido.cliente;
  }
  if (!cliente && lugar && descripcion?.includes(`(${lugar})`)) {
    cliente = lugar;
    lugar = null;
  }
  const pegado = clientePegadoACot(limpio);
  if (!cliente && pegado.cliente) cliente = pegado.cliente;
  if (!descripcion && pegado.descripcion) descripcion = pegado.descripcion;
  if (!lugar && pegado.lugar) lugar = pegado.lugar;
  const cotCrudo = limpio.match(/cot(?:izaci[oó]n)?\s*(?:n[°º]\s*:?\s*)?[:.\-]?\s*\d{6,}/i);
  return {
    cot: campo(cots[0] ?? null, cotCrudo?.[0] ?? cots[0] ?? null),
    ticket: campo(ticket.valor, ticket.fragmento),
    descripcion: campo(descripcion, descripcion),
    lugar: campo(lugar, lugar),
    cliente: campo(cliente, cliente),
  };
}

export function leerCantidad(bloque: string): Campo {
  const formas = [/(\d+)\s*und(?:s)?\.?\s+de\s+telemetr[ií]a/i, /(\d+)\s+telemetr[ií]as?/i];
  for (const forma of formas) {
    const coincidencia = bloque.match(forma);
    if (!coincidencia) continue;
    return campo(String(Number(coincidencia[1])), coincidencia[0]);
  }
  return VACIO;
}

const ETIQUETA_FECHA = /fecha(?:\s+y\s+hora|\s+de\s+entrega(?:\s+(?:al|en)\s+el\s+cliente)?|\s+del\s+servicio)?\s*:/i;

function leerCita(bloque: string, anio?: number): { fecha: Campo; hora: Campo; direccion: Campo; mapa: Campo } {
  const elegida = elegirCita(bloque, anio);
  const fechaLinea = elegida?.fechaLinea ?? '';
  const horaLinea = elegida?.horaLinea ?? '';
  const direccionLinea = bloque.match(/direcci[oó]n:\s*[^\n]*/i)?.[0] ?? '';
  const mapa = direccionLinea.match(/https?:\/\/\S+/)?.[0] ?? bloque.match(/https?:\/\/maps\.app\.goo\.gl\/\S+/)?.[0] ?? null;
  const fecha = normalizarFecha(fechaLinea, elegida?.explicita ? undefined : anio);
  const direccion = direccionLinea.replace(/direcci[oó]n:\s*/i, '').replace(/https?:\/\/\S+/, '').trim();
  return {
    fecha: campo(fecha.valor, fecha.valor ? fechaLinea.trim() : null),
    hora: campo(normalizarHora(horaLinea), horaLinea.trim() || null),
    direccion: campo(direccion || null, direccion ? direccionLinea.trim() : null),
    mapa: campo(mapa, mapa),
  };
}

function leerCitaSuelta(cuerpo: string, anio?: number, orden = 0): { fecha: Campo; hora: Campo; direccion: Campo; mapa: Campo } {
  const elegida = elegirCita(cuerpo, anio, orden);
  const fechaLinea = elegida?.fechaLinea ?? '';
  const horaLinea = elegida
    ? elegida.horaLinea
    : orden === 0
      ? (cuerpo.match(/\bhora(?:\s+de\s+llegada(?:\s+al\s+cliente)?)?\s*:\s*[^\n]*/i)?.[0] ?? '')
      : '';
  const direccionLinea = continuarLinea(cuerpo, /direcci[oó]n\s*:/i);
  const mapa = cuerpo.match(/https?:\/\/maps\.app\.goo\.gl\/\S+/i)?.[0] ?? null;
  const fecha = normalizarFecha(fechaLinea, elegida?.explicita ? undefined : anio);
  const direccion = direccionLinea
    .replace(/^[\*\-•]+\s*/, '')
    .replace(/direcci[oó]n\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/, '')
    .trim();
  return {
    fecha: campo(fecha.valor, fecha.valor ? fechaLinea.trim() : null),
    hora: campo(normalizarHora(horaLinea), horaLinea.trim() || null),
    direccion: campo(direccion || null, direccion ? direccionLinea.trim() : null),
    mapa: campo(mapa, mapa),
  };
}

function elegirCita(texto: string, anio?: number, orden = 0): { fechaLinea: string; horaLinea: string; explicita: boolean } | null {
  const lineas = texto.split(/\r?\n/);
  const halladas: Array<{ indice: number; explicita: boolean }> = [];
  for (let indice = 0; indice < lineas.length; indice += 1) {
    if (!ETIQUETA_FECHA.test(lineas[indice])) continue;
    const explicita = Boolean(normalizarFecha(lineas[indice]).valor);
    const sirve = explicita || Boolean(anio && normalizarFecha(lineas[indice], anio).valor);
    if (sirve) halladas.push({ indice, explicita });
  }
  const explicitas = halladas.filter((hallada) => hallada.explicita);
  const lista = explicitas.length > 0 ? explicitas : halladas;
  const primera = lista[0];
  const elegida = orden === 0 ? primera : lista.find((hallada, posicion) => posicion > 0 && primera && hallada.indice - primera.indice <= 20);
  if (elegida) return { fechaLinea: lineas[elegida.indice], horaLinea: horaJuntoA(lineas, elegida.indice), explicita: elegida.explicita };
  if (orden !== 0) return null;
  for (let indice = 0; indice < lineas.length; indice += 1) {
    if (!ETIQUETA_HORA.test(lineas[indice]) || !normalizarFecha(lineas[indice]).valor) continue;
    return { fechaLinea: lineas[indice], horaLinea: lineas[indice], explicita: true };
  }
  return null;
}

const ETIQUETA_HORA = /\bhora(?:\s+de\s+llegada(?:\s+al\s+cliente)?)?\s*:/i;

function horaJuntoA(lineas: string[], indice: number): string {
  if (ETIQUETA_HORA.test(lineas[indice]) || normalizarHora(lineas[indice])) return lineas[indice];
  for (let siguiente = indice + 1; siguiente < Math.min(indice + 4, lineas.length); siguiente += 1) {
    if (ETIQUETA_FECHA.test(lineas[siguiente])) break;
    if (ETIQUETA_HORA.test(lineas[siguiente])) return lineas[siguiente];
  }
  return '';
}

function continuarLinea(cuerpo: string, forma: RegExp): string {
  const lineas = cuerpo.split(/\r?\n/);
  const indice = lineas.findIndex((linea) => forma.test(linea));
  if (indice < 0) return '';
  let texto = lineas[indice].trim();
  let siguienteIndice = indice + 1;
  while (siguienteIndice < lineas.length && !lineas[siguienteIndice].trim()) siguienteIndice += 1;
  const siguiente = lineas[siguienteIndice]?.trim() ?? '';
  if (siguiente && /-\s*$/.test(texto) && !/:\s*\S/.test(siguiente) && !/^saludos/i.test(siguiente)) texto = `${texto} ${siguiente}`;
  return texto;
}

function leerTemperatura(cuerpo: string): Campo {
  const coincidencia = cuerpo.match(/temperatura\s*:\s*-?\d+\s*°?(?:\s*c)?/i);
  if (!coincidencia) return VACIO;
  const numero = coincidencia[0].match(/-?\d+/)?.[0];
  if (!numero) return VACIO;
  return campo(`${numero}°C`, coincidencia[0].trim());
}

function leerContenedor(texto: string, soloCantidad = false): Campo | null {
  const conCantidad = texto.match(/\d+\s+contenedor\s+reefer[^\n]*/i);
  if (conCantidad) return campo(conCantidad[0].trim(), conCantidad[0].trim());
  if (soloCantidad) return null;
  const suelto = texto.match(/contenedor\s+reefer(?:\s+de)?\s+\d+\s*(?:pies|rh|ft)?/i);
  if (!suelto) return null;
  return campo(suelto[0].trim(), suelto[0].trim());
}

function horaDeLlegada(cuerpo: string): Campo {
  const fresco = cuerpo.split(/\n\s*De:\s+/i)[0] ?? cuerpo;
  const coincidencia = fresco.match(/\bllegando\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)/i);
  if (!coincidencia) return VACIO;
  const valor = normalizarHora(coincidencia[1]);
  if (!valor) return VACIO;
  return campo(valor, coincidencia[0].trim());
}

function leerProducto(cuerpo: string): Campo {
  const hallados = [...cuerpo.matchAll(/producto(?:\s+almacenar)?\s*:\s*([^\n*]{2,80})/gi)];
  const limpios = hallados
    .map((coincidencia) => ({ valor: coincidencia[1].replace(/\*+/g, '').trim(), fragmento: coincidencia[0].trim() }))
    .filter((item) => item.valor);
  const natural = limpios.find((item) => !/reefer|contenedor|generador|carreta/i.test(item.valor));
  const elegido = natural ?? limpios[0];
  if (!elegido) return VACIO;
  return campo(elegido.valor, elegido.fragmento);
}

function leerFirma(cuerpo: string): { nombre: Campo; cargo: Campo; correo: Campo; telefono: Campo } {
  const lineas = cuerpo.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  const cierres = lineas
    .map((linea, indice) => ({ indice, plano: planoSeguro(linea) }))
    .filter((linea) => linea.plano === 'saludos cordiales' || linea.plano.startsWith('saludos cordiales '));
  let elegido: { nombre: Campo; cargo: Campo; correo: Campo; telefono: Campo } | null = null;
  for (const cierre of cierres) {
    const siguientes = lineas.slice(cierre.indice + 1, cierre.indice + 18).filter((linea) => !esRuidoFirma(linea));
    const leida = interpretarFirma(siguientes);
    if (leida.nombre.valor) elegido = leida;
  }
  return elegido ?? interpretarFirma([]);
}

function interpretarFirma(lineas: string[]): { nombre: Campo; cargo: Campo; correo: Campo; telefono: Campo } {
  const zona = lineas.join('\n');
  const correo = zona.match(/[a-z0-9._+-]+@zgroup\.com\.pe/i)?.[0]?.toLowerCase() ?? null;
  const telefono = lineas.map(lineaTelefono).find((linea) => linea) ?? null;
  const textos = lineas.filter((linea) => !linea.includes('@') && !/^\+?\d/.test(linea) && !/https?:/i.test(linea));
  const nombre = textos.find((linea) => esPersona(linea)) ?? null;
  const cargo = textos.find((linea) => linea !== nombre && esCargo(linea)) ?? null;
  return {
    nombre: campo(nombre, nombre),
    cargo: campo(cargo, cargo),
    correo: campo(correo, correo),
    telefono: campo(telefono, telefono),
  };
}

function esRuidoFirma(linea: string): boolean {
  if (/@zgroup\.com\.pe/i.test(linea)) return false;
  if (/https?:|www\.|mailto:/i.test(linea)) return true;
  const plano = planoSeguro(linea);
  if (!plano || plano === 'saludos cordiales' || plano.startsWith('saludos cordiales ')) return true;
  return /siguenos|que tenga|excelente dia/.test(plano);
}

function esPersona(linea: string): boolean {
  if (esCargo(linea)) return false;
  const limpia = linea.replace(/[,.]/g, '').trim();
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,3}$/.test(limpia);
}

function esCargo(linea: string): boolean {
  return linea.length < 60 && /comercial|asistente|ejecutiv|coordinador|gerente|analista/i.test(linea);
}

function bloquesEntrega(cuerpo: string): string[] {
  const lineas = cuerpo.split(/\r?\n/);
  const bloques: string[][] = [];
  let actual: string[] | null = null;
  for (const linea of lineas) {
    const titulo = normalizarSeccion(linea);
    if (titulo === 'entrega') {
      if (actual) bloques.push(actual);
      actual = [linea];
      continue;
    }
    if (actual && titulo) {
      bloques.push(actual);
      actual = null;
    }
    if (actual) actual.push(linea);
  }
  if (actual) bloques.push(actual);
  return bloques.map((bloque) => bloque.join('\n'));
}

function buscar(forma: RegExp, texto: string, valor: (coincidencia: string) => string | null): Campo {
  const coincidencia = texto.match(forma);
  if (!coincidencia) return VACIO;
  return campo(valor(coincidencia[0]), coincidencia[0].trim());
}

function campo(valor: string | null, fragmento: string | null): Campo {
  if (!valor) return VACIO;
  return { valor, fragmento };
}

function razonSocialDelCliente(cuerpo: string): Campo {
  const coincidencia = cuerpo.match(/raz[oó]n social del cliente\s*:\s*\**\s*([^\n*]{2,120})/i);
  const valor = coincidencia?.[1]?.replace(/\*+/g, '').trim() ?? '';
  return campo(valor || null, coincidencia?.[0]?.trim() ?? null);
}

function destinoFinal(cuerpo: string): Campo {
  const coincidencia = cuerpo.match(/destino final\s*:\s*\**\s*([^\n*]{2,80})/i);
  const valor = coincidencia?.[1]?.replace(/\*+/g, '').trim() ?? '';
  return campo(valor || null, coincidencia?.[0]?.trim() ?? null);
}

function clientePegadoACot(asunto: string): { cliente: string | null; descripcion: string | null; lugar: string | null } {
  const vacio = { cliente: null, descripcion: null, lugar: null };
  const marca = asunto.match(/(?<!\d)1002\d{7}\s+([^/]{3,160}?)\s+(alquiler|venta|servicio)\b([\s\S]*)$/i);
  if (!marca) return vacio;
  const cliente = marca[1].replace(/\s+/g, ' ').replace(/^[\s\-.:]+|[\s\-.:]+$/g, '').trim();
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(cliente)) return vacio;
  let descripcion = `${marca[2]}${marca[3]}`.replace(/\s+/g, ' ').trim();
  const destino = descripcion.match(/\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,24})$/i);
  return { cliente, descripcion, lugar: destino?.[1] ?? null };
}

function lineaTelefono(linea: string): string | null {
  const limpia = linea.replace(/^(?:mobile|celular|tel[ée]fono)\s*:\s*/i, '').trim();
  const digitos = limpia.replace(/\D/g, '');
  if (/^1002\d{7}$/.test(digitos)) return null;
  if (/^\+?\d[\d\s().-]{8,}$/.test(limpia) && digitos.length >= 8 && digitos.length <= 15) return limpia;
  const suelto = linea.match(/\+\d{2}\s?\d{3}\s?\d{3}\s?\d{3}/);
  return suelto?.[0] ?? null;
}

function ticketDe(asunto: string): { valor: string | null; fragmento: string | null } {
  const explicito = asunto.match(/ticket(?:\s+de)?\s+ventas\s*#\s*(\d+)/i) ?? asunto.match(/ticket\s*#\s*(\d+)/i);
  if (explicito) return { valor: explicito[1], fragmento: explicito[0] };
  const suelto = asunto.match(/(?:^|\/\/|\s-\s)\s*#\s*(\d{3,5})\b/);
  if (suelto) return { valor: suelto[1], fragmento: suelto[0].trim() };
  return { valor: null, fragmento: null };
}

function interpretarSegmento(segmento: string): { descripcion: string | null; lugar: string | null; cliente: string | null } {
  const vacio = { descripcion: null, lugar: null, cliente: null };
  const texto = segmento
    .replace(/^(?:asignar y despachar|recojoi?|devolucion|retorno de contenedor|ejecutar servicio|solicitud de codigos|culminar cold treatment)\s*[:/\-]?\s*/i, '')
    .trim();
  if (!texto) return vacio;
  const subrayado = texto.match(/^(.*)_([^_]*(?:s\.?\s*a\.?\s*c\.?|s\.?\s*r\.?\s*l\.?|e\.?\s*i\.?\s*r\.?\s*l\.?|s\.?\s*a\.?|sac|srl|eirl|sa))\s*$/i);
  if (subrayado && pareceServicio(subrayado[1]) && esEmpresa(subrayado[2])) {
    return { descripcion: subrayado[1].trim(), lugar: null, cliente: limpiarCliente(subrayado[2]) };
  }
  const partes = texto
    .split(/\s+[\u2010\u2011\u2012\u2013\u2014\u2015-]\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  const ruc = /^\d{11}$/.test(partes.at(-1) ?? '') ? (partes.at(-1) ?? null) : null;
  while (partes.length > 0 && /^\d{8,}$/.test(partes.at(-1) ?? '')) partes.pop();
  const utiles = partes.filter((parte) => !esMarca(parte));
  if (utiles.length >= 3 && pareceServicio(utiles[0]) && esEmpresa(utiles.at(-1) ?? '')) {
    return {
      descripcion: utiles.slice(0, -2).join(' - '),
      lugar: utiles.at(-2) ?? null,
      cliente: clienteConRuc(utiles.at(-1) ?? '', ruc),
    };
  }
  if (utiles.length >= 2 && pareceServicio(utiles[0]) && esEmpresa(utiles.at(-1) ?? '')) {
    return { descripcion: utiles.slice(0, -1).join(' - '), lugar: null, cliente: clienteConRuc(utiles.at(-1) ?? '', ruc) };
  }
  if (utiles.length >= 2 && pareceServicio(utiles[0])) {
    const candidato = utiles.at(-1) ?? '';
    const lugar = /^\d/.test(candidato) ? null : candidato;
    return {
      descripcion: (lugar ? utiles.slice(0, -1) : utiles).join(' - '),
      lugar,
      cliente: null,
    };
  }
  if (utiles.length >= 2 && esEmpresa(utiles[0]) && !pareceServicio(utiles[0])) {
    return { descripcion: null, lugar: null, cliente: limpiarCliente(utiles[0]) };
  }
  if (utiles.length === 2 && /^zgroup\b/i.test(utiles[0]) && !pareceServicio(utiles[1])) {
    return { descripcion: null, lugar: null, cliente: utiles[1] };
  }
  if (utiles.length === 1 && esEmpresa(utiles[0]) && !empiezaComoServicio(utiles[0])) {
    return { descripcion: null, lugar: null, cliente: clienteConRuc(utiles[0], ruc) };
  }
  if (utiles.length === 1 && pareceServicio(utiles[0])) {
    const parentesis = utiles[0].match(/\(([^)]{3,80})\)\s*$/);
    const clienteParen = parentesis && esEmpresa(parentesis[1]) ? limpiarCliente(parentesis[1]) : null;
    const destino = utiles[0].match(/\bcon destino\s+(.+)$/i)?.[1]?.trim() ?? null;
    return { descripcion: utiles[0].replace(/\s*\([^)]*\)\s*$/, '').trim(), lugar: destino, cliente: clienteParen };
  }
  if (utiles.length === 1 && palabras(utiles[0]) >= 3 && /gobierno|municipal|banco|ministerio|universidad|regional/i.test(utiles[0])) {
    return { descripcion: null, lugar: null, cliente: utiles[0] };
  }
  if (utiles.length === 1 && esLugarCorto(utiles[0])) return { descripcion: null, lugar: utiles[0], cliente: null };
  return vacio;
}

function esMarca(parte: string): boolean {
  return /^(?:cot(?:izaci[oó]n)?\.?\s*(?:n[°º]\s*:?\s*)?)?1002\d{7}$/i.test(parte.trim())
    || /^ticket(?:\s+de)?\s+ventas\s*#\s*\d+$/i.test(parte.trim())
    || /^ticket\s*#\s*\d+$/i.test(parte.trim())
    || /^#\s*\d{3,5}$/.test(parte.trim());
}

function pareceServicio(texto: string): boolean {
  return /alquiler|venta|servicio|instalaci|asistencia|protocolo|cold treatment|transporte|telemetr|zstore|generador|contenedor/i.test(texto);
}

function esEmpresa(texto: string): boolean {
  return /\b(?:s\.?\s*a\.?\s*c\.?|s\.?\s*r\.?\s*l\.?|e\.?\s*i\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*a\.?|s\.?\s*a\.?|b\.?\s*v\.?|sac|srl|eirl|saa|sa|bv)\b/i.test(texto);
}

function empiezaComoServicio(texto: string): boolean {
  return /^(?:alquiler|venta|servicio|instalaci|asistencia|protocolo|cold treatment)\b/i.test(texto.trim());
}

function clienteConRuc(nombre: string, ruc: string | null): string {
  const limpio = limpiarCliente(nombre);
  if (!ruc || limpio.includes(ruc)) return limpio;
  return `${limpio} – ${ruc}`;
}

function palabras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

function esLugarCorto(texto: string): boolean {
  return texto.length <= 40 && !pareceServicio(texto) && !esEmpresa(texto) && !/\d{5,}/.test(texto);
}

function limpiarCliente(texto: string): string {
  return texto.replace(/\s*[–-]\s*\d{11}\s*$/, '').trim();
}

function planoSeguro(linea: string): string {
  return linea
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
