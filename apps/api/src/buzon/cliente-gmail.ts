export const INTERVALO_SYNC_MS = 3 * 60 * 1000;
export const LOTE_SYNC = 5;
export const ALCANCE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';

export type ParteAdjunto = {
  attachmentId: string;
  nombre: string;
  mime: string;
  tamano: number;
  contentId: string | null;
  inline: boolean;
};

export type MensajeDescargado = {
  id: string;
  threadId: string;
  de: string;
  para: string;
  cc: string;
  fecha: string | null;
  asunto: string;
  html: string;
  texto: string;
  etiquetas: string[];
  adjuntos: ParteAdjunto[];
};

export function consultaRecibidos(desde: Date, hasta: Date): string {
  const despues = Math.floor(desde.getTime() / 1000);
  const antes = Math.floor(hasta.getTime() / 1000);
  return `after:${despues} before:${antes} -in:sent`;
}

export function esEnviado(etiquetas: string[]): boolean {
  return etiquetas.includes('SENT');
}

export type PaginaIds = {
  ids: string[];
  nextPageToken?: string;
};

export interface ClienteGmail {
  perfil(): Promise<{ historyId: string; correo: string }>;
  listar(consulta: string, pageToken?: string): Promise<PaginaIds>;
  historial(inicio: string): Promise<{ ids: string[]; historyId: string }>;
  obtener(id: string): Promise<MensajeDescargado>;
  adjunto(mensajeId: string, attachmentId: string): Promise<Buffer>;
}
