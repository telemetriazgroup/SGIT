export type EstadoServicio = 'listo' | 'no_listo';

export type Salud = {
  api: EstadoServicio;
  postgres: EstadoServicio;
  redis: EstadoServicio;
  archivos: EstadoServicio;
};

export type Rol = 'operador' | 'administrador';

export type UsuarioPublico = {
  nombre: string;
  correo: string;
  rol: Rol;
};

export type SesionPublica = {
  token: string;
  usuario: UsuarioPublico;
};
