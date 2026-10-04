import type { ClienteGmail } from './cliente-gmail';
import { ClienteGmailGoogle } from './cliente-gmail-google';
import type { Configuracion } from '../configuracion';

let reemplazo: ClienteGmail | null = null;

export function usarClienteGmailDePrueba(cliente: ClienteGmail | null): void {
  reemplazo = cliente;
}

export function crearClienteGmail(config: Configuracion, leerRefresh: () => Promise<string>): ClienteGmail {
  if (reemplazo) return reemplazo;
  return new ClienteGmailGoogle(config, leerRefresh);
}
