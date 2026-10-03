import { HeadBucketCommand } from '@aws-sdk/client-s3';
import type { EstadoServicio, Salud } from '@sgit/shared';
import { Conexiones } from '../conexiones';

export class SaludService {
  constructor(private readonly conexiones: Conexiones) {}

  async consultar(): Promise<Salud> {
    const [postgres, redis, archivos] = await Promise.all([
      this.probar(() => this.conexiones.pg.query('select 1')),
      this.probar(() => this.conexiones.redis.ping().then((respuesta) => {
        if (respuesta !== 'PONG') throw new Error('redis sin PONG');
      })),
      this.probar(() => this.conexiones.s3.send(new HeadBucketCommand({ Bucket: this.conexiones.bucket }))),
    ]);

    return {
      api: 'listo',
      postgres,
      redis,
      archivos,
    };
  }

  private async probar(accion: () => Promise<unknown>): Promise<EstadoServicio> {
    try {
      await accion();
      return 'listo';
    } catch {
      return 'no_listo';
    }
  }
}
