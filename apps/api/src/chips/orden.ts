import { textoPlano } from '../odoo/lectura';

export type ComponenteOrden = {
  producto: string;
  porConsumir: number;
  consumido: number;
  unidad: string;
  desde: string;
  serie: string;
};

export type NotaOrden = {
  fecha: string;
  autor: string;
  texto: string;
  imagenes: Array<{ id: string; nombre: string; mime: string }>;
};

export type CopiaOrden = {
  nombre: string;
  producto: string;
  estado: string;
  pasos: string[];
  ficha: Array<{ nombre: string; valor: string; lado: 'izq' | 'der' }>;
  componentes: ComponenteOrden[];
  notas: NotaOrden[];
  lotesPropios: boolean;
};

export const PASOS_ORDEN = ['draft', 'confirmed', 'progress', 'done'];

export const ESTADO_ORDEN: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  progress: 'En progreso',
  to_close: 'Por cerrar',
  done: 'Hecho',
  cancel: 'Cancelada',
};

type OrdenLeida = {
  nombre: string;
  estado: string;
  producto: string;
  cantidad: number;
  produciendo: number;
  inicio: string;
  fin: string;
  responsable: string;
  lista: string;
  serie: string;
};

type ComponenteLeido = {
  producto: string;
  porConsumir: number;
  consumido: number;
  unidad: string;
  desde: string;
  serie: string;
};

type NotaLeida = {
  fecha: string;
  autor: string;
  texto: string;
  imagenes: Array<{ id: string; nombre: string; mime: string }>;
};

export function armarOrden(orden: OrdenLeida, componentes: ComponenteLeido[], notas: NotaLeida[]): CopiaOrden {
  const pasos = orden.estado === 'cancel' ? ['draft', 'cancel'] : orden.estado === 'to_close' ? [...PASOS_ORDEN.slice(0, 3), 'to_close', 'done'] : PASOS_ORDEN;
  return {
    lotesPropios: true,
    nombre: orden.nombre,
    producto: limpiar(orden.producto),
    estado: orden.estado,
    pasos,
    ficha: (
      [
        { nombre: 'Producto', valor: limpiar(orden.producto), lado: 'izq' },
        { nombre: 'Cantidad', valor: textoNumero(orden.cantidad), lado: 'izq' },
        { nombre: 'Lista de materiales', valor: limpiar(orden.lista), lado: 'izq' },
        { nombre: 'Número de serie/lote', valor: orden.serie, lado: 'izq' },
        { nombre: 'Responsable', valor: orden.responsable, lado: 'izq' },
        { nombre: 'Inicio', valor: orden.inicio, lado: 'der' },
        { nombre: 'Fin', valor: orden.fin, lado: 'der' },
        { nombre: 'Cantidad producida', valor: textoNumero(orden.produciendo), lado: 'der' },
      ] as const satisfies readonly { nombre: string; valor: string; lado: 'izq' | 'der' }[]
    ).filter((campo) => campo.valor),
    componentes: componentes.map((componente) => ({ ...componente, producto: limpiar(componente.producto) })),
    notas: notas
      .map((nota) => ({ ...nota, texto: textoPlano(nota.texto) }))
      .filter((nota) => nota.texto || nota.imagenes.length > 0),
  };
}

function limpiar(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

export function serieChipDe(componentes: Array<{ producto: string; serie: string }>): string {
  return componentes.find((item) => /INDND4855|\bCHIP\b/i.test(item.producto))?.serie ?? '';
}

export function serieCoincide(serie: string, celular: string, imei: string): boolean {
  const partes = serie.split(/[,;\s]+/).map((parte) => parte.replace(/\D/g, '')).filter(Boolean);
  const cel = celular.replace(/\D/g, '');
  const imeiLimpio = imei.replace(/\D/g, '');
  return partes.some((parte) => (cel.length > 0 && parte === cel) || (imeiLimpio.length > 0 && parte === imeiLimpio));
}

export function marcaDeOrden(escritoEn: string, fechas: string[]): string {
  const ultima = fechas.filter(Boolean).sort().at(-1) ?? '';
  return `${escritoEn}|${ultima}`;
}

export function seriesDe(ids: unknown, nombres: Map<number, string>): string {
  if (!Array.isArray(ids)) return '';
  return ids
    .map((id) => nombres.get(Number(id)) ?? '')
    .filter(Boolean)
    .join(', ');
}

function textoNumero(valor: number): string {
  if (!Number.isFinite(valor)) return '';
  return String(valor);
}
