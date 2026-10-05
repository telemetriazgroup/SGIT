import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { Conexiones } from './conexiones';

export class PrepararBase {
  constructor(private readonly conexiones: Conexiones) {}

  async onModuleInit(): Promise<void> {
    const carpeta = path.join(__dirname, 'db');
    const archivos = readdirSync(carpeta)
      .filter((nombre) => nombre.endsWith('.sql'))
      .sort();
    for (const archivo of archivos) {
      await this.conexiones.pg.query(readFileSync(path.join(carpeta, archivo), 'utf8'));
    }
    await this.sembrarOperador();
    await this.sembrarCuentas();
    await this.conexiones.asegurarBucket();
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexiones.cerrar();
  }

  private async sembrarOperador(): Promise<void> {
    const { nombre, correo, password, rol } = this.conexiones.semilla;
    const hash = await bcrypt.hash(password, 10);
    await this.conexiones.pg.query(
      `INSERT INTO usuario (id, nombre, correo, contrasena_hash, rol)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (correo) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             contrasena_hash = EXCLUDED.contrasena_hash,
             rol = EXCLUDED.rol,
             activo = true`,
      [randomUUID(), nombre, correo, hash, rol],
    );
  }

  private async sembrarCuentas(): Promise<void> {
    const cuentas = [
      ['Superusuario', 'superusuario@sgit.local', 'superusuario-prueba', 'superusuario'],
      ['Administrador', 'admin@sgit.local', 'admin-prueba', 'administrador'],
      ['Técnico de prueba', 'tecnico@sgit.local', 'tecnico-prueba', 'tecnico'],
    ] as const;
    for (const [nombre, correo, password, rol] of cuentas) {
      const hash = await bcrypt.hash(password, 10);
      await this.conexiones.pg.query(
        `INSERT INTO usuario (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (correo) DO NOTHING`,
        [randomUUID(), nombre, correo, hash, rol],
      );
    }
  }
}
