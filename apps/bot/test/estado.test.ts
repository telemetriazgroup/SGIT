import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import test from 'node:test';
import { enlazarEstado } from '../src/estado';
import { rutaDeSesion } from '../src/rutas';
import { crearSumideroArchivo } from '../src/sumidero';

test('el QR pasa a listo cuando el cliente queda ready', async () => {
  const cliente = new EventEmitter();
  const vistos: string[] = [];
  enlazarEstado(cliente, {
    actualizar(estado) {
      vistos.push(estado);
    },
  });

  cliente.emit('qr', 'qr-de-laboratorio');
  cliente.emit('ready');
  assert.deepEqual(vistos, ['esperando_qr', 'listo']);

  cliente.emit('disconnected');
  assert.equal(vistos.at(-1), 'desconectado');
});

test('la sesión y el QR quedan en disco, dentro de sessions', async () => {
  const anterior = process.env.BOT_SESSION_PATH;
  process.env.BOT_SESSION_PATH = 'sessions/wwebjs';
  try {
    assert.equal(path.basename(rutaDeSesion()), 'wwebjs');
    assert.equal(path.basename(path.dirname(rutaDeSesion())), 'sessions');
  } finally {
    if (anterior === undefined) delete process.env.BOT_SESSION_PATH;
    else process.env.BOT_SESSION_PATH = anterior;
  }

  const directorio = await mkdtemp(path.join(tmpdir(), 'sgit-bot-'));
  const sumidero = crearSumideroArchivo(directorio);
  await sumidero.actualizar('esperando_qr', 'qr-de-laboratorio');
  const estado = JSON.parse(await readFile(path.join(directorio, 'estado.json'), 'utf8')) as { estado: string };
  assert.equal(estado.estado, 'esperando_qr');
  const png = await readFile(path.join(directorio, 'qr.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  await sumidero.actualizar('listo');
  const listo = JSON.parse(await readFile(path.join(directorio, 'estado.json'), 'utf8')) as { estado: string };
  assert.equal(listo.estado, 'listo');
  await assert.rejects(readFile(path.join(directorio, 'qr.png')));
});
