import assert from 'node:assert/strict';
import test from 'node:test';
import { esImeiDeSenal, etiquetaDeModulo } from '../src/bot/lectura-modulo';

test('la etiqueta ZTRACK separa el SN del IMEI y no se queda con el chip', () => {
  const etiqueta = etiquetaDeModulo([
    'Model: ZTRACK-V2',
    'Input: DC9-36V',
    'IMEI: 869387065279656',
    'SN: 00501026082100005690',
    'Serial Param: 115200/N/8/1',
    '8951029078500034060',
  ].join('\n'));
  assert.ok(etiqueta);
  assert.equal(etiqueta.modelo, 'ZTRACK-V2');
  assert.equal(etiqueta.sn, '00501026082100005690');
  assert.equal(etiqueta.imei, '869387065279656');
  assert.equal(esImeiDeSenal(etiqueta.imei), true);
  assert.equal(esImeiDeSenal('00501026082100005690'), false);
});

test('las otras dos etiquetas también separan SN e IMEI', () => {
  const segunda = etiquetaDeModulo('IMEI:869387065334402\nSN:00501026082100008811');
  const tercera = etiquetaDeModulo('IMEI:869387065334089\nSN:00501026082100006981');
  assert.equal(segunda?.sn, '00501026082100008811');
  assert.equal(segunda?.imei, '869387065334402');
  assert.equal(tercera?.sn, '00501026082100006981');
  assert.equal(tercera?.imei, '869387065334089');
});
