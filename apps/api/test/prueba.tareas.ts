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
    await pool.query(
      `DELETE FROM decision_hilo WHERE gmail_thread_id IN (SELECT gmail_thread_id FROM mensaje_correo WHERE id = ANY($1::uuid[]))`,
      [mensajes],
    );
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

test('un reply de la misma COT no abre otra tarea y guarda la cita anterior', async () => {
  const cot = '99000000011';
  cots.push(cot);
  const hilo = `hilo-${cot}`;
  const origen = await insertar(`ASIGNAR // COT ${cot} // ALQUILER`, cuerpoCita('10:00', 'Av. San Martín 580'), hilo);
  const reply = await insertar(`RE: COT ${cot}`, cuerpoCita('15:00', 'Av. San Martín 580'), hilo);
  const primera = await servicio.procesarMensaje(origen);
  await servicio.procesarMensaje(reply);
  const tareas = await pool.query<{ total: string; hora: string; fecha: string }>(
    `SELECT count(*)::text AS total, max(cita_hora) AS hora, max(cita_fecha)::text AS fecha FROM tarea WHERE cot = $1`,
    [cot],
  );
  const situaciones = await pool.query<{ tipo: string; cita_anterior: { hora: string | null } | null }>(
    `SELECT tipo, cita_anterior FROM situacion_hilo WHERE tarea_id = $1 ORDER BY creado_en`,
    [primera.tareaId],
  );
  assert.equal(tareas.rows[0]?.total, '1');
  assert.equal(tareas.rows[0]?.hora, '15:00');
  assert.equal(tareas.rows[0]?.fecha, '2026-09-12');
  assert.deepEqual(situaciones.rows.map((fila) => fila.tipo), ['origen', 'reprogramacion']);
  assert.equal(situaciones.rows[1]?.cita_anterior?.hora, '10:00');
});

test('una fecha suelta en el reply no pisa una cita que ya tiene hora', async () => {
  const cot = '99000000012';
  cots.push(cot);
  const hilo = `hilo-${cot}`;
  const origen = await insertar(`COT ${cot}`, cuerpoCita('15:00', 'Av. San Martín 580'), hilo);
  const reply = await insertar(`RE: COT ${cot}`, 'ZTRACK\nFecha: 02/09/2026', hilo);
  await servicio.procesarMensaje(origen);
  await servicio.procesarMensaje(reply);
  const fila = await pool.query<{ hora: string; fecha: string }>(`SELECT cita_hora AS hora, cita_fecha::text AS fecha FROM tarea WHERE cot = $1`, [cot]);
  assert.equal(fila.rows[0]?.hora, '15:00');
  assert.equal(fila.rows[0]?.fecha, '2026-09-12');
});

test('un reply sin COT del mismo hilo se anexa y uno desconocido no crea tarea', async () => {
  const cot = '99000000013';
  cots.push(cot);
  const hilo = `hilo-${cot}`;
  const origen = await insertar(`COT ${cot}`, cuerpoCita('10:00', 'Av. San Martín 580'), hilo);
  const reply = await insertar('RE: gracias', 'Recibido, seguimos con el recojo.', hilo);
  const suelto = await insertar('Aviso de la oficina', 'Nos vemos el lunes.');
  const creada = await servicio.procesarMensaje(origen);
  const anexa = await servicio.procesarMensaje(reply);
  const ajeno = await servicio.procesarMensaje(suelto);
  const situaciones = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM situacion_hilo WHERE tarea_id = $1`, [creada.tareaId]);
  assert.equal(anexa.tareaId, creada.tareaId);
  assert.equal(situaciones.rows[0]?.total, '2');
  assert.equal(ajeno.tareaId, null);
});

test('corregir el lugar se mantiene y volver a leer lo suelta', async () => {
  const cot = '99000000014';
  cots.push(cot);
  const id = await insertar(`COT ${cot}`, cuerpoCita('10:00', 'Av. San Martín 580'));
  const creada = await servicio.procesarMensaje(id);
  await servicio.corregir(creada.tareaId!, 'cita_hora', '18:00');
  await servicio.procesarMensaje(id);
  const protegida = await pool.query<{ hora: string }>(`SELECT cita_hora AS hora FROM tarea WHERE id = $1`, [creada.tareaId]);
  assert.equal(protegida.rows[0]?.hora, '18:00');
  await servicio.releer(creada.tareaId!, 'cita_hora');
  const releida = await pool.query<{ hora: string | null; campos: string[] }>(
    `SELECT cita_hora AS hora, campos_corregidos AS campos FROM tarea WHERE id = $1`,
    [creada.tareaId],
  );
  assert.equal(releida.rows[0]?.hora, '10:00');
  assert.deepEqual(releida.rows[0]?.campos ?? [], []);
});

test('confirmar un pendiente como telemetría abre la tarea', async () => {
  const cot = '99000000015';
  cots.push(cot);
  const id = await insertar(`ASIGNAR // COT ${cot} // ALQUILER DE CONTENEDOR`, 'Buenos días, envío la cotización.');
  const pendiente = await servicio.procesarMensaje(id);
  assert.equal(pendiente.clasificacion, 'pendiente');
  assert.equal(pendiente.tareaId, null);
  await servicio.decidir(id, 'evento');
  const tarea = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM tarea WHERE cot = $1`, [cot]);
  assert.equal(tarea.rows[0]?.total, '1');
});

async function insertar(asunto: string, texto: string, hilo?: string): Promise<string> {
  const id = randomUUID();
  mensajes.push(id);
  await pool.query(
    `INSERT INTO mensaje_correo (id, gmail_message_id, gmail_thread_id, asunto, texto, replica)
     VALUES ($1, $2, $3, $4, $5, 'completo')`,
    [id, `gm-${id}`, hilo ?? `hilo-${id}`, asunto, texto],
  );
  return id;
}

function cuerpoCita(hora: string, direccion: string): string {
  return `ZTRACK\nFecha: 12/09/2026\nHora: ${hora}\nDirección: ${direccion}`;
}

function leerFixture(): { asunto: string; cuerpo: string } {
  const archivo = readFileSync(path.resolve(__dirname, '../../../docs/ejemplos/correo-cot-10020263623.md'), 'utf8');
  const bloques = [...archivo.matchAll(/```text\n([\s\S]*?)```/g)].map((coincidencia) => coincidencia[1].trim());
  return { asunto: bloques[0], cuerpo: bloques[1] };
}
