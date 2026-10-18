import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Rol, SesionPublica, UsuarioPublico } from '@sgit/shared';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { Conexiones } from '../conexiones';
import { esRol } from './permisos';

export type Cuenta = {
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  telefono: string | null;
  consulta_despacho: boolean;
};
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
    if (!fila || !fila.activo || !coincide || !esRol(fila.rol)) {
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
    const sesion = leerToken(token, this.conexiones.sesionSecreto);
    if (!sesion) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    const resultado = await this.conexiones.pg.query<{ nombre: string; correo: string; rol: string; activo: boolean }>(
      `SELECT nombre, correo, rol, activo FROM usuario WHERE correo = $1`,
      [sesion.correo],
    );
    const fila = resultado.rows[0];
    if (!fila?.activo || !esRol(fila.rol)) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    return { nombre: fila.nombre, correo: fila.correo, rol: fila.rol };
  }

  async listar(): Promise<Cuenta[]> {
    const filas = await this.conexiones.pg.query<{ nombre: string; correo: string; rol: string; activo: boolean; telefono: string | null; consulta_despacho: boolean }>(
      `SELECT nombre, correo, rol, activo, telefono, consulta_despacho FROM usuario ORDER BY nombre`,
    );
    return filas.rows.filter((fila): fila is Cuenta => esRol(fila.rol));
  }

  async perfil(correo: string): Promise<Cuenta> {
    const cuenta = await this.cuenta(correo);
    if (!cuenta) throw new UnauthorizedException('Sesión no válida.');
    return cuenta;
  }

  async guardarPerfil(correo: string, nombre: string, telefono: string): Promise<Cuenta> {
    const limpio = nombre.trim();
    if (!limpio) throw new BadRequestException('Indica el nombre.');
    const numero = telefonoLimpio(telefono);
    try {
      const resultado = await this.conexiones.pg.query(
        `UPDATE usuario SET nombre = $2, telefono = $3 WHERE correo = $1`,
        [correo, limpio, numero],
      );
      if ((resultado.rowCount ?? 0) === 0) throw new UnauthorizedException('Sesión no válida.');
    } catch (error) {
      if (tieneCodigo(error, '23505')) throw new ConflictException('Ese número ya está en otra cuenta.');
      throw error;
    }
    return this.perfil(correo);
  }

  async cambiarContrasena(correo: string, actual: string, nueva: string): Promise<void> {
    if (nueva.length < 8) throw new BadRequestException('La contraseña tiene al menos 8 caracteres.');
    if (nueva === actual) throw new BadRequestException('Elige una contraseña distinta.');
    const fila = await this.conexiones.pg.query<{ contrasena_hash: string }>(
      `SELECT contrasena_hash FROM usuario WHERE correo = $1 AND activo`,
      [correo],
    );
    const hash = fila.rows[0]?.contrasena_hash;
    if (!hash || !(await bcrypt.compare(actual, hash))) {
      throw new UnauthorizedException('La contraseña actual no coincide.');
    }
    await this.conexiones.pg.query(`UPDATE usuario SET contrasena_hash = $2 WHERE correo = $1`, [correo, await bcrypt.hash(nueva, 10)]);
  }

  async actualizar(
    actor: string,
    correo: string,
    nombre: string,
    rol: string,
    activo: boolean,
    telefono: string,
    consultaDespacho: boolean,
  ): Promise<Cuenta> {
    const destino = correo.trim().toLowerCase();
    const cuenta = await this.cuenta(destino);
    if (!cuenta) throw new BadRequestException('No está esa cuenta.');
    const limpio = nombre.trim();
    if (!limpio) throw new BadRequestException('Indica el nombre.');
    if (cuenta.rol === 'superusuario') {
      if (rol !== 'superusuario') throw new BadRequestException('El superusuario no cambia de tipo.');
      if (!activo) throw new BadRequestException('La cuenta de superusuario se mantiene activa.');
    } else if (rol !== 'administrador' && rol !== 'tecnico' && rol !== 'operador' && rol !== 'despacho') {
      throw new BadRequestException('El tipo es administrador, técnico, operador o despacho.');
    }
    if (actor === destino && !activo) throw new BadRequestException('No puedes desactivar tu propia cuenta.');
    const numero = telefonoLimpio(telefono);
    const pregunta = cuenta.rol === 'superusuario' ? false : rol === 'despacho' && consultaDespacho;
    try {
      await this.conexiones.pg.query(
        `UPDATE usuario SET nombre = $2, rol = $3, activo = $4, telefono = $5, consulta_despacho = $6 WHERE correo = $1`,
        [destino, limpio, cuenta.rol === 'superusuario' ? 'superusuario' : rol, cuenta.rol === 'superusuario' ? true : activo, numero, pregunta],
      );
    } catch (error) {
      if (tieneCodigo(error, '23505')) throw new ConflictException('Ese número ya está en otra cuenta.');
      throw error;
    }
    const guardada = await this.cuenta(destino);
    if (!guardada) throw new BadRequestException('No está esa cuenta.');
    return guardada;
  }

  async reiniciarContrasena(correo: string, contrasena: string): Promise<void> {
    if (contrasena.length < 8) throw new BadRequestException('La contraseña tiene al menos 8 caracteres.');
    const destino = correo.trim().toLowerCase();
    const resultado = await this.conexiones.pg.query(`UPDATE usuario SET contrasena_hash = $2 WHERE correo = $1`, [
      destino,
      await bcrypt.hash(contrasena, 10),
    ]);
    if ((resultado.rowCount ?? 0) === 0) throw new BadRequestException('No está esa cuenta.');
  }

  private async cuenta(correo: string): Promise<Cuenta | null> {
    const filas = await this.conexiones.pg.query<{
      nombre: string;
      correo: string;
      rol: string;
      activo: boolean;
      telefono: string | null;
      consulta_despacho: boolean;
    }>(
      `SELECT nombre, correo, rol, activo, telefono, consulta_despacho FROM usuario WHERE correo = $1`,
      [correo],
    );
    const fila = filas.rows[0];
    if (!fila || !esRol(fila.rol)) return null;
    return {
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
      activo: fila.activo,
      telefono: fila.telefono,
      consulta_despacho: fila.consulta_despacho,
    };
  }

  async crear(nombre: string, correo: string, contrasena: string, rol: string, consultaDespacho = false): Promise<void> {
    const limpio = nombre.trim();
    const destino = correo.trim().toLowerCase();
    if (!limpio) throw new BadRequestException('Indica el nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) throw new BadRequestException('El correo no es válido.');
    if (contrasena.length < 8) throw new BadRequestException('La contraseña tiene al menos 8 caracteres.');
    if (rol !== 'administrador' && rol !== 'tecnico' && rol !== 'despacho') throw new BadRequestException('El rol es administrador, técnico o despacho.');
    const hash = await bcrypt.hash(contrasena, 10);
    try {
      await this.conexiones.pg.query(
        `INSERT INTO usuario (id, nombre, correo, contrasena_hash, rol, consulta_despacho) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), limpio, destino, hash, rol, rol === 'despacho' && consultaDespacho],
      );
    } catch (error) {
      if (tieneCodigo(error, '23505')) throw new ConflictException('Ese correo ya está registrado.');
      throw error;
    }
  }

  private async hashParaAusente(): Promise<string> {
    if (!this.hashFicticio) {
      this.hashFicticio = await bcrypt.hash('usuario-ausente', 10);
    }
    return this.hashFicticio;
  }
}

function telefonoLimpio(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length < 8 || digitos.length > 15) throw new BadRequestException('El teléfono tiene entre 8 y 15 dígitos.');
  return digitos;
}

function tieneCodigo(error: unknown, codigo: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === codigo;
}
