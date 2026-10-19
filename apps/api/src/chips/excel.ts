import { inflateRawSync } from 'zlib';

export type FilaLeida = { fila: number; producto: string; marca: string; imei: string; celular: string };

const COLUMNAS: Record<string, 'producto' | 'marca' | 'imei' | 'celular'> = {
  producto: 'producto',
  marca: 'marca',
  imei: 'imei',
  iccid: 'imei',
  celular: 'celular',
  telefono: 'celular',
  numero: 'celular',
  nro: 'celular',
};

type FilaTabla = { fila: number; celdas: string[] };

export function filasDeExcel(bytes: Buffer): FilaLeida[] {
  const tabla = bytes.subarray(0, 2).toString() === 'PK' ? tablaDeXlsx(bytes) : tablaDeCsv(bytes.toString('utf8'));
  return filasDeTabla(tabla);
}

export function filasDeTabla(tabla: FilaTabla[]): FilaLeida[] {
  let encabezado = -1;
  let mapa: Partial<Record<'producto' | 'marca' | 'imei' | 'celular', number>> = {};
  for (let indice = 0; indice < tabla.length; indice += 1) {
    const candidato = mapaDe(tabla[indice].celdas);
    if (candidato.imei !== undefined && candidato.celular !== undefined && candidato.producto !== undefined && candidato.marca !== undefined) {
      encabezado = indice;
      mapa = candidato;
      break;
    }
  }
  if (encabezado < 0) throw new Error('No encontré las columnas producto, marca, imei y celular.');
  const filas: FilaLeida[] = [];
  for (const renglon of tabla.slice(encabezado + 1)) {
    const producto = celda(renglon.celdas, mapa.producto);
    const marca = celda(renglon.celdas, mapa.marca);
    const imei = celda(renglon.celdas, mapa.imei);
    const celular = celda(renglon.celdas, mapa.celular);
    if (!producto && !marca && !imei && !celular) continue;
    filas.push({ fila: renglon.fila, producto, marca, imei, celular });
  }
  if (filas.length === 0) throw new Error('El Excel no tiene chips para cargar.');
  return filas;
}

function mapaDe(celdas: string[]): Partial<Record<'producto' | 'marca' | 'imei' | 'celular', number>> {
  const mapa: Partial<Record<'producto' | 'marca' | 'imei' | 'celular', number>> = {};
  celdas.forEach((valor, indice) => {
    const clave = valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const campo = COLUMNAS[clave];
    if (campo && mapa[campo] === undefined) mapa[campo] = indice;
  });
  return mapa;
}

function celda(celdas: string[], indice: number | undefined): string {
  if (indice === undefined) return '';
  return (celdas[indice] ?? '').trim();
}

function tablaDeXlsx(bytes: Buffer): FilaTabla[] {
  const archivos = archivosZip(bytes);
  const hoja = [...archivos.keys()]
    .filter((nombre) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nombre))
    .sort()[0];
  if (!hoja) throw new Error('El Excel no tiene una hoja.');
  const compartidos = textosCompartidos(archivos.get('xl/sharedStrings.xml')?.toString('utf8') ?? '');
  return filasDeHoja(archivos.get(hoja)!.toString('utf8'), compartidos);
}

function textosCompartidos(xml: string): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((texto) => xmlTexto(texto[1])).join(''),
  );
}

function filasDeHoja(xml: string, compartidos: string[]): FilaTabla[] {
  const filas: FilaTabla[] = [];
  for (const bloque of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(atributo(bloque[1], 'r') ?? filas.length + 1);
    const celdas: string[] = [];
    for (const celdaXml of bloque[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const columna = indiceColumna(atributo(celdaXml[1], 'r') ?? '');
      if (columna < 0) continue;
      celdas[columna] = valorCelda(celdaXml[1], celdaXml[2] ?? '', compartidos);
    }
    filas.push({ fila: numero, celdas: celdas.map((valor) => valor ?? '') });
  }
  return filas;
}

function valorCelda(atributos: string, interior: string, compartidos: string[]): string {
  const tipo = atributo(atributos, 't');
  if (tipo === 'inlineStr') return xmlTexto([...interior.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join(''));
  const crudo = interior.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
  const texto = xmlTexto(crudo);
  if (tipo === 's') return compartidos[Number(texto)] ?? '';
  return texto;
}

function atributo(texto: string, nombre: string): string | null {
  return texto.match(new RegExp(`${nombre}="([^"]*)"`))?.[1] ?? null;
}

function indiceColumna(referencia: string): number {
  const letras = referencia.replace(/[^A-Z]/gi, '');
  if (!letras) return -1;
  let numero = 0;
  for (const letra of letras.toUpperCase()) numero = numero * 26 + (letra.charCodeAt(0) - 64);
  return numero - 1;
}

function xmlTexto(valor: string): string {
  return valor
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tablaDeCsv(texto: string): FilaTabla[] {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);
  const utiles = lineas.map((linea, indice) => ({ fila: indice + 1, linea })).filter((item) => item.linea.trim());
  const separador = (utiles[0]?.linea.split(';').length ?? 0) > (utiles[0]?.linea.split(',').length ?? 0) ? ';' : ',';
  return utiles.map((item) => ({ fila: item.fila, celdas: partirCsv(item.linea, separador) }));
}

function partirCsv(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let comillas = false;
  for (let indice = 0; indice < linea.length; indice += 1) {
    const caracter = linea[indice];
    if (caracter === '"') {
      if (comillas && linea[indice + 1] === '"') {
        actual += '"';
        indice += 1;
      } else comillas = !comillas;
    } else if (caracter === separador && !comillas) {
      celdas.push(actual);
      actual = '';
    } else actual += caracter;
  }
  celdas.push(actual);
  return celdas;
}

function archivosZip(bytes: Buffer): Map<string, Buffer> {
  const fin = buscarFin(bytes);
  const cantidad = bytes.readUInt16LE(fin + 10);
  let cursor = bytes.readUInt32LE(fin + 16);
  const archivos = new Map<string, Buffer>();
  for (let indice = 0; indice < cantidad; indice += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('El Excel no se pudo leer.');
    const metodo = bytes.readUInt16LE(cursor + 10);
    const comprimido = bytes.readUInt32LE(cursor + 20);
    const nombreLargo = bytes.readUInt16LE(cursor + 28);
    const extra = bytes.readUInt16LE(cursor + 30);
    const comentario = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    const nombre = bytes.subarray(cursor + 46, cursor + 46 + nombreLargo).toString('utf8');
    cursor += 46 + nombreLargo + extra + comentario;
    const nombreLocal = bytes.readUInt16LE(local + 26);
    const extraLocal = bytes.readUInt16LE(local + 28);
    const inicio = local + 30 + nombreLocal + extraLocal;
    const datos = bytes.subarray(inicio, inicio + comprimido);
    archivos.set(nombre, metodo === 0 ? Buffer.from(datos) : metodo === 8 ? inflateRawSync(datos) : sinCompresion());
  }
  return archivos;
}

function sinCompresion(): Buffer {
  throw new Error('El Excel usa una compresión que no leo.');
}

function buscarFin(bytes: Buffer): number {
  const minimo = Math.max(0, bytes.length - 66_000);
  for (let indice = bytes.length - 22; indice >= minimo; indice -= 1) {
    if (bytes.readUInt32LE(indice) === 0x06054b50) return indice;
  }
  throw new Error('El Excel no se pudo leer.');
}
