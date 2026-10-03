import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { leerConfiguracion } from './configuracion';

async function main() {
  const configuracion = leerConfiguracion();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: configuracion.webOrigin });
  await app.listen(configuracion.port, '0.0.0.0');
}

main();
