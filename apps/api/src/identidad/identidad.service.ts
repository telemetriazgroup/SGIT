import { UnauthorizedException } from '@nestjs/common';
import type { SesionPublica, UsuarioPublico } from '@sgit/shared';
import bcrypt from 'bcryptjs';
import { Conexiones } from '../conexiones';
import { emitirToken, leerToken } from './token';

type FilaUsuario = {
  nombre: string;
  correo: string;
  contrasena_hash: string;
  rol: UsuarioPublico['rol'];
  activo: boolean;
};

export class IdentidadService {
  private hashFicticio: string | null = null;

  constructor(private readonly conexiones: Conexiones) {}

  async entrar(correo: string, contrasena: string): Promise<SesionPublica> {
    const normalizado = correo.trim().toLowerCase();
    const resultado = await this.conexiones.pg.query<FilaUsuario>(
      `SELECT nombre, correo, contrasena_hash, rol, activo
       FROM usuario
       WHERE correo = $1`,
      [normalizado],
    );
    const fila = resultado.rows[0];
    const hash = fila?.contrasena_hash ?? (await this.hashParaAusente());
    const coincide = await bcrypt.compare(contrasena, hash);
    if (!fila || !fila.activo || !coincide) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const usuario: UsuarioPublico = {
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
    };
    return {
      token: emitirToken(usuario, this.conexiones.sesionSecreto),
      usuario,
    };
  }

  async actual(token: string): Promise<UsuarioPublico> {
    const usuario = leerToken(token, this.conexiones.sesionSecreto);
    if (!usuario) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    const resultado = await this.conexiones.pg.query<{ activo: boolean }>(
      `SELECT activo FROM usuario WHERE correo = $1`,
      [usuario.correo],
    );
    if (!resultado.rows[0]?.activo) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    return usuario;
  }

  private async hashParaAusente(): Promise<string> {
    if (!this.hashFicticio) {
      this.hashFicticio = await bcrypt.hash('usuario-ausente', 10);
    }
    return this.hashFicticio;
  }
}
