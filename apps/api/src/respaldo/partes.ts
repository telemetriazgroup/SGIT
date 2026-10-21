export type Pieza = { id: string; peso: number };

export function partir(piezas: Pieza[], tope: number, maximo = 40): string[][] {
  const partes: string[][] = [];
  let actual: string[] = [];
  let peso = 0;
  const cerrar = () => {
    if (actual.length === 0) return;
    partes.push(actual);
    actual = [];
    peso = 0;
  };
  for (const pieza of piezas) {
    if (pieza.peso > tope || (actual.length > 0 && (peso + pieza.peso > tope || actual.length >= maximo))) cerrar();
    actual.push(pieza.id);
    peso += pieza.peso;
    if (pieza.peso > tope) cerrar();
  }
  cerrar();
  return partes;
}

export type ParteMensajes = {
  version: 1;
  tipo: 'mensajes';
  parte: number;
  partes: number;
  mensajes: MensajeExportado[];
};

export type MensajeExportado = {
  id: string;
  gmailMensajeId: string;
  gmailHiloId: string;
  de: string;
  para: string;
  cc: string;
  fecha: string | null;
  asunto: string;
  html: string;
  texto: string;
  htmlSeguro: string;
  replica: string;
  clasificacion: string | null;
  extraccion: unknown;
};

export type AdjuntoExportado = {
  id: string;
  gmailMensajeId: string;
  gmailAdjuntoId: string;
  contentId: string | null;
  nombre: string;
  mime: string;
  tamano: number;
  tipo: string;
  estado: string;
  clave: string | null;
  contenido?: string;
  archivo?: string;
};

export type ParteAdjuntos = {
  version: 1;
  tipo: 'adjuntos';
  parte: number;
  partes: number;
  adjuntos: AdjuntoExportado[];
};

export type ParteClasificacion = {
  version: 1;
  tipo: 'clasificacion';
  diccionario: Array<{ termino: string; activo: boolean }>;
  decisiones: Array<{ gmailHiloId: string; destino: string; motivo: string }>;
  internos: Array<{ gmailHiloId: string; estado: string; respuesta: string }>;
  tareas: TareaExportada[];
  situaciones: Array<{
    id: string;
    cot: string;
    gmailMensajeId: string;
    tipo: string;
    resumen: string;
    citaAnterior: unknown;
    citaNueva: unknown;
  }>;
  habilitados: Array<{ clase: string; clave: string }>;
};

export type TareaExportada = {
  id: string;
  cot: string;
  estado: string;
  ticket: string | null;
  descripcion: string | null;
  lugar: string | null;
  cliente: string | null;
  cantidad: number | null;
  temperatura: string | null;
  producto: string | null;
  contenedor: string | null;
  comercialNombre: string | null;
  comercialCargo: string | null;
  comercialCorreo: string | null;
  comercialTelefono: string | null;
  citaFecha: string | null;
  citaHora: string | null;
  citaDireccion: string | null;
  citaMapa: string | null;
  citaParcialFecha: string | null;
  citaParcialHora: string | null;
  fragmentos: unknown;
  gmailMensajeId: string | null;
  cots: string[];
  referencias: string[];
  camposCorregidos: string[];
  responsableCorreo: string | null;
  responsableNombre: string | null;
  recordarEn: string | null;
  codigoEquipo: string | null;
  maquinaEquipo: string | null;
  campana: boolean;
  padreCot: string | null;
};

export function nombreParte(tipo: 'mensajes' | 'adjuntos' | 'clasificacion', parte?: number, extension = 'json'): string {
  if (tipo === 'clasificacion') return 'sgit-clasificacion.json';
  const numero = String(parte ?? 0).padStart(4, '0');
  return `sgit-correos-${tipo}-${numero}.${extension}`;
}
