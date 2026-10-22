import { RUTA_ACCESO } from '@sgit/shared';

export function urlDelApi(): string | null {
  const valor = import.meta.env.VITE_API_URL;
  const pedido = valor === undefined ? 'http://localhost:18003' : valor.trim();
  if (pedido === '') return null;
  const limpio = pedido.replace(/\/$/, '');
  return limpio.endsWith(RUTA_ACCESO) ? limpio : `${limpio}${RUTA_ACCESO}`;
}
