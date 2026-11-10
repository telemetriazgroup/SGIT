import { BadGatewayException } from '@nestjs/common';

const LISTAR = 'http://161.132.206.104:9050/Generador/dispositivos/listar/';
const LIVE = 'http://161.132.206.104:9050/Generador/live/';

export type ClienteGenset = {
  listar(): Promise<unknown>;
  live(imei: string): Promise<unknown>;
};

export function urlsGenset(env: NodeJS.ProcessEnv = process.env): { listar: string; live: string } {
  return {
    listar: urlHttp(env.GENSET_LISTAR_URL, LISTAR),
    live: urlHttp(env.GENSET_LIVE_URL, LIVE),
  };
}

export function clienteHttp(env: NodeJS.ProcessEnv = process.env): ClienteGenset {
  const urls = urlsGenset(env);
  return {
    listar: () => postJson(urls.listar, {}),
    live: (imei) => postJson(urls.live, { imei }),
  };
}

function urlHttp(valor: string | undefined, defecto: string): string {
  const texto = valor?.trim();
  if (!texto) return defecto;
  try {
    const url = new URL(texto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return defecto;
    return texto;
  } catch {
    return defecto;
  }
}

async function postJson(url: string, cuerpo: unknown): Promise<unknown> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new BadGatewayException(`No llegué al servidor de generadores en ${hostDe(url)}.`);
  }
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new BadGatewayException(`El servidor de generadores respondió ${respuesta.status}.`);
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new BadGatewayException('El servidor de generadores no devolvió JSON.');
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'el servidor de generadores';
  }
}
