import type { SesionPublica } from '@sgit/shared';

const CLAVE = 'sgit.sesion';

export function leerSesionGuardada(): SesionPublica | null {
  const crudo = sessionStorage.getItem(CLAVE);
  if (!crudo) return null;
  try {
    const sesion = JSON.parse(crudo) as SesionPublica;
    if (!sesion.token || !sesion.usuario?.correo) return null;
    return sesion;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: SesionPublica): void {
  sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
}

export function olvidarSesion(): void {
  sessionStorage.removeItem(CLAVE);
}

export async function entrar(apiUrl: string, correo: string, contrasena: string): Promise<SesionPublica> {
  const respuesta = await fetch(`${apiUrl}/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo, contrasena }),
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new Error(cuerpo?.message ?? 'No se pudo ingresar.');
  }
  return (await respuesta.json()) as SesionPublica;
}
