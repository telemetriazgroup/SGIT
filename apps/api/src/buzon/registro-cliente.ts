import type { ClienteGmail } from './cliente-gmail';
import { ClienteGmailGoogle } from './cliente-gmail-google';
import type { Configuracion } from '../configuracion';

let reemplazo: ClienteGmail | null = null;
const vivos = new Set<ClienteGmailGoogle>();

export function usarClienteGmailDePrueba(cliente: ClienteGmail | null): void {
  reemplazo = cliente;
}

export function crearClienteGmail(config: Configuracion, leerRefresh: () => Promise<string>): ClienteGmail {
  if (reemplazo) return reemplazo;
  const cliente = new ClienteGmailGoogle(config, leerRefresh);
  vivos.add(cliente);
  return cliente;
}

export function olvidarAccesosGmail(): void {
  for (const cliente of vivos) cliente.olvidarAcceso();
}
