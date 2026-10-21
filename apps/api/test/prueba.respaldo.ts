import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { borrarCarpeta, desempaquetar, empaquetar, esPartida, manifiestoDe, textoPartida } from '../src/respaldo/paquete';
import { nombreParte, partir } from '../src/respaldo/partes';

test('las partes cortan por peso y dejan solo lo que se pasa del tope', () => {
  const partes = partir(
    [
      { id: 'a', peso: 10 },
      { id: 'b', peso: 10 },
      { id: 'c', peso: 25 },
      { id: 'd', peso: 5 },
    ],
    20,
    10,
  );
  assert.deepEqual(partes, [['a', 'b'], ['c'], ['d']]);
});

test('la partida dice el rango, las tareas, el diccionario y la clasificación', () => {
  const manifiesto = {
    version: 1 as const,
    tipo: 'partida' as const,
    generadoEn: '2026-10-21T00:00:00.000Z',
    correos: { desde: '2026-06-01T15:00:00.000Z', hasta: '2026-10-21T15:00:00.000Z', cantidad: 12, rangos: [] },
    clasificacion: { tareasProcesadas: 4, diccionario: 3, tarea: 4, asuntoInterno: 2, otros: 6 },
    chips: 8,
    modems: 5,
  };
  assert.equal(esPartida(manifiesto), true);
  assert.equal(esPartida({ version: 1, tipo: 'mensajes' }), false);
  const texto = textoPartida(manifiesto, true);
  assert.match(texto, /Partida asimilada/);
  assert.match(texto, /Tareas procesadas: 4/);
  assert.match(texto, /Diccionario: 3 términos/);
  assert.match(texto, /4 tarea, 2 asunto interno, 6 otros/);
  assert.match(texto, /Chips: 8. M2M: 5/);
});

test('el comprimido conserva el manifiesto de la partida', async () => {
  const origen = await mkdtemp(path.join(tmpdir(), 'sgit-partida-origen-'));
  const destino = path.join(tmpdir(), `sgit-partida-prueba-${Date.now()}.tar.gz`);
  const extraido = await mkdtemp(path.join(tmpdir(), 'sgit-partida-extraido-'));
  const manifiesto = {
    version: 1 as const,
    tipo: 'partida' as const,
    generadoEn: '2026-10-21T00:00:00.000Z',
    correos: { desde: null, hasta: null, cantidad: 0, rangos: [] as Array<{ desde: string; hasta: string }> },
    clasificacion: { tareasProcesadas: 0, diccionario: 0, tarea: 0, asuntoInterno: 0, otros: 0 },
    chips: 0,
    modems: 0,
  };
  try {
    await writeFile(path.join(origen, 'manifiesto.json'), JSON.stringify(manifiesto));
    await empaquetar(origen, destino);
    assert.equal(esPartida(await manifiestoDe(destino)), true);
    await desempaquetar(destino, extraido);
    assert.equal(esPartida(JSON.parse(await readFile(path.join(extraido, 'manifiesto.json'), 'utf8'))), true);
  } finally {
    await borrarCarpeta(origen);
    await borrarCarpeta(extraido);
    await borrarCarpeta(destino);
  }
});

test('el nombre del archivo de clasificación no parece una parte de correos', () => {
  assert.equal(nombreParte('clasificacion'), 'sgit-clasificacion.json');
  assert.equal(nombreParte('mensajes', 3), 'sgit-correos-mensajes-0003.json');
  assert.equal(nombreParte('adjuntos', 12, 'bin'), 'sgit-correos-adjuntos-0012.bin');
});
