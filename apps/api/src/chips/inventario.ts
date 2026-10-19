export type LoteSerie = { id: number; serie: string; producto: string; cantidad: number };

export type LineaSerie = {
  loteId: number;
  fecha: string;
  referencia: string;
  producto: string;
  desde: string;
  hacia: string;
  cantidad: number;
};

export type EstadoChip = 'disponible' | 'ocupado' | 'sin_dato';

export type LecturaSerie = {
  estado: EstadoChip;
  telemetria: string;
  orden: string;
  ocupadoEn: string | null;
  movimientos: LineaSerie[];
};

export function esChip(producto: string): boolean {
  return /\bCHIP\b/i.test(producto);
}

export function clasificar(lotes: LoteSerie[], lineas: LineaSerie[]): LecturaSerie {
  const movimientos = [...lineas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (lotes.length === 0) return { estado: 'sin_dato', telemetria: '', orden: '', ocupadoEn: null, movimientos };
  const chips = lotes.filter((lote) => esChip(lote.producto));
  const otros = lotes.filter((lote) => !esChip(lote.producto));
  const enMano = chips.some((lote) => lote.cantidad > 0);
  const telemetria = otros.find((lote) => lote.cantidad > 0) ?? otros[0];
  const fabricacion = movimientos.find((linea) => linea.referencia.includes('/MO/') && esChip(linea.producto));
  const producido = movimientos.find((linea) => linea.referencia.includes('/MO/') && !esChip(linea.producto));
  if (!enMano && (telemetria || fabricacion)) {
    return {
      estado: 'ocupado',
      telemetria: telemetria?.producto || producido?.producto || '',
      orden: fabricacion?.referencia || producido?.referencia || '',
      ocupadoEn: fabricacion?.fecha || producido?.fecha || null,
      movimientos,
    };
  }
  if (enMano) return { estado: 'disponible', telemetria: '', orden: '', ocupadoEn: null, movimientos };
  return { estado: 'ocupado', telemetria: telemetria?.producto || '', orden: fabricacion?.referencia || '', ocupadoEn: fabricacion?.fecha || null, movimientos };
}
