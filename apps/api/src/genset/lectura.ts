import { createHash } from 'crypto';

export type ConexionGenset = 'en_linea' | 'reciente' | 'sin_reporte';

export type DispositivoRemoto = {
  imei: string;
  estado: number;
  fecha: string | null;
  tipo: string;
  ultimo_dato: string | null;
  last_ip: string | null;
  secured: boolean;
};

export type ListaLeida = {
  coleccion: string;
  mes: number | null;
  anio: number | null;
  dispositivos: DispositivoRemoto[];
};

export type TramaLeida = {
  data: Record<string, unknown>;
  mensaje: string;
};

export type CampoTrama = { nombre: string; valor: string };

export type GpsLeido = {
  valido: boolean;
  latitud: number | null;
  longitud: number | null;
  velocidad_kmh: number | null;
  rumbo: number | null;
  cuando: string | null;
  texto: string;
};

export type TramaVista = {
  id: string;
  consultado_en: string;
  consultado_por: string;
  gps: GpsLeido | null;
  campos: CampoTrama[];
  crudo: Record<string, unknown>;
};

const TREINTA_MINUTOS = 30 * 60 * 1000;
const UN_DIA = 24 * 60 * 60 * 1000;
const ORDEN_CAMPOS = ['estado', 'fecha', 'received_at', 'batch_processed_at', 'tipo_dispositivo', 'secured', 'd00', 'd01', 'd02', 'd03', 'd04', 'd05', 'r01', 'r02', 'd09'];
const FECHAS = new Set(['fecha', 'received_at', 'batch_processed_at']);
const SECRETOS = new Set(['api_key', 'api_key_hash', 'clave']);

export function esImei(valor: string): boolean {
  return /^\d{10,20}$/.test(valor.trim());
}

export function conexionDe(ultimo: string | null, ahora = new Date()): ConexionGenset {
  if (!ultimo) return 'sin_reporte';
  const fecha = new Date(ultimo);
  if (Number.isNaN(fecha.getTime())) return 'sin_reporte';
  const edad = ahora.getTime() - fecha.getTime();
  if (edad <= TREINTA_MINUTOS) return 'en_linea';
  if (edad <= UN_DIA) return 'reciente';
  return 'sin_reporte';
}

export function esTramaNueva(anterior: string | null, firma: string): boolean {
  return anterior !== firma;
}

export function firmaDeTrama(data: Record<string, unknown>): string {
  const estable = Object.keys(data)
    .sort()
    .map((clave) => [clave, data[clave] ?? null]);
  return createHash('sha256').update(JSON.stringify(estable)).digest('hex');
}

export function sinSecretos(data: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = {};
  for (const clave of Object.keys(data)) {
    if (SECRETOS.has(clave)) continue;
    copia[clave] = data[clave];
  }
  return copia;
}

export function leerLista(cuerpo: unknown): ListaLeida | { error: string } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { error: 'El servidor de generadores no devolvió la lista.' };
  }
  const raiz = cuerpo as Record<string, unknown>;
  if (!Array.isArray(raiz.dispositivos)) return { error: 'La lista de generadores no trae dispositivos.' };
  const dispositivos: DispositivoRemoto[] = [];
  for (const item of raiz.dispositivos) {
    const equipo = leerDispositivo(item);
    if (equipo) dispositivos.push(equipo);
  }
  return {
    coleccion: typeof raiz.coleccion === 'string' ? raiz.coleccion : '',
    mes: typeof raiz.mes === 'number' ? raiz.mes : null,
    anio: typeof raiz.anio === 'number' ? raiz.anio : null,
    dispositivos,
  };
}

export function leerTrama(cuerpo: unknown, imeiEsperado: string): TramaLeida | { error: string } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { error: 'El servidor de generadores no devolvió la última trama.' };
  }
  const raiz = cuerpo as Record<string, unknown>;
  if (typeof raiz.code === 'number' && raiz.code !== 200) {
    return { error: typeof raiz.message === 'string' && raiz.message.trim() ? raiz.message : 'El servidor de generadores no entregó la última trama.' };
  }
  if (!raiz.data || typeof raiz.data !== 'object' || Array.isArray(raiz.data)) {
    return { error: 'La respuesta no trae la última trama.' };
  }
  const data = raiz.data as Record<string, unknown>;
  const i = typeof data.i === 'string' ? data.i.trim() : '';
  if (i && i !== imeiEsperado) return { error: 'La trama recibida pertenece a otro IMEI.' };
  return { data, mensaje: typeof raiz.message === 'string' ? raiz.message : '' };
}

export function leerGps(crudo: string | null): GpsLeido | null {
  if (!crudo?.trim()) return null;
  const cuerpo = crudo.trim().replace(/^\$/, '').split('*')[0] ?? '';
  const partes = cuerpo.split(',');
  if (partes[0] !== 'GPRMC' || partes.length < 10) {
    return { valido: false, latitud: null, longitud: null, velocidad_kmh: null, rumbo: null, cuando: null, texto: crudo.trim() };
  }
  const valido = partes[2] === 'A';
  const latitud = coordenada(partes[3] ?? '', partes[4] ?? '');
  const longitud = coordenada(partes[5] ?? '', partes[6] ?? '');
  const nudos = numero(partes[7] ?? '');
  const rumbo = numero(partes[8] ?? '');
  const velocidad_kmh = nudos === null ? null : Math.round(nudos * 1.852 * 10) / 10;
  const cuando = instanteGps(partes[9] ?? '', partes[1] ?? '');
  const gps = { valido, latitud, longitud, velocidad_kmh, rumbo, cuando };
  return { ...gps, texto: describirGps(gps) };
}

export function camposDe(data: Record<string, unknown>): CampoTrama[] {
  const usados = new Set<string>(['i', 'gps']);
  const campos: CampoTrama[] = [];
  for (const nombre of ORDEN_CAMPOS) {
    usados.add(nombre);
    const valor = textoDe(nombre, data[nombre]);
    if (valor === null) continue;
    campos.push({ nombre, valor });
  }
  for (const nombre of Object.keys(data).sort()) {
    if (usados.has(nombre)) continue;
    const valor = textoDe(nombre, data[nombre]);
    if (valor === null) continue;
    campos.push({ nombre, valor });
  }
  return campos;
}

export function vistaDeTrama(fila: { id: string; consultado_en: string; consultado_por: string; crudo: Record<string, unknown> }): TramaVista {
  const crudo = sinSecretos(fila.crudo);
  const gps = typeof crudo.gps === 'string' ? leerGps(crudo.gps) : null;
  return {
    id: fila.id,
    consultado_en: fila.consultado_en,
    consultado_por: fila.consultado_por,
    gps,
    campos: camposDe(crudo),
    crudo,
  };
}

export function isoDe(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const texto = valor.trim();
  const conZona = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(texto);
  const preparado = conZona ? texto.replace(' ', 'T') : `${texto.replace(' ', 'T')}Z`;
  const fecha = new Date(preparado);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function leerDispositivo(item: unknown): DispositivoRemoto | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const fila = item as Record<string, unknown>;
  const imei = typeof fila.imei === 'string' ? fila.imei.trim() : '';
  if (!esImei(imei)) return null;
  const estado = typeof fila.estado === 'number' ? fila.estado : Number(fila.estado);
  return {
    imei,
    estado: Number.isFinite(estado) ? estado : 0,
    fecha: isoDe(fila.fecha),
    tipo: typeof fila.tipo === 'string' ? fila.tipo : '',
    ultimo_dato: isoDe(fila.ultimo_dato),
    last_ip: typeof fila.last_ip === 'string' && fila.last_ip.trim() ? fila.last_ip.trim() : null,
    secured: fila.secured === true,
  };
}

function textoDe(nombre: string, valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (FECHAS.has(nombre) && typeof valor === 'string') return isoDe(valor) ?? valor;
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return JSON.stringify(valor);
}

function coordenada(valor: string, hemisferio: string): number | null {
  if (!valor || !/^[NSWE]$/.test(hemisferio)) return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const grados = Math.floor(n / 100);
  const minutos = n - grados * 100;
  if (minutos >= 60) return null;
  const decimal = grados + minutos / 60;
  return hemisferio === 'S' || hemisferio === 'W' ? -decimal : decimal;
}

function numero(valor: string): number | null {
  if (!valor.trim()) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function instanteGps(fecha: string, hora: string): string | null {
  if (!/^\d{6}$/.test(fecha) || !/^\d{6}(\.\d+)?$/.test(hora)) return null;
  const dia = fecha.slice(0, 2);
  const mes = fecha.slice(2, 4);
  const anio = `20${fecha.slice(4, 6)}`;
  const armado = `${anio}-${mes}-${dia}T${hora.slice(0, 2)}:${hora.slice(2, 4)}:${hora.slice(4)}Z`;
  const instante = new Date(armado);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

function describirGps(gps: Omit<GpsLeido, 'texto'>): string {
  if (!gps.valido && gps.latitud === null) return 'Sin posición válida.';
  const lat = gps.latitud === null ? '—' : gps.latitud.toFixed(5);
  const lon = gps.longitud === null ? '—' : gps.longitud.toFixed(5);
  const vel = gps.velocidad_kmh === null ? '' : ` · ${gps.velocidad_kmh.toFixed(1)} km/h`;
  const rumbo = gps.rumbo === null ? '' : ` · rumbo ${Math.round(gps.rumbo)}°`;
  return `${gps.valido ? 'Posición válida' : 'Posición no válida'}: ${lat}, ${lon}${vel}${rumbo}`;
}
