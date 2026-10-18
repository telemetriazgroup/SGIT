import type { Rol } from '@sgit/shared';

const ROLES: readonly Rol[] = ['operador', 'administrador', 'superusuario', 'tecnico', 'despacho'];

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

export function puedeEditarTarea(rol: Rol): boolean {
  return rol === 'administrador' || rol === 'superusuario' || rol === 'operador';
}

export function puedeOperarSistema(rol: Rol): boolean {
  return rol === 'superusuario' || rol === 'operador';
}
