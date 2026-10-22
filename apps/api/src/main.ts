import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RUTA_ACCESO } from '@sgit/shared';
import { leerConfiguracion } from './configuracion';

async function main() {
  const configuracion = leerConfiguracion();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix(RUTA_ACCESO.slice(1));
  const { json, urlencoded } = await import('express');
  app.use((req: { url?: string }, _respuesta: unknown, siguiente: () => void) => {
    const url = req.url || '/';
    const ya = url === RUTA_ACCESO || url.startsWith(`${RUTA_ACCESO}/`) || url.startsWith(`${RUTA_ACCESO}?`);
    if (!ya) req.url = `${RUTA_ACCESO}${url.startsWith('/') ? url : `/${url}`}`;
    siguiente();
  });
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  app.enableCors({
    origin: (origen: string | undefined, responder: (error: Error | null, permitir?: boolean) => void) => {
      const aceptado = !origen || origenAceptado(origen, configuracion.webOrigin);
      responder(null, aceptado);
    },
    exposedHeaders: ['content-disposition'],
  });
  await app.listen(configuracion.port, '0.0.0.0');
  console.log(`SGIT API listo en http://0.0.0.0:${configuracion.port}${RUTA_ACCESO}/salud`);
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`SGIT no arrancó. ${mensaje}`);
  process.exit(1);
});

function origenAceptado(pedido: string, configurado: string): boolean {
  if (origenesWeb(configurado).includes(pedido)) return true;
  try {
    const url = new URL(pedido);
    const web = new URL(configurado);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.port === (web.port || '18004');
  } catch {
    return false;
  }
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
