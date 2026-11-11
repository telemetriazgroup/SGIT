import { normalizarFecha, normalizarHora } from './texto';

export type TiendaLeida = {
  orden: number | null;
  cadena: string;
  tienda: string;
  contacto: string;
  celular: string;
  entregaFecha: string | null;
  entregaHora: string;
  status: string;
  tamano: string;
  direccion: string;
  mapa: string;
};

export type CampoTienda = 'orden' | 'cadena' | 'tienda' | 'contacto' | 'celular' | 'entregaFecha' | 'entregaHora' | 'status' | 'tamano' | 'direccion' | 'mapa';

export type ColumnaTienda = { alias: string; campo: CampoTienda };

export const CAMPOS_TIENDA: CampoTienda[] = ['orden', 'cadena', 'tienda', 'contacto', 'celular', 'entregaFecha', 'entregaHora', 'status', 'tamano', 'direccion', 'mapa'];

export const PLANTILLA_BASE: ColumnaTienda[] = [
  { alias: 'n', campo: 'orden' },
  { alias: 'cadena', campo: 'cadena' },
  { alias: 'tienda', campo: 'tienda' },
  { alias: 'contacto', campo: 'contacto' },
  { alias: 'celular', campo: 'celular' },
  { alias: 'fecha de entrega', campo: 'entregaFecha' },
  { alias: 'hora de entrega', campo: 'entregaHora' },
  { alias: 'status', campo: 'status' },
  { alias: 'tamano reefer', campo: 'tamano' },
  { alias: 'direccion de entrega', campo: 'direccion' },
  { alias: 'maps', campo: 'mapa' },
  { alias: 'mapa', campo: 'mapa' },
];

export function columnasValidas(entrada: unknown): ColumnaTienda[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0) return null;
  const columnas: ColumnaTienda[] = [];
  for (const item of entrada) {
    if (!item || typeof item !== 'object') return null;
    const alias = plano(String((item as { alias?: unknown }).alias ?? ''));
    const campo = String((item as { campo?: unknown }).campo ?? '');
    if (!alias || !CAMPOS_TIENDA.includes(campo as CampoTienda)) return null;
    columnas.push({ alias, campo: campo as CampoTienda });
  }
  const campos = new Set(columnas.map((columna) => columna.campo));
  if (!campos.has('cadena') || !campos.has('tienda')) return null;
  return columnas;
}

export function tiendasDeHtml(html: string, plantillas: ColumnaTienda[][] = [PLANTILLA_BASE]): TiendaLeida[] {
  const tablas = html.split(/<table\b/i).slice(1);
  const halladas: TiendaLeida[] = [];
  for (const tabla of tablas) {
    const cuerpo = tabla.split(/<\/table>/i)[0] ?? '';
    const filas = cuerpo
      .split(/<tr\b/i)
      .slice(1)
      .map((fila) =>
        fila
          .split(/<td\b/i)
          .slice(1)
          .map((celda) => textoCelda(celda.replace(/^[^>]*>/, '').split(/<\/td>/i)[0] ?? '')),
      );
    halladas.push(...tiendasConPlantillas(filas, plantillas));
  }
  return unicas(halladas);
}

export function tiendasDeTexto(texto: string, plantillas: ColumnaTienda[][] = [PLANTILLA_BASE]): TiendaLeida[] {
  const lineas = texto.split(/\r?\n/).map((linea) => linea.trim());
  const activas = plantillas.length > 0 ? plantillas : [PLANTILLA_BASE];
  let mejor: TiendaLeida[] = [];
  for (const columnas of activas) {
    const halladas = tiendasEnLineas(lineas, columnas);
    if (halladas.length > mejor.length) mejor = halladas;
  }
  return mejor;
}

export function claveTienda(cadena: string, tienda: string): string {
  return `${plano(cadena)}|${plano(tienda)}`;
}

export function coincideTienda(nombreServicio: string, tienda: string): boolean {
  const buscada = plano(tienda);
  if (buscada.length < 3) return false;
  return new RegExp(`(^|[^A-Z0-9])${buscada}([^A-Z0-9]|$)`).test(plano(nombreServicio));
}

function tiendasConPlantillas(filas: string[][], plantillas: ColumnaTienda[][]): TiendaLeida[] {
  const activas = plantillas.length > 0 ? plantillas : [PLANTILLA_BASE];
  let mejor: TiendaLeida[] = [];
  for (const columnas of activas) {
    const halladas = tiendasDeFilas(filas, columnas);
    if (halladas.length > mejor.length) mejor = halladas;
  }
  return mejor;
}

function tiendasEnLineas(lineas: string[], columnas: ColumnaTienda[]): TiendaLeida[] {
  const alias = new Set(columnas.map((columna) => columna.alias));
  const aliasCadena = new Set(columnas.filter((columna) => columna.campo === 'cadena').map((columna) => columna.alias));
  const aliasTienda = new Set(columnas.filter((columna) => columna.campo === 'tienda').map((columna) => columna.alias));
  const inicio = lineas.findIndex(
    (linea, indice) => aliasCadena.has(plano(linea)) && lineas.slice(indice, indice + columnas.length + 2).some((siguiente) => aliasTienda.has(plano(siguiente))),
  );
  if (inicio < 0) return [];
  const cabezas: string[] = [];
  let cursor = inicio;
  while (cursor < lineas.length && cabezas.length < columnas.length) {
    if (!lineas[cursor]) {
      cursor += 1;
      continue;
    }
    if (!alias.has(plano(lineas[cursor]))) break;
    cabezas.push(lineas[cursor]);
    cursor += 1;
  }
  if (!cabezas.some((cabeza) => aliasCadena.has(plano(cabeza))) || !cabezas.some((cabeza) => aliasTienda.has(plano(cabeza)))) return [];
  const celdas = lineas.slice(cursor).filter((linea) => linea && !/^nota:/i.test(linea) && !/^cotizaci/i.test(linea));
  const filas: string[][] = [];
  for (let i = 0; i < celdas.length; i += cabezas.length) {
    const fila = celdas.slice(i, i + cabezas.length);
    if (fila.length < cabezas.length) break;
    filas.push(fila);
  }
  return tiendasDeFilas([cabezas, ...filas], columnas, true);
}

export function esLocal(cadena: string, tienda: string): boolean {
  return pareceNombre(cadena) && pareceNombre(tienda);
}

function pareceNombre(valor: string): boolean {
  const texto = valor.trim();
  if (texto.length < 2 || texto.length > 40) return false;
  if (/@|https?:|cid:|mailto:|[<>]|^de:/i.test(texto)) return false;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(texto) || /^\d{1,2}:\d{2}/.test(texto)) return false;
  if (/^[\d\s.+()-]+$/.test(texto)) return false;
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(texto)) return false;
  if (/\b(buenos|estimado|programaci[oó]n|despachos|campa[nñ]a|instalaci[oó]n|asunto)\b/i.test(texto)) return false;
  return true;
}

function tiendasDeFilas(filas: string[][], columnas: ColumnaTienda[], cortar = false): TiendaLeida[] {
  const cabezas = filas[0]?.map(plano) ?? [];
  const aliasTienda = new Set(columnas.filter((columna) => columna.campo === 'tienda').map((columna) => columna.alias));
  const aliasCadena = new Set(columnas.filter((columna) => columna.campo === 'cadena').map((columna) => columna.alias));
  const tiendaEn = cabezas.findIndex((cabeza) => aliasTienda.has(cabeza));
  const cadenaEn = cabezas.findIndex((cabeza) => aliasCadena.has(cabeza));
  if (tiendaEn < 0 || cadenaEn < 0) return [];
  const indice = new Map<keyof TiendaLeida, number>();
  cabezas.forEach((cabeza, posicion) => {
    const columna = columnas.find((item) => item.alias === cabeza);
    if (columna && !indice.has(columna.campo)) indice.set(columna.campo, posicion);
  });
  const salida: TiendaLeida[] = [];
  for (const fila of filas.slice(1)) {
    const tienda = fila[tiendaEn]?.trim() ?? '';
    const toma = (campo: keyof TiendaLeida) => {
      const posicion = indice.get(campo);
      return posicion == null ? '' : (fila[posicion] ?? '').trim();
    };
    const cadena = toma('cadena');
    if (!tienda || plano(tienda) === 'tienda') {
      if (cortar) break;
      continue;
    }
    if (!esLocal(cadena, tienda)) {
      if (cortar) break;
      continue;
    }
    const orden = Number(toma('orden'));
    salida.push({
      orden: Number.isInteger(orden) && orden > 0 ? orden : null,
      cadena,
      tienda,
      contacto: toma('contacto'),
      celular: toma('celular'),
      entregaFecha: fechaDe(toma('entregaFecha')),
      entregaHora: horaDe(toma('entregaHora')),
      status: toma('status'),
      tamano: toma('tamano'),
      direccion: toma('direccion'),
      mapa: mapaDe(toma('mapa')),
    });
  }
  return salida;
}

function unicas(tiendas: TiendaLeida[]): TiendaLeida[] {
  const mapa = new Map<string, TiendaLeida>();
  for (const tienda of tiendas) mapa.set(claveTienda(tienda.cadena, tienda.tienda), tienda);
  return [...mapa.values()];
}

function textoCelda(fragmento: string): string {
  const enlaces = [...fragmento.matchAll(/href=["']([^"']+)["']/gi)].map((hallado) => hallado[1]);
  const texto = fragmento
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCharCode(Number(codigo)))
    .replace(/\s+/g, ' ')
    .trim();
  const mapa = enlaces.find((enlace) => /maps\.|goo\.gl/i.test(enlace));
  return [texto, mapa && !texto.includes(mapa) ? mapa : ''].filter(Boolean).join(' ');
}

function fechaDe(valor: string): string | null {
  return normalizarFecha(valor).iso;
}

function horaDe(valor: string): string {
  return normalizarHora(valor) ?? '';
}

function mapaDe(valor: string): string {
  const hallado = valor.match(/https?:\/\/\S+/i);
  return hallado ? hallado[0].replace(/[>),.;]+$/, '') : '';
}

function plano(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[°º]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
