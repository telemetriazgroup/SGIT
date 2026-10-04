import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consultaRecibidos, esEnviado } from '../src/buzon/cliente-gmail';
import { fusionar, huecos } from '../src/buzon/rangos';

const dia = (iso: string) => new Date(iso);

test('un rango ya cubierto no deja hueco', () => {
  const pedido = { desde: dia('2026-09-03T05:00:00.000Z'), hasta: dia('2026-10-03T04:59:59.000Z') };
  assert.deepEqual(huecos(pedido, [pedido]), []);
});

test('solo se pide el tramo que todavía no está guardado', () => {
  const pedido = { desde: dia('2026-08-01T05:00:00.000Z'), hasta: dia('2026-10-03T04:59:59.000Z') };
  const cubierto = { desde: dia('2026-09-03T05:00:00.000Z'), hasta: dia('2026-10-03T04:59:59.000Z') };
  const faltante = huecos(pedido, [cubierto]);
  assert.equal(faltante.length, 1);
  assert.equal(faltante[0].desde.toISOString(), pedido.desde.toISOString());
  assert.equal(faltante[0].hasta.toISOString(), new Date(cubierto.desde.getTime() - 1).toISOString());
});

test('la consulta a Gmail deja fuera los enviados', () => {
  const consulta = consultaRecibidos(dia('2026-09-03T05:00:00.000Z'), dia('2026-10-04T04:59:59.000Z'));
  assert.match(consulta, /-in:sent/);
  assert.equal(esEnviado(['SENT', 'INBOX']), true);
  assert.equal(esEnviado(['INBOX']), false);
});

test('dos rangos seguidos quedan en un solo bloque', () => {
  const primero = { desde: dia('2026-09-01T05:00:00.000Z'), hasta: dia('2026-09-15T04:59:59.000Z') };
  const segundo = { desde: dia('2026-09-15T05:00:00.000Z'), hasta: dia('2026-09-30T04:59:59.000Z') };
  const fusion = fusionar([segundo, primero]);
  assert.equal(fusion.length, 1);
  assert.equal(fusion[0].desde.toISOString(), primero.desde.toISOString());
  assert.equal(fusion[0].hasta.toISOString(), segundo.hasta.toISOString());
});
