export function urlDelApi(): string | null {
  const valor = import.meta.env.VITE_API_URL;
  if (valor === undefined) return 'http://localhost:18003';
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
