import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import path from 'path';
import { after, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import { Pool } from 'pg';
import type { Conexiones } from '../src/conexiones';
import { barridoCorre, entraHoraria, snoozeDispara } from '../src/tareas/barrido';
import { TareasService } from '../src/tareas/tareas.service';

config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
});
const servicio = new TareasService({ pg: pool, s3, bucket: process.env.S3_BUCKET } as Conexiones);
const autor = { correo: 'operador@sgit.local', nombre: 'Operador de prueba' };
const tareas: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const lunes9 = new Date('2026-10-05T09:00:00-05:00');
const lunes10 = new Date('2026-10-05T10:00:00-05:00');
const lunes11 = new Date('2026-10-05T11:00:00-05:00');
const lunes12 = new Date('2026-10-05T12:00:00-05:00');
const lunes13 = new Date('2026-10-05T13:00:00-05:00');
const feriado = new Set(['2026-10-07']);

after(async () => {
  if (tareas.length > 0) {
    await pool.query(`DELETE FROM habilitado WHERE clase = 'tarea' AND clave = ANY($1::text[])`, [tareas]);
    await pool.query(`DELETE FROM tarea WHERE id = ANY($1::uuid[])`, [tareas]);
  }
  await pool.query(`DELETE FROM recordatorio WHERE tipo = 'horario' AND hora_bucket LIKE '2026-10-0%'`);
  await pool.query(`DELETE FROM feriado WHERE fecha = '2026-10-07'`);
  await pool.end();
  s3.destroy();
});

test('una tarea detectada entra el lunes a las 09:00 y sale cuando hay seguimiento', () => {
  const detectada = { estado: 'detectada', seguimiento: false, recordarEn: null };
  assert.equal(entraHoraria(detectada, lunes9, feriado), true);
  assert.equal(entraHoraria({ estado: 'en_seguimiento', seguimiento: true, recordarEn: null }, lunes10, feriado), false);
  assert.equal(entraHoraria({ estado: 'en_seguimiento', seguimiento: true, recordarEn: null }, lunes9, feriado), false);
});

test('el snooze de 4 horas no entra a las 10, 11 ni 12 y a las 13 dispara aunque haya notas', () => {
  const recordarEn = new Date('2026-10-05T13:00:00-05:00');
  const enValidacion = { estado: 'en_validacion', seguimiento: true, recordarEn };
  assert.equal(entraHoraria(enValidacion, lunes10, feriado), false);
  assert.equal(entraHoraria(enValidacion, lunes11, feriado), false);
  assert.equal(entraHoraria(enValidacion, lunes12, feriado), false);
  assert.equal(snoozeDispara(recordarEn, lunes12), false);
  assert.equal(snoozeDispara(recordarEn, lunes13), true);
  assert.equal(entraHoraria(enValidacion, lunes13, feriado), false);
});

test('el barrido no corre antes de las 08:00, después de las 18:00, el domingo ni un feriado', () => {
  assert.equal(barridoCorre(new Date('2026-10-06T07:59:00-05:00'), feriado), false);
  assert.equal(barridoCorre(new Date('2026-10-06T18:01:00-05:00'), feriado), false);
  assert.equal(barridoCorre(new Date('2026-10-04T09:00:00-05:00'), feriado), false);
  assert.equal(barridoCorre(new Date('2026-10-07T09:00:00-05:00'), feriado), false);
  assert.equal(barridoCorre(new Date('2026-10-07T09:00:00-05:00'), new Set()), true);
});

test('el seguimiento con foto pasa la tarea a en seguimiento y la anulación no borra la nota', async () => {
  const id = await abrir();
  await servicio.anotar(id, autor, 'seguimiento', 'Johan dice que no hay equipo', { nombre: 'equipo.png', mime: 'image/png', contenido: png });
  const ficha = await servicio.ficha(id);
  const nota = (ficha?.notas as Array<{ id: string; texto: string; autor_nombre: string; archivo_nombre: string | null }> | undefined)?.[0];
  assert.equal(ficha?.estado, 'en_seguimiento');
  assert.equal(nota?.texto, 'Johan dice que no hay equipo');
  assert.equal(nota?.autor_nombre, 'Operador de prueba');
  assert.equal(nota?.archivo_nombre, 'equipo.png');
  const archivo = await servicio.leerArchivo(id, nota!.id);
  assert.equal(archivo.bytes.length, png.length);
  await servicio.anotar(id, autor, 'incidente', 'Angie dice que la máquina está en reparación', null);
  await servicio.anular(id, nota!.id, autor, 'La nota se escribió en la tarea equivocada.');
  const luego = await servicio.ficha(id);
  const notas = (luego?.notas ?? []) as Array<{ tipo: string; texto: string }>;
  assert.equal(luego?.estado, 'en_seguimiento');
  assert.equal(notas.filter((item) => item.tipo === 'seguimiento')[0]?.texto, 'Johan dice que no hay equipo');
  assert.equal(notas.some((item) => item.tipo === 'anulacion'), true);
  assert.equal(luego?.en_barrido, false);
});

test('el snooze vence a las 13:00 y el barrido ya no abre una consulta horaria', async () => {
  const id = await abrir();
  const primera = await servicio.barrido(lunes9);
  const segunda = await servicio.barrido(new Date('2026-10-05T09:40:00-05:00'));
  assert.equal(primera.corre, true);
  assert.deepEqual(primera.horarias, []);
  assert.deepEqual(segunda.horarias, []);
  const guardados = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM recordatorio WHERE tarea_id = $1 AND tipo = 'horario'`,
    [id],
  );
  assert.equal(guardados.rows[0]?.total, '0');
  await servicio.anotar(id, autor, 'seguimiento', 'Ya hay avance', null);
  await servicio.validar(id, 4, lunes9);
  const aLas10 = await servicio.barrido(lunes10);
  const aLas13 = await servicio.barrido(lunes13);
  assert.equal(aLas10.horarias.includes(id), false);
  assert.equal(aLas10.vencidos.includes(id), false);
  assert.equal(aLas13.vencidos.includes(id), true);
  assert.equal(aLas13.horarias.includes(id), false);
  const fila = await pool.query<{ estado: string }>(`SELECT estado FROM tarea WHERE id = $1`, [id]);
  assert.equal(fila.rows[0]?.estado, 'en_validacion');
});

test('un feriado guardado apaga el barrido', async () => {
  await pool.query(`INSERT INTO feriado (fecha, motivo) VALUES ('2026-10-07', 'feriado de prueba') ON CONFLICT (fecha) DO NOTHING`);
  const resultado = await servicio.barrido(new Date('2026-10-07T09:00:00-05:00'));
  assert.equal(resultado.corre, false);
  assert.deepEqual(resultado.horarias, []);
});

async function abrir(): Promise<string> {
  const id = randomUUID();
  tareas.push(id);
  await pool.query(`INSERT INTO tarea (id, cot, estado) VALUES ($1, $2, 'detectada')`, [id, `b4-${id.slice(0, 8)}`]);
  await pool.query(`INSERT INTO habilitado (clase, clave) VALUES ('tarea', $1) ON CONFLICT DO NOTHING`, [id]);
  return id;
}
