import assert from 'node:assert/strict';
import test from 'node:test';
import { menuGeneral } from '../src/bot/avisos';
import { esPdf, normalizarBase, textoTrabajo } from '../src/impresion/reglas';

test('la dirección de impresión queda en el origen y acepta otra IP', () => {
  assert.equal(normalizarBase('http://10.20.0.8:7101'), 'http://10.20.0.8:7101');
  assert.equal(normalizarBase('10.20.0.8:7101/'), 'http://10.20.0.8:7101');
  assert.throws(() => normalizarBase('http://10.20.0.8:7101/jobs'), /sin ruta/);
  assert.throws(() => normalizarBase(''), /Indica la dirección/);
});

test('solo un PDF real pasa y el resultado se dice en claro', () => {
  assert.equal(esPdf(Buffer.from('%PDF-1.4')), true);
  assert.equal(esPdf(Buffer.from('no es')), false);
  assert.match(textoTrabajo({ id: 'abc', status: 'completed', printer_job_id: 4, error: null, pages: 1 }), /Quedó impreso/);
  assert.match(textoTrabajo({ id: 'abc', status: 'queued' }), /en cola/);
  assert.match(textoTrabajo({ status: 'failed', error: 'media-empty' }), /no lo terminó/);
  assert.match(textoTrabajo({ duplicate: true, status: 'completed', id: 'abc' }), /No se imprimió otra vez/);
});

test('el menú del administrador separa imprimir de salir', () => {
  const elevado = menuGeneral(true);
  assert.match(elevado, /5\. Imprimir/);
  assert.match(elevado, /6\. Salir/);
  const tecnico = menuGeneral(false);
  assert.match(tecnico, /3\. Salir/);
  assert.doesNotMatch(tecnico, /Imprimir/);
});
