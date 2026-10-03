import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { Configuracion } from './configuracion';

export class Conexiones {
  readonly pg: Pool;
  readonly redis: Redis;
  readonly s3: S3Client;
  readonly bucket: string;
  readonly sesionSecreto: string;
  readonly semilla: Configuracion['semilla'];

  constructor(configuracion: Configuracion) {
    this.pg = new Pool({ connectionString: configuracion.databaseUrl });
    this.redis = new Redis(configuracion.redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (intento) => (intento > 2 ? null : 200),
    });
    this.redis.on('error', () => {
      // El chequeo de salud informa el fallo. Este listener evita tumbar el proceso.
    });
    this.s3 = new S3Client({
      region: configuracion.s3Region,
      endpoint: configuracion.s3Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: configuracion.s3AccessKey,
        secretAccessKey: configuracion.s3SecretKey,
      },
    });
    this.bucket = configuracion.s3Bucket;
    this.sesionSecreto = configuracion.sesionSecreto;
    this.semilla = configuracion.semilla;
  }

  async asegurarBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const codigo = (error as { name?: string }).name;
      const estado = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (codigo === 'NotFound' || codigo === 'NoSuchBucket' || estado === 404) {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        return;
      }
      throw error;
    }
  }

  async cerrar(): Promise<void> {
    await this.pg.end().catch(() => undefined);
    this.redis.disconnect();
  }
}
