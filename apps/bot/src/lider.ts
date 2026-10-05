export type MarcaLider = { dueno: string; vence: number };

export function puedeTomar(actual: MarcaLider | null, yo: string, ahora: number): boolean {
  if (!actual) return true;
  if (actual.vence <= ahora) return true;
  return actual.dueno === yo;
}
