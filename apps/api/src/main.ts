import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { leerConfiguracion } from './configuracion';

async function main() {
  const configuracion = leerConfiguracion();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const { json, urlencoded } = await import('express');
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  app.enableCors({ origin: origenesWeb(configuracion.webOrigin), exposedHeaders: ['content-disposition'] });
  await app.listen(configuracion.port, '0.0.0.0');
}

function origenesWeb(origen: string): string[] {
  const origenes = [origen];
  try {
    const url = new URL(origen);
    const puerto = url.port ? `:${url.port}` : '';
    if (url.hostname === 'localhost') origenes.push(`${url.protocol}//127.0.0.1${puerto}`);
    if (url.hostname === '127.0.0.1') origenes.push(`${url.protocol}//localhost${puerto}`);
  } catch {
    return origenes;
  }
  return origenes;
}

main();
