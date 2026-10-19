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

const COLUMNAS: Array<[string, keyof TiendaLeida]> = [
  ['n', 'orden'],
  ['cadena', 'cadena'],
  ['tienda', 'tienda'],
  ['contacto', 'contacto'],
  ['celular', 'celular'],
  ['fecha de entrega', 'entregaFecha'],
  ['hora de entrega', 'entregaHora'],
  ['status', 'status'],
  ['tamano reefer', 'tamano'],
  ['direccion de entrega', 'direccion'],
  ['maps', 'mapa'],
  ['mapa', 'mapa'],
];

export function tiendasDeHtml(html: string): TiendaLeida[] {
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
    halladas.push(...tiendasDeFilas(filas));
  }
  return unicas(halladas);
}

export function tiendasDeTexto(texto: string): TiendaLeida[] {
  const lineas = texto.split(/\r?\n/).map((linea) => linea.trim());
  const inicio = lineas.findIndex((linea, indice) => plano(linea) === 'cadena' && lineas.slice(indice, indice + 8).some((siguiente) => plano(siguiente) === 'tienda'));
  if (inicio < 0) return [];
  const cabezas: string[] = [];
  let cursor = inicio;
  while (cursor < lineas.length && cabezas.length < 30) {
    if (lineas[cursor]) cabezas.push(lineas[cursor]);
    if (plano(lineas[cursor]) === 'maps' || plano(lineas[cursor]) === 'mapa') {
      cursor += 1;
      break;
    }
    cursor += 1;
  }
  const celdas = lineas.slice(cursor).filter((linea) => linea && !/^nota:/i.test(linea) && !/^cotizaci/i.test(linea));
  const filas: string[][] = [];
  for (let i = 0; i < celdas.length; i += cabezas.length) filas.push(celdas.slice(i, i + cabezas.length));
  return unicas(tiendasDeFilas([cabezas, ...filas]));
}

export function claveTienda(cadena: string, tienda: string): string {
  return `${plano(cadena)}|${plano(tienda)}`;
}

export function coincideTienda(nombreServicio: string, tienda: string): boolean {
  const buscada = plano(tienda);
  if (buscada.length < 3) return false;
  return new RegExp(`(^|[^A-Z0-9])${buscada}([^A-Z0-9]|$)`).test(plano(nombreServicio));
}

function tiendasDeFilas(filas: string[][]): TiendaLeida[] {
  const cabezas = filas[0]?.map(plano) ?? [];
  const tiendaEn = cabezas.findIndex((cabeza) => cabeza === 'tienda');
  const cadenaEn = cabezas.findIndex((cabeza) => cabeza === 'cadena');
  if (tiendaEn < 0 || cadenaEn < 0) return [];
  const indice = new Map<keyof TiendaLeida, number>();
  cabezas.forEach((cabeza, posicion) => {
    const columna = COLUMNAS.find(([alias]) => cabeza === alias);
    if (columna && !indice.has(columna[1])) indice.set(columna[1], posicion);
  });
  return filas.slice(1).flatMap((fila) => {
    const tienda = fila[tiendaEn]?.trim() ?? '';
    if (!tienda || plano(tienda) === 'tienda') return [];
    const toma = (campo: keyof TiendaLeida) => {
      const posicion = indice.get(campo);
      return posicion == null ? '' : (fila[posicion] ?? '').trim();
    };
    const orden = Number(toma('orden'));
    return [
      {
        orden: Number.isInteger(orden) && orden > 0 ? orden : null,
        cadena: toma('cadena'),
        tienda,
        contacto: toma('contacto'),
        celular: toma('celular'),
        entregaFecha: fechaDe(toma('entregaFecha')),
        entregaHora: horaDe(toma('entregaHora')),
        status: toma('status'),
        tamano: toma('tamano'),
        direccion: toma('direccion'),
        mapa: mapaDe(toma('mapa')),
      },
    ];
  });
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
  const hallado = valor.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!hallado) return null;
  const dia = hallado[1].padStart(2, '0');
  const mes = hallado[2].padStart(2, '0');
  return `${hallado[3]}-${mes}-${dia}`;
}

function horaDe(valor: string): string {
  const hallado = valor.match(/(\d{1,2}):(\d{2})/);
  if (!hallado) return '';
  return `${hallado[1].padStart(2, '0')}:${hallado[2]}`;
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
