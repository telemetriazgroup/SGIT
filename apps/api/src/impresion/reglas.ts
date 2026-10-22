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

export type CapturaMensaje = {
  tipoProceso: string;
  tipoWhatsapp: string;
  tieneMedia: boolean;
  mime: string;
  nombre: string;
  texto: string;
  leyenda: string;
  ruta: boolean;
  claveMedia: boolean;
  etapa: string;
  bytes: number;
  esPdf: boolean;
  error: string;
  decision: string;
  claves: string;
};

export function textoCaptura(captura: CapturaMensaje): string {
  const corto = (valor: string) => valor.replace(/\s+/g, ' ').trim().slice(0, 180);
  return [
    'El mensaje de WhatsApp no se guardó como PDF y no se mandó a imprimir.',
    `Decisión: ${corto(captura.decision) || 'sin decisión'}`,
    `Tipo que vio el proceso: ${corto(captura.tipoProceso) || '(vacío)'}`,
    `Tipo en WhatsApp: ${corto(captura.tipoWhatsapp) || '(no se pudo leer)'}`,
    `Tiene archivo: ${captura.tieneMedia ? 'sí' : 'no'}`,
    `MIME: ${corto(captura.mime) || '(vacío)'}`,
    `Nombre: ${corto(captura.nombre) || '(vacío)'}`,
    `Texto: ${corto(captura.texto) || '(vacío)'}`,
    `Leyenda: ${corto(captura.leyenda) || '(vacío)'}`,
    `Ruta de descarga: ${captura.ruta ? 'sí' : 'no'}`,
    `Clave de media: ${captura.claveMedia ? 'sí' : 'no'}`,
    `Etapa del archivo: ${corto(captura.etapa) || '(vacía)'}`,
    `Bytes leídos: ${Number.isFinite(captura.bytes) ? captura.bytes : 0}`,
    `Empieza por %PDF: ${captura.esPdf ? 'sí' : 'no'}`,
    `Error: ${corto(captura.error) || '(ninguno)'}`,
    `Campos del mensaje: ${corto(captura.claves) || '(ninguno)'}`,
  ].join('\n');
}

export function capturaDe(valor: unknown): CapturaMensaje | null {
  if (!valor || typeof valor !== 'object') return null;
  const fila = valor as Record<string, unknown>;
  const texto = (campo: string) => (typeof fila[campo] === 'string' ? fila[campo] : '');
  const bytes = typeof fila.bytes === 'number' && Number.isFinite(fila.bytes) ? Math.max(0, Math.floor(fila.bytes)) : 0;
  return {
    tipoProceso: texto('tipoProceso'),
    tipoWhatsapp: texto('tipoWhatsapp'),
    tieneMedia: fila.tieneMedia === true,
    mime: texto('mime'),
    nombre: texto('nombre'),
    texto: texto('texto'),
    leyenda: texto('leyenda'),
    ruta: fila.ruta === true,
    claveMedia: fila.claveMedia === true,
    etapa: texto('etapa'),
    bytes,
    esPdf: fila.esPdf === true,
    error: texto('error'),
    decision: texto('decision'),
    claves: texto('claves'),
  };
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
