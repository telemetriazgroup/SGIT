export const PRODUCTO_TELEMETRIA = 'GPNDND0002';
export const CHIP_CODIGO = 'INDND4855';
export const MODEM_CODIGO = 'INDND7509';

const EJECUTORES = [
  { pista: 'marcelo', nombre: 'MARCELO PEREA LUIS PABLO' },
  { pista: 'edwin', nombre: 'COBEÑAS RAMOS EDWIN JHOEL' },
  { pista: 'vasquez', nombre: 'VASQUEZ VASQUEZ JOSEP RODRIGO' },
];

export const EJECUTOR_DEFECTO = 'AVELLANEDA MOYA EUSEBIO';

export type MaterialPedido = {
  moveId: number;
  productoId: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  pedido: boolean;
};

export function ejecutorDe(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return EJECUTORES.find((item) => limpio.includes(item.pista))?.nombre ?? EJECUTOR_DEFECTO;
}

export function esLimiteDeOrdenes(mensaje: string): boolean {
  return /l[ií]mite m[aá]ximo de 80|no se pueden tener m[aá]s [oó]rdenes de fabricaci[oó]n/i.test(mensaje);
}

export function codigoDeProducto(nombre: string): string {
  return nombre.match(/\[([A-Z0-9]+)\]/)?.[1] ?? '';
}

export function nombreDeProducto(crudo: string, codigo = ''): string {
  const marcado = crudo.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  const code = (codigo || marcado?.[1] || '').trim();
  let nombre = (marcado?.[2] ?? crudo).replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
  if (code && nombre.toUpperCase().startsWith(code.toUpperCase())) nombre = nombre.slice(code.length).trim();
  if (!nombre || nombre.toUpperCase() === code.toUpperCase()) return '';
  return nombre;
}

export function conPedidoInicial(materiales: MaterialPedido[]): MaterialPedido[] {
  return materiales.map((material) => ({
    ...material,
    pedido: material.codigo === CHIP_CODIGO || material.codigo === MODEM_CODIGO,
  }));
}

export function borradorLibre(orden: { cotizacion: boolean; imei: string; gsm: string; lotes: number }): boolean {
  return !orden.cotizacion && !orden.imei.trim() && !orden.gsm.trim() && orden.lotes === 0;
}

export function notasRegistro(datos: {
  contenedor: string;
  maquina: string;
  chip: string;
  imei: string;
  modem: string;
  cotizacion: string[];
  tecnico: string;
  pedidos: string[];
}): { equipo: string; cotizacion: string } {
  const equipo = [
    `Contenedor ${datos.contenedor || 'sin contenedor'}`,
    `Máquina ${datos.maquina || 'sin máquina'}`,
    datos.chip ? `Chip ${datos.chip}` : '',
    datos.imei ? `IMEI ${datos.imei}` : '',
    datos.modem ? `Módem ${datos.modem}` : '',
  ].filter(Boolean).join('\n');
  const cotizacion = [...datos.cotizacion, datos.tecnico ? `Técnico ${datos.tecnico}` : ''].filter(Boolean).join('\n');
  return { equipo, cotizacion };
}

export function notaInsumos(datos: {
  contenedor: string;
  maquina: string;
  chip: string;
  imei: string;
  modem: string;
  cotizacion: string[];
  tecnico: string;
  pedidos: string[];
}): string {
  const notas = notasRegistro(datos);
  const pedidos = ['Se piden:', ...(datos.pedidos.length ? datos.pedidos : ['Ninguno'])].join('\n');
  return `${notas.equipo}\n\n${notas.cotizacion}\n\n${pedidos}`;
}

export function huellaConsumidos(materiales: MaterialPedido[]): string {
  return materiales
    .filter((material) => material.pedido && material.cantidad > 0)
    .map((material) => `${material.moveId}|${material.codigo}|${material.cantidad}`)
    .sort()
    .join('\n');
}

export function textoMateriales(materiales: MaterialPedido[], chip: string, modem: string): string {
  const pedidos = materiales.filter((material) => material.pedido && material.cantidad > 0);
  const lineas = pedidos.map((material) => `${material.codigo || material.nombre}: ${material.cantidad} ${material.unidad}`.trim());
  lineas.push(chip ? `Chip ${chip}` : 'Sin chip detectado');
  lineas.push(modem.trim() ? `Módem ${modem.trim()}` : 'Módem: Odoo elige la serie');
  return lineas.join('\n');
}
