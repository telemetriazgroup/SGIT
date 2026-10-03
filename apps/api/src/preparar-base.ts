import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { Conexiones } from './conexiones';

export class PrepararBase {
  constructor(private readonly conexiones: Conexiones) {}

  async onModuleInit(): Promise<void> {
    const sql = readFileSync(path.join(__dirname, 'db', '001_usuario.sql'), 'utf8');
    await this.conexiones.pg.query(sql);
    await this.sembrarOperador();
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
}
