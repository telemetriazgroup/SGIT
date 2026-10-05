import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { after, test } from 'node:test';
import { config } from 'dotenv';
import { Pool } from 'pg';
import type { Conexiones } from '../src/conexiones';
import { TareasService } from '../src/tareas/tareas.service';

config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const servicio = new TareasService({ pg: pool } as Conexiones);
const mensajes: string[] = [];
const cots: string[] = [];

after(async () => {
  if (cots.length > 0) await pool.query(`DELETE FROM tarea WHERE cot = ANY($1::text[])`, [cots]);
  if (mensajes.length > 0) {
    await pool.query(`UPDATE tarea SET mensaje_id = NULL WHERE mensaje_id = ANY($1::uuid[])`, [mensajes]);
    await pool.query(`DELETE FROM mensaje_correo WHERE id = ANY($1::uuid[])`, [mensajes]);
  }
  await pool.query(`DELETE FROM termino_diccionario WHERE termino = 'termino prueba sprint2'`);
  await pool.end();
});

test('el fixture abre una tarea y la segunda pasada no abre otra', async () => {
  const cot = '99000000001';
  cots.push(cot);
  const fixture = leerFixture();
  const id = await insertar(fixture.asunto.replaceAll('10020263623', cot), fixture.cuerpo);
  const primera = await servicio.procesarMensaje(id);
  const segunda = await servicio.procesarMensaje(id);
  const tareas = await pool.query<{ total: string; estado: string }>(
    `SELECT count(*)::text AS total, max(estado) AS estado FROM tarea WHERE cot = $1`,
    [cot],
  );
  assert.equal(primera.clasificacion, 'evento_desarrollo');
  assert.equal(primera.creada, true);
  assert.equal(primera.avisos, 0);
  assert.equal(segunda.creada, false);
  assert.equal(segunda.tareaId, primera.tareaId);
  assert.equal(tareas.rows[0]?.total, '1');
  assert.equal(tareas.rows[0]?.estado, 'detectada');
  const ficha = await servicio.ficha(primera.tareaId!);
  assert.equal(ficha?.ticket, '2139');
  assert.equal(ficha?.lugar, 'MAKRO HUACHO');
  assert.equal(ficha?.cliente, 'MAKRO SUPERMAYORISTA S.A.');
});

test('un correo ajeno queda guardado y sin tarea', async () => {
  const id = await insertar('Nota interna', 'Buenas tardes, archivo de la semana.');
  const resultado = await servicio.procesarMensaje(id);
  const guardado = await pool.query<{ clasificacion: string }>(`SELECT clasificacion FROM mensaje_correo WHERE id = $1`, [id]);
  assert.equal(resultado.clasificacion, 'otros');
  assert.equal(resultado.tareaId, null);
  assert.equal(resultado.avisos, 0);
  assert.equal(guardado.rows[0]?.clasificacion, 'otros');
});

test('dos COT referenciadas abren una tarea con ambas', async () => {
  const clave = '99000000003+99000000004';
  cots.push(clave);
  const id = await insertar('COT 99000000003 // COT 99000000004', 'ZTRACK\n\n1 und de telemetría');
  const resultado = await servicio.procesarMensaje(id);
  const fila = await pool.query<{ cots: string[]; referencias: string[] }>(`SELECT cots, referencias FROM tarea WHERE cot = $1`, [clave]);
  assert.equal(resultado.clasificacion, 'evento_desarrollo');
  assert.equal(resultado.creada, true);
  assert.equal(resultado.cot, clave);
  assert.deepEqual([...(fila.rows[0]?.cots ?? [])].sort(), ['99000000003', '99000000004']);
  assert.ok((fila.rows[0]?.referencias ?? []).some((frase) => /telemetr/i.test(frase)));
});

test('agregar y desactivar un término vale sin desplegar', async () => {
  const creado = await servicio.agregarTermino('término prueba sprint2');
  const id = await insertar('Aviso término prueba sprint2', 'Nada más en el cuerpo.');
  const activo = await servicio.procesarMensaje(id);
  assert.equal(activo.clasificacion, 'interna');
  assert.equal(activo.tareaId, null);
  await servicio.fijarTermino(creado.id, false);
  const pausado = await servicio.procesarMensaje(id);
  assert.equal(pausado.clasificacion, 'otros');
  await servicio.quitarTermino(creado.id);
});

async function insertar(asunto: string, texto: string): Promise<string> {
  const id = randomUUID();
  mensajes.push(id);
  await pool.query(
    `INSERT INTO mensaje_correo (id, gmail_message_id, gmail_thread_id, asunto, texto, replica)
     VALUES ($1, $2, $3, $4, $5, 'completo')`,
    [id, `gm-${id}`, `hilo-${id}`, asunto, texto],
  );
  return id;
}

function leerFixture(): { asunto: string; cuerpo: string } {
  const archivo = readFileSync(path.resolve(__dirname, '../../../docs/ejemplos/correo-cot-10020263623.md'), 'utf8');
  const bloques = [...archivo.matchAll(/```text\n([\s\S]*?)```/g)].map((coincidencia) => coincidencia[1].trim());
  return { asunto: bloques[0], cuerpo: bloques[1] };
}
