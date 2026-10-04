import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Conexiones } from '../conexiones';

export class AlmacenCorreo {
  constructor(private readonly conexiones: Conexiones) {}

  async guardar(clave: string, cuerpo: Buffer, mime: string): Promise<void> {
    await this.conexiones.s3.send(
      new PutObjectCommand({
        Bucket: this.conexiones.bucket,
        Key: clave,
        Body: cuerpo,
        ContentType: mime,
      }),
    );
  }

  async leer(clave: string): Promise<Buffer> {
    const respuesta = await this.conexiones.s3.send(
      new GetObjectCommand({ Bucket: this.conexiones.bucket, Key: clave }),
    );
    const bytes = await respuesta.Body?.transformToByteArray();
    if (!bytes) throw new Error('El archivo no está en el almacén.');
    return Buffer.from(bytes);
  }
}
