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
  app.enableCors({ origin: configuracion.webOrigin });
  await app.listen(configuracion.port, '0.0.0.0');
}

main();
