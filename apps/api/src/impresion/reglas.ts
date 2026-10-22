export type TrabajoImpresion = {
  id?: string;
  status?: string;
  printer_job_id?: number | null;
  error?: string | null;
  printer_reasons?: string[];
  pages?: number | null;
  duplicate?: boolean;
};

export function normalizarBase(valor: string): string {
  const texto = valor.trim();
  if (!texto) throw new Error('Indica la dirección de la API de impresión.');
  const conProtocolo = /^https?:\/\//i.test(texto) ? texto : `http://${texto}`;
  let url: URL;
  try {
    url = new URL(conProtocolo);
  } catch {
    throw new Error('La dirección no es válida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('La dirección tiene que ser http o https.');
  if (url.username || url.password) throw new Error('La dirección no lleva usuario ni clave.');
  if (!url.hostname) throw new Error('La dirección no tiene servidor.');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('La dirección es solo el servidor y el puerto, sin ruta.');
  if (url.search || url.hash) throw new Error('La dirección es solo el servidor y el puerto, sin ruta.');
  return url.origin;
}

export function esPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}

export function textoTrabajo(trabajo: TrabajoImpresion): string {
  const id = trabajo.id ? ` Trabajo ${trabajo.id}.` : '';
  if (trabajo.duplicate) return `Ese documento ya estaba enviado. No se imprimió otra vez. Estado: ${trabajo.status || 'desconocido'}.${id}`;
  if (trabajo.status === 'completed' && trabajo.printer_job_id != null && !trabajo.error) {
    const paginas = typeof trabajo.pages === 'number' && trabajo.pages > 0 ? ` ${trabajo.pages} ${trabajo.pages === 1 ? 'página' : 'páginas'}.` : '';
    return `Quedó impreso.${paginas}${id}`;
  }
  if (trabajo.status === 'failed' || trabajo.status === 'canceled') {
    const motivos = [trabajo.error, ...(trabajo.printer_reasons ?? []).filter((motivo) => motivo && motivo !== 'none')].filter(Boolean);
    return `La impresora no lo terminó.${motivos.length ? ` ${motivos.join('. ')}.` : ''}${id}`;
  }
  return `Quedó enviado. La impresora lo tiene en ${nombreEstado(trabajo.status)}.${id}`;
}

function nombreEstado(estado: string | undefined): string {
  if (estado === 'queued') return 'cola';
  if (estado === 'sending') return 'envío';
  if (estado === 'printing') return 'impresión';
  if (estado === 'retrying') return 'reintento';
  return estado || 'cola';
}
