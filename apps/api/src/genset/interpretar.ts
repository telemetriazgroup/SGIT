const ILEGIBLE = 1;
const CENTINELA = 2;
const LITROS_POR_GALON = 3.785411784;
const TOLERANCIA_CRUCE = 0.1;

type Definicion = {
  nombre: string;
  etiqueta: string;
  unidad: string;
  decimales: number;
  horometro?: boolean;
  centinela?: boolean;
};

const CAMPOS: Definicion[] = [
  { nombre: 'Tr_Timer1', etiqueta: 'Horómetro 1', unidad: 'h', decimales: 0, horometro: true },
  { nombre: 'Tr_Timer2', etiqueta: 'Horómetro 2', unidad: 'h', decimales: 0, horometro: true },
  { nombre: 'Rt_Voltage', etiqueta: 'Tensión', unidad: 'V', decimales: 1 },
  { nombre: 'Rt_Battery', etiqueta: 'Batería', unidad: 'V', decimales: 2 },
  { nombre: 'Rt_Water', etiqueta: 'Agua', unidad: '', decimales: 1 },
  { nombre: 'Rt_Frequency', etiqueta: 'Frecuencia', unidad: 'Hz', decimales: 1 },
  { nombre: 'Rt_Fuel', etiqueta: 'Combustible', unidad: 'gal', decimales: 1 },
  { nombre: 'Rt_Voltaje2', etiqueta: 'Tensión 2', unidad: 'V', decimales: 1 },
  { nombre: 'Rt_Rotor', etiqueta: 'Rotor', unidad: '', decimales: 1 },
  { nombre: 'Rt_Field', etiqueta: 'Campo', unidad: '', decimales: 1 },
  { nombre: 'Dv_Setting', etiqueta: 'Ajuste', unidad: '', decimales: 0 },
  { nombre: 'Dv_Alarm', etiqueta: 'Alarma', unidad: '', decimales: 0 },
  { nombre: 'Dv_Message', etiqueta: 'Mensaje', unidad: '', decimales: 0 },
  { nombre: 'Dv_Mode', etiqueta: 'Modo', unidad: '', decimales: 0 },
  { nombre: 'Dv_Fuel', etiqueta: 'Combustible', unidad: 'L', decimales: 1, centinela: true },
  { nombre: 'Dv_Voltage', etiqueta: 'Tensión del equipo', unidad: 'V', decimales: 1 },
  { nombre: 'Dv_Frequency', etiqueta: 'Frecuencia del equipo', unidad: 'Hz', decimales: 1 },
  { nombre: 'Dv_Battery', etiqueta: 'Batería del equipo', unidad: 'V', decimales: 1 },
  { nombre: 'Dv_Water', etiqueta: 'Agua del equipo', unidad: '', decimales: 1 },
  { nombre: 'Dv_rpm', etiqueta: 'RPM', unidad: 'rpm', decimales: 0 },
];

export type MedidaGenset = {
  nombre: string;
  etiqueta: string;
  valor: number | null;
  texto: string;
  unidad: string;
  calidad: number;
  aviso: string;
};

export type InterpretacionGenset = {
  medidas: MedidaGenset[];
  corta: boolean;
  flag32: boolean | null;
  avisos: string[];
};

export function interpretarD00(d00: string | null): InterpretacionGenset {
  const tokens = (d00 ?? '').split(',').map((token) => token.trim());
  const hayTrama = tokens.some((token) => token.length > 0);
  const medidas = CAMPOS.map((campo, indice) => medir(campo, indice < tokens.length ? tokens[indice] : undefined));
  const corta = !hayTrama || tokens.length < CAMPOS.length;
  const combustible = cruceCombustible(medidas);
  const avisos: string[] = [];
  if (!hayTrama) avisos.push('Esta trama no trae d00.');
  else if (corta) avisos.push('La trama vino corta. Se leyó hasta donde alcanzó.');
  if (combustible.aviso) avisos.push(combustible.aviso);
  return { medidas, corta, flag32: combustible.flag32, avisos };
}

function medir(campo: Definicion, token: string | undefined): MedidaGenset {
  const base = { nombre: campo.nombre, etiqueta: campo.etiqueta, unidad: campo.unidad, valor: null, texto: '—', calidad: ILEGIBLE, aviso: '' };
  if (token === undefined || token === '') {
    return { ...base, aviso: 'No vino en la trama.' };
  }
  const entero = campo.horometro ? horometro(token) : hexEntero(token);
  if (entero === null) return { ...base, aviso: 'No se pudo leer.' };
  if (campo.centinela && entero === 0xffff) {
    return { ...base, calidad: CENTINELA, texto: 'No programado', aviso: 'Sensor ausente o no programado.' };
  }
  const divisor = campo.decimales === 2 ? 100 : campo.decimales === 1 ? 10 : 1;
  const escala = 10 ** campo.decimales;
  const valor = Math.round((entero / divisor) * escala) / escala;
  const numero = formato(valor, campo.decimales);
  return { ...base, valor, calidad: 0, texto: campo.unidad ? `${numero} ${campo.unidad}` : numero, aviso: '' };
}

function horometro(token: string): number | null {
  const limpio = token.toUpperCase();
  if (!/^[0-9A-F]+$/.test(limpio) || limpio.length % 2 !== 0) return null;
  const base = limpio.endsWith('0000') && limpio.length > 4 ? limpio.slice(0, -4) : limpio;
  if (base.length % 2 !== 0) return null;
  const pares = base.match(/.{2}/g);
  if (!pares) return null;
  return hexEntero(pares.reverse().join(''));
}

function hexEntero(token: string): number | null {
  const limpio = token.toUpperCase();
  if (!/^[0-9A-F]+$/.test(limpio)) return null;
  const valor = Number.parseInt(limpio, 16);
  return Number.isFinite(valor) ? valor : null;
}

function cruceCombustible(medidas: MedidaGenset[]): { flag32: boolean | null; aviso: string } {
  const galones = medidas.find((medida) => medida.nombre === 'Rt_Fuel');
  const litros = medidas.find((medida) => medida.nombre === 'Dv_Fuel');
  if (!galones || !litros) return { flag32: null, aviso: '' };
  if ((litros.calidad & CENTINELA) !== 0 || (galones.calidad & CENTINELA) !== 0) {
    return { flag32: null, aviso: 'El combustible no está programado. No se comparan galones y litros.' };
  }
  if (galones.valor === null || litros.valor === null) return { flag32: null, aviso: '' };
  if (galones.valor === 0 || litros.valor === 0) {
    return { flag32: null, aviso: 'Un sensor de combustible está en cero. No se comparan galones y litros.' };
  }
  const esperado = galones.valor * LITROS_POR_GALON;
  const base = Math.max(Math.abs(esperado), Math.abs(litros.valor));
  const distinto = Math.abs(esperado - litros.valor) / base > TOLERANCIA_CRUCE;
  return distinto ? { flag32: true, aviso: 'Los galones y los litros no coinciden.' } : { flag32: false, aviso: '' };
}

function formato(valor: number, decimales: number): string {
  const fijo = valor.toFixed(decimales).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const [entero, frac] = fijo.split('.');
  return frac ? `${entero},${frac}` : entero ?? fijo;
}
