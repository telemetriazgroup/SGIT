import type { Configuracion } from '../configuracion';
import { ALCANCE_GMAIL, type ClienteGmail, type MensajeDescargado, type PaginaIds, type ParteAdjunto } from './cliente-gmail';

type Encabezado = { name?: string; value?: string };
type Parte = {
  mimeType?: string;
  filename?: string;
  headers?: Encabezado[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Parte[];
};

export class ClienteGmailGoogle implements ClienteGmail {
  private accessToken: string | null = null;
  private vence = 0;

  constructor(
    private readonly config: Configuracion,
    private readonly leerRefresh: () => Promise<string>,
  ) {}

  async perfil(): Promise<{ historyId: string; correo: string }> {
    const json = await this.pedirJson(new URL('https://gmail.googleapis.com/gmail/v1/users/me/profile'));
    return { historyId: String(json.historyId), correo: String(json.emailAddress ?? '') };
  }

  async listar(consulta: string, pageToken?: string): Promise<PaginaIds> {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', consulta);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const json = await this.pedirJson(url);
    const mensajes = (json.messages ?? []) as Array<{ id: string }>;
    return {
      ids: mensajes.map((mensaje) => mensaje.id),
      nextPageToken: json.nextPageToken ? String(json.nextPageToken) : undefined,
    };
  }

  async historial(inicio: string): Promise<{ ids: string[]; historyId: string }> {
    const ids = new Set<string>();
    let page: string | undefined;
    let historyId = inicio;
    do {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
      url.searchParams.set('startHistoryId', inicio);
      url.searchParams.set('historyTypes', 'messageAdded');
      if (page) url.searchParams.set('pageToken', page);
      const json = await this.pedirHistoria(url);
      if (json.historyId) historyId = String(json.historyId);
      for (const entrada of (json.history ?? []) as Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>) {
        for (const agregado of entrada.messagesAdded ?? []) {
          if (agregado.message?.id) ids.add(agregado.message.id);
        }
      }
      page = json.nextPageToken ? String(json.nextPageToken) : undefined;
    } while (page);
    return { ids: [...ids], historyId };
  }

  async obtener(id: string): Promise<MensajeDescargado> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
    url.searchParams.set('format', 'full');
    const json = await this.pedirJson(url);
    return interpretarMensaje(json as { id: string; threadId: string; payload?: Parte });
  }

  async adjunto(mensajeId: string, attachmentId: string): Promise<Buffer> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(mensajeId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    const json = await this.pedirJson(url);
    return Buffer.from(String(json.data ?? ''), 'base64url');
  }

  private async pedirHistoria(url: URL): Promise<Record<string, any>> {
    try {
      return await this.pedirJson(url);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : '';
      if (mensaje.startsWith('Gmail 404')) throw new Error(`Gmail rechazó startHistoryId. ${mensaje}`);
      throw error;
    }
  }

  private async pedirJson(url: URL): Promise<Record<string, any>> {
    const token = await this.token();
    const respuesta = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!respuesta.ok) {
      const texto = await respuesta.text();
      throw new Error(`Gmail ${respuesta.status} ${url.pathname}: ${texto.slice(0, 240)}`);
    }
    return (await respuesta.json()) as Record<string, any>;
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.vence) return this.accessToken;
    const refresh = await this.leerRefresh();
    const json = await canjear(this.config, {
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });
    this.accessToken = String(json.access_token);
    this.vence = Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken;
  }
}

export async function canjearCodigo(config: Configuracion, code: string): Promise<{ refreshToken: string; correo: string }> {
  const json = await canjear(config, { grant_type: 'authorization_code', code });
  const refreshToken = String(json.refresh_token ?? '');
  if (!refreshToken) {
    throw new Error('Google no entregó un permiso duradero. Vuelve a conectar y acepta el acceso.');
  }
  const perfil = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${json.access_token}` },
  });
  if (!perfil.ok) throw new Error('No se pudo leer la cuenta autorizada.');
  const cuerpo = (await perfil.json()) as { emailAddress?: string };
  return { refreshToken, correo: String(cuerpo.emailAddress ?? '') };
}

async function canjear(config: Configuracion, extra: Record<string, string>): Promise<Record<string, unknown>> {
  const gmail = config.gmail;
  if (!gmail) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.');
  const cuerpo = new URLSearchParams({
    client_id: gmail.clientId,
    client_secret: gmail.clientSecret,
    redirect_uri: gmail.redirectUri,
    ...extra,
  });
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: cuerpo,
  });
  const json = (await respuesta.json()) as Record<string, unknown>;
  if (!respuesta.ok) {
    throw new Error(`Google no aceptó el permiso: ${String(json.error ?? respuesta.status)}`);
  }
  return json;
}

function interpretarMensaje(json: { id: string; threadId: string; labelIds?: string[]; payload?: Parte }): MensajeDescargado {
  const encabezados = json.payload?.headers ?? [];
  const html: string[] = [];
  const texto: string[] = [];
  const adjuntos: ParteAdjunto[] = [];
  caminar(json.payload, html, texto, adjuntos);
  const cruda = valorEncabezado(encabezados, 'Date');
  const fecha = cruda ? new Date(cruda) : null;
  return {
    id: json.id,
    threadId: json.threadId,
    de: valorEncabezado(encabezados, 'From'),
    para: valorEncabezado(encabezados, 'To'),
    cc: valorEncabezado(encabezados, 'Cc'),
    fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : null,
    asunto: valorEncabezado(encabezados, 'Subject'),
    html: html.join('\n'),
    texto: texto.join('\n'),
    etiquetas: json.labelIds ?? [],
    adjuntos,
  };
}

function caminar(parte: Parte | undefined, html: string[], texto: string[], adjuntos: ParteAdjunto[]): void {
  if (!parte) return;
  const cid = valorEncabezado(parte.headers ?? [], 'Content-ID').replace(/[<>]/g, '') || null;
  const disposicion = valorEncabezado(parte.headers ?? [], 'Content-Disposition');
  const nombre = parte.filename ?? '';
  if (parte.body?.attachmentId) {
    adjuntos.push({
      attachmentId: parte.body.attachmentId,
      nombre: nombre || 'adjunto',
      mime: parte.mimeType || 'application/octet-stream',
      tamano: parte.body.size ?? 0,
      contentId: cid,
      inline: disposicion.toLowerCase().includes('inline') || Boolean(cid),
    });
  } else if (parte.mimeType === 'text/html' && parte.body?.data) {
    html.push(Buffer.from(parte.body.data, 'base64url').toString('utf8'));
  } else if (parte.mimeType === 'text/plain' && parte.body?.data) {
    texto.push(Buffer.from(parte.body.data, 'base64url').toString('utf8'));
  }
  for (const hijo of parte.parts ?? []) caminar(hijo, html, texto, adjuntos);
}

function valorEncabezado(encabezados: Encabezado[], nombre: string): string {
  const hallado = encabezados.find((encabezado) => encabezado.name?.toLowerCase() === nombre.toLowerCase());
  return hallado?.value ?? '';
}
