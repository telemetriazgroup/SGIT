import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'path';
import { config } from 'dotenv';
import type { Salud, SesionPublica } from '@sgit/shared';

config({ path: path.resolve(__dirname, '../../../.env') });

let base = '';
let cerrar: () => Promise<void> = async () => undefined;

before(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const direccion = app.getHttpServer().address();
  if (!direccion || typeof direccion === 'string') {
    throw new Error('El API de prueba no publicó un puerto.');
  }
  base = `http://127.0.0.1:${direccion.port}`;
  cerrar = () => app.close();
});

after(async () => {
  await cerrar();
});

test('API, PostgreSQL, Redis y almacén de archivos responden listo', async () => {
  const respuesta = await fetch(`${base}/salud`);
  const cuerpo = (await respuesta.json()) as Salud;
  assert.equal(respuesta.status, 200);
  assert.deepEqual(cuerpo, {
    api: 'listo',
    postgres: 'listo',
    redis: 'listo',
    archivos: 'listo',
  });
});

test('el operador de prueba entra y un usuario inexistente no', async () => {
  const correo = process.env.SEED_OPERATOR_CORREO;
  const contrasena = process.env.SEED_OPERATOR_PASSWORD;
  assert.ok(correo && contrasena, 'Falta la semilla del operador en .env');

  const ok = await fetch(`${base}/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo, contrasena }),
  });
  assert.equal(ok.status, 201);
  const sesion = (await ok.json()) as SesionPublica;
  assert.equal(sesion.usuario.correo, correo.toLowerCase());
  assert.equal(typeof sesion.token, 'string');

  const actual = await fetch(`${base}/sesion`, {
    headers: { authorization: `Bearer ${sesion.token}` },
  });
  assert.equal(actual.status, 200);
  const usuario = (await actual.json()) as SesionPublica['usuario'];
  assert.equal(usuario.correo, correo.toLowerCase());

  const ajeno = await fetch(`${base}/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: 'nadie@sgit.local', contrasena: 'no-existe' }),
  });
  assert.equal(ajeno.status, 401);
  const cuerpoAjeno = (await ajeno.json()) as { token?: string };
  assert.equal(cuerpoAjeno.token, undefined);

  const mal = await fetch(`${base}/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo, contrasena: 'contraseña-distinta' }),
  });
  assert.equal(mal.status, 401);
});
