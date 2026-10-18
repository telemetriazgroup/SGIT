import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import path from 'path';
import { after, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { PAUSA_MS } from '../src/bot/avisos';
import { BotService } from '../src/bot/bot.service';
import type { Conexiones } from '../src/conexiones';
import { TareasService } from '../src/tareas/tareas.service';

config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
});
const conexiones = { pg: pool, s3, bucket: process.env.S3_BUCKET } as Conexiones;
const bot = new BotService(conexiones);
const tareas = new TareasService(conexiones);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const foto = { nombre: 'equipo.png', mime: 'image/png', contenido: png };
const ahora = new Date('2026-10-05T12:00:00-05:00');

let cola: Promise<void> = Promise.resolve();
function enSerie(fn: () => Promise<void>): Promise<void> {
  const anterior = cola;
  let soltar: () => void = () => undefined;
  cola = new Promise((resolve) => {
    soltar = resolve;
  });
  return anterior.then(fn, fn).finally(soltar);
}

after(async () => {
  await pool.query(`DELETE FROM mensaje_whatsapp WHERE telefono LIKE '51900000%'`);
  await pool.query(`DELETE FROM aviso WHERE destino LIKE '51900000%'`);
  await pool.query(`DELETE FROM charla WHERE telefono LIKE '51900000%'`);
  await pool.query(`DELETE FROM habilitado WHERE clase = 'tarea' AND clave IN (SELECT id::text FROM tarea WHERE cot LIKE '1002999%')`);
  await pool.query(`DELETE FROM tarea WHERE cot LIKE '1002999%'`);
  await pool.query(`DELETE FROM usuario WHERE correo LIKE 'bot-prueba-%@sgit.local'`);
  await pool.query(`UPDATE sesion_bot SET estado = 'desconectado', ultimo_envio_en = NULL WHERE id = 1`);
  await pool.query(`DELETE FROM lider_bot`);
  await pool.end();
  s3.destroy();
});

test('al nacer una tarea cada miembro activo tiene un aviso y el segundo espera la pausa', () =>
  enSerie(async () => {
    await sembrar();
    const id = await abrir('10029990081', 'Cliente de laboratorio', 'Local de prueba', '2026-10-06', '09:00', 1);
    const alta = await bot.alNacer(id, ahora);
    assert.ok(alta >= 2);
    assert.equal(await bot.alNacer(id, ahora), 0);
    const filas = await pool.query<{ destino: string; cuerpo: string; no_enviar_antes: Date }>(
      `SELECT destino, cuerpo, no_enviar_antes FROM aviso WHERE tarea_id = $1 AND tipo = 'tarea_nueva' AND destino LIKE '51900000%' ORDER BY destino`,
      [id],
    );
    assert.deepEqual(
      filas.rows.map((fila) => fila.destino),
      ['51900000001', '51900000002'],
    );
    assert.match(filas.rows[0].cuerpo, /COT 10029990081/);
    assert.match(filas.rows[0].cuerpo, /Cliente: Cliente de laboratorio/);
    assert.match(filas.rows[0].cuerpo, /Lugar: Local de prueba/);
    assert.match(filas.rows[0].cuerpo, /Cita: 06\/10\/2026 09:00/);
    assert.match(filas.rows[0].cuerpo, /Telemetrías: 1/);
    const diferencia = new Date(filas.rows[1].no_enviar_antes).getTime() - new Date(filas.rows[0].no_enviar_antes).getTime();
    assert.equal(diferencia, PAUSA_MS);

    await bot.publicar('desconectado', ahora);
    assert.equal(await bot.tomarAviso(ahora), null);
    await bot.publicar('listo', ahora);
    const primero = await bot.tomarAviso(ahora);
    assert.equal(primero?.destino, '51900000001');
    await bot.confirmarEnvio(primero!.id, ahora);
    assert.equal(await bot.tomarAviso(ahora), null);
    const segundo = await bot.tomarAviso(new Date(ahora.getTime() + PAUSA_MS));
    assert.equal(segundo?.destino, '51900000002');
    const pendientes = await pool.query(`SELECT 1 FROM aviso WHERE id = $1 AND estado = 'pendiente'`, [segundo!.id]);
    assert.equal(pendientes.rowCount, 1);
    await bot.publicar('desconectado', ahora);
  }));

test('un reply de reprogramación avisa al responsable y un anexo no repite la tarea nueva', () =>
  enSerie(async () => {
    await sembrar();
    const id = await abrir('10029990082', 'Cliente de laboratorio', 'Local de prueba', '2026-10-06', '09:00', 1);
    await bot.alNacer(id, ahora);
    await pool.query(`UPDATE tarea SET responsable_correo = 'bot-prueba-1@sgit.local', responsable_nombre = 'Miembro uno' WHERE id = $1`, [id]);
    const mensaje = randomUUID();
    assert.equal(await bot.alReprogramar(id, mensaje, ahora), 1);
    assert.equal(await bot.alReprogramar(id, mensaje, ahora), 0);
    const avisos = await pool.query<{ tipo: string; destino: string }>(`SELECT tipo, destino FROM aviso WHERE tarea_id = $1 ORDER BY tipo`, [id]);
    assert.equal(avisos.rows.filter((fila) => fila.tipo === 'tarea_nueva' && fila.destino.startsWith('51900000')).length, 2);
    assert.deepEqual(
      avisos.rows.filter((fila) => fila.tipo === 'reprogramacion').map((fila) => fila.destino),
      ['51900000001'],
    );
  }));

test('el miembro anota por WhatsApp y un número ajeno no escribe', () =>
  enSerie(async () => {
    await sembrar();
    const id = await abrir('10029990083', 'Cliente de laboratorio', 'Local de prueba', null, null, null);
    const telefono = '51900000001';
    const menu = await bot.recibir(telefono, 'hola', null, tareas);
    assert.match(menu.respuesta, /Menú general/);
    const hallada = await bot.recibir(telefono, '10029990083', null, tareas);
    assert.match(hallada.respuesta, /Encontré COT 10029990083/);
    const dentro = await bot.recibir(telefono, '1', null, tareas);
    assert.match(dentro.respuesta, /Estás en COT 10029990083/);
    await bot.recibir(telefono, '2', null, tareas);
    await bot.recibir(telefono, 'sí', null, tareas);
    const seguimiento = await bot.recibir(telefono, 'Johan dice que no hay equipo', foto, tareas);
    assert.equal(seguimiento.habilitado, true);
    assert.match(seguimiento.respuesta, /con la imagen/);
    assert.match(seguimiento.respuesta, /Sigues en esta cotización/);
    const ficha = (await tareas.ficha(id)) as { estado?: string; notas?: Array<{ canal?: string; texto: string; autor_nombre: string; archivo_nombre: string | null }> } | null;
    const nota = ficha?.notas?.[0];
    assert.equal(ficha?.estado, 'en_seguimiento');
    assert.equal(nota?.canal, 'whatsapp');
    assert.equal(nota?.autor_nombre, 'Miembro uno');
    assert.equal(nota?.archivo_nombre, 'equipo.png');
    assert.match(nota?.texto ?? '', /Johan dice que no hay equipo/);

    const antes = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM nota_bitacora WHERE tarea_id = $1`, [id]);
    const ajeno = await bot.recibir('51900000999', 'COT 10029990083 no debo entrar', foto, tareas);
    assert.equal(ajeno.habilitado, false);
    assert.match(ajeno.respuesta, /No estás habilitado/);
    const despues = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM nota_bitacora WHERE tarea_id = $1`, [id]);
    assert.equal(despues.rows[0].total, antes.rows[0].total);
  }));

test('la consulta pide la acción y guarda la imagen solo si la aceptan', () =>
  enSerie(async () => {
    await sembrar();
    const id = await abrir('10029990084', 'Cliente de laboratorio', 'Local de prueba', null, null, null);
    await tareas.anotar(id, { correo: 'bot-prueba-1@sgit.local', nombre: 'Miembro uno' }, 'seguimiento', 'Ya hay avance', null);
    const telefono = '51900000002';
    const menu = await bot.recibir(telefono, 'hola', null, tareas);
    assert.match(menu.respuesta, /Menú general/);
    assert.match(menu.respuesta, /3\. Salir/);
    const hallada = await bot.recibir(telefono, '10029990084', null, tareas);
    assert.match(hallada.respuesta, /1\. Entrar/);
    const dentro = await bot.recibir(telefono, 'entrar', null, tareas);
    assert.match(dentro.respuesta, /Estás en COT 10029990084/);
    const datos = await bot.recibir(telefono, '1', null, tareas);
    assert.match(datos.respuesta, /Datos de la cotización/);
    assert.match(datos.respuesta, /Cliente: Cliente de laboratorio/);
    const pregunta = await bot.recibir(telefono, 'incidente', null, tareas);
    assert.match(pregunta.respuesta, /¿Vas a poner una imagen/);
    const sinImagen = await bot.recibir(telefono, 'no', null, tareas);
    assert.match(sinImagen.respuesta, /Escribe qué pasó/);
    const incidente = await bot.recibir(telefono, 'Angie dice que la máquina está en reparación', null, tareas);
    assert.match(incidente.respuesta, /El incidente quedó en la ficha/);
    assert.match(incidente.respuesta, /Sigues en esta cotización/);

    await bot.recibir(telefono, '2', null, tareas);
    const pide = await bot.recibir(telefono, 'sí', null, tareas);
    assert.match(pide.respuesta, /Envía la imagen/);
    const guardada = await bot.recibir(telefono, 'Foto del equipo', foto, tareas);
    assert.match(guardada.respuesta, /con la imagen/);
    const ultimo = await bot.recibir(telefono, '4', null, tareas);
    assert.match(ultimo.respuesta, /Último seguimiento/);
    assert.match(ultimo.respuesta, /Foto del equipo/);
    assert.ok(ultimo.archivo?.contenido);
    const resumen = await bot.recibir(telefono, '1', null, tareas);
    assert.match(resumen.respuesta, /Últimos registros/);
    const volver = await bot.recibir(telefono, '8', null, tareas);
    assert.match(volver.respuesta, /Estás en COT 10029990084/);
    const afuera = await bot.recibir(telefono, '7', null, tareas);
    assert.match(afuera.respuesta, /Saliste de COT 10029990084/);
    assert.match(afuera.respuesta, /Volviste al menú general/);

    const ficha = (await tareas.ficha(id)) as {
      estado?: string;
      en_barrido?: boolean;
      notas?: Array<{ tipo: string; canal: string; texto: string; archivo_nombre: string | null }>;
    } | null;
    const notas = ficha?.notas ?? [];
    assert.equal(ficha?.estado, 'en_seguimiento');
    assert.equal(ficha?.en_barrido, false);
    assert.equal(
      notas.some((nota) => nota.tipo === 'incidente' && nota.canal === 'whatsapp' && /Angie/.test(nota.texto) && nota.archivo_nombre === null),
      true,
    );
    assert.equal(
      notas.some((nota) => nota.tipo === 'seguimiento' && nota.canal === 'whatsapp' && /Foto del equipo/.test(nota.texto) && nota.archivo_nombre === 'equipo.png'),
      true,
    );
  }));

test('la sesión caída se ve desconectada y un segundo proceso no toma el liderazgo', () =>
  enSerie(async () => {
    await bot.publicar('desconectado', ahora);
    const visto = await bot.estado();
    assert.equal(visto.estado, 'desconectado');
    assert.equal(visto.qr, false);
    await bot.probar('51900000088', 'Prueba de laboratorio', ahora);
    assert.equal(await bot.tomarAviso(ahora), null);
    const prueba = await pool.query<{ estado: string }>(`SELECT estado FROM aviso WHERE tipo = 'prueba' AND destino = '51900000088'`);
    assert.equal(prueba.rows[0]?.estado, 'pendiente');
    await pool.query(`DELETE FROM aviso WHERE tipo = 'prueba' AND destino = '51900000088'`);
    const medioDia = new Date('2026-10-05T12:00:00-05:00');
    assert.equal(await bot.reclamar('proceso-uno', medioDia), true);
    assert.equal(await bot.reclamar('proceso-dos', new Date(medioDia.getTime() + 1000)), false);
    assert.equal(await bot.reclamar('proceso-uno', new Date(medioDia.getTime() + 10_000)), true);
    assert.equal(await bot.reclamar('proceso-dos', new Date(medioDia.getTime() + 40_000)), true);
    await bot.publicar('listo', ahora);
    const listo = await bot.estado();
    assert.equal(listo.estado, 'listo');
    await bot.publicar('desconectado', ahora);
  }));

async function sembrar(): Promise<void> {
  const hash = await bcrypt.hash('bot-prueba-no-entra', 4);
  const miembros = [
    ['bot-prueba-1@sgit.local', 'Miembro uno', '51900000001', true],
    ['bot-prueba-2@sgit.local', 'Miembro dos', '51900000002', true],
    ['bot-prueba-3@sgit.local', 'Miembro inactivo', '51900000003', false],
    ['bot-prueba-4@sgit.local', 'Miembro sin teléfono', null, true],
  ] as const;
  for (const [correo, nombre, telefono, activo] of miembros) {
    await pool.query(
      `INSERT INTO usuario (id, nombre, correo, contrasena_hash, rol, activo, telefono)
       VALUES ($1, $2, $3, $4, 'tecnico', $5, $6)
       ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, activo = EXCLUDED.activo, telefono = EXCLUDED.telefono`,
      [randomUUID(), nombre, correo, hash, activo, telefono],
    );
  }
}

async function abrir(cot: string, cliente: string, lugar: string, fecha: string | null, hora: string | null, cantidad: number | null): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO tarea (id, cot, estado, cliente, lugar, cita_fecha, cita_hora, cantidad)
     VALUES ($1, $2, 'detectada', $3, $4, $5, $6, $7)`,
    [id, cot, cliente, lugar, fecha, hora, cantidad],
  );
  await pool.query(`INSERT INTO habilitado (clase, clave) VALUES ('tarea', $1) ON CONFLICT DO NOTHING`, [id]);
  return id;
}
