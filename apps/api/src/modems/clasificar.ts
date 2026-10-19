export type MovimientoModem = {
  fecha: string;
  referencia: string;
  desde: string;
  hacia: string;
  cantidad: number;
  estado: string;
};

export type ClaseModem = {
  estado: 'disponible' | 'fabricado' | 'salida';
  orden: string;
  salida: string;
  cuando: string | null;
};

export function clasificarModem(cantidad: number, movimientos: MovimientoModem[]): ClaseModem {
  const ordenados = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let fabricado: MovimientoModem | null = null;
  let salida: MovimientoModem | null = null;
  for (const movimiento of ordenados) {
    if (movimiento.hacia.includes('Production') && movimiento.referencia.includes('/MO/')) fabricado = movimiento;
    else if (/Customers|Clientes/i.test(movimiento.hacia)) salida = movimiento;
  }
  if (cantidad > 0) return { estado: 'disponible', orden: '', salida: '', cuando: null };
  if (fabricado && (!salida || fabricado.fecha >= salida.fecha)) {
    return { estado: 'fabricado', orden: fabricado.referencia, salida: '', cuando: fabricado.fecha };
  }
  if (salida) return { estado: 'salida', orden: '', salida: salida.referencia, cuando: salida.fecha };
  if (fabricado) return { estado: 'fabricado', orden: fabricado.referencia, salida: '', cuando: fabricado.fecha };
  return { estado: 'disponible', orden: '', salida: '', cuando: null };
}
