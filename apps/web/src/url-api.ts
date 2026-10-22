import { RUTA_ACCESO } from '@sgit/shared';

type Ubicacion = { protocol: string; hostname: string; port?: string };

export function urlDelApi(ubicacion?: Ubicacion): string | null {
  const valor = import.meta.env.VITE_API_URL;
  const pedido = valor === undefined ? 'http://localhost:18003' : valor.trim();
  if (pedido === '') return null;
  const configurada = conRuta(pedido);
  const pagina = ubicacion ?? (typeof window === 'undefined' ? undefined : window.location);
  if (!pagina || hostLocal(pagina.hostname) || !apuntaALocal(configurada)) return configurada;
  const protocolo = pagina.protocol === 'https:' ? 'https:' : 'http:';
  const puerto = pagina.port ? `:${pagina.port}` : '';
  return `${protocolo}//${pagina.hostname}${puerto}/servicio`;
}

function conRuta(pedido: string): string {
  const limpio = pedido.replace(/\/$/, '');
  return limpio.endsWith(RUTA_ACCESO) ? limpio : `${limpio}${RUTA_ACCESO}`;
}

function hostLocal(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function apuntaALocal(url: string): boolean {
  try {
    return hostLocal(new URL(url).hostname);
  } catch {
    return false;
  }
}

