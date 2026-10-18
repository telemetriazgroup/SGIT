import assert from 'node:assert/strict';
import { test } from 'node:test';
import { negrita } from '../src/bot/avisos';
import { claseDe, codigoContado, lineaLectura } from '../src/bot/proceso-imagen';

test('el contenedor ZGRU y la serie de la máquina no se confunden', () => {
  assert.equal(claseDe('ZGRU', 'ZGRU5205415'), 'contenedor');
  assert.equal(claseDe('ZGRU', '6710820'), 'contenedor');
  assert.equal(claseDe('SERIAL', 'EOGM005134'), 'serie');
  assert.equal(claseDe('OTRO', 'ABC'), 'otro');
});

test('una corrección anterior reemplaza la lectura nueva del mismo código', () => {
  assert.deepEqual(codigoContado('ZGRU529919O', 'ZGRU5299190'), { codigo: 'ZGRU5299190', corregido: true });
  assert.deepEqual(codigoContado('ZGRU5205415', 'ZGRU5205415'), { codigo: 'ZGRU5205415', corregido: false });
  assert.deepEqual(codigoContado(null, null), { codigo: null, corregido: false });
});

test('lo escrito por la persona va en negrita y el resto no', () => {
  assert.equal(negrita('Aun no tenemos contenedor'), '*Aun no tenemos contenedor*');
  assert.equal(negrita('linea uno\nlinea dos'), '*linea uno*\n*linea dos*');
  assert.equal(negrita('  '), '');
});

test('la línea que ve el técnico nombra contenedor o serie', () => {
  assert.match(lineaLectura(1, 'contenedor', 'ZGRU5205415', 'ZGRU5205415', false), /Contenedor ZGRU5205415/);
  assert.match(lineaLectura(2, 'serie', 'EOGM005134', 'E0GM005134', true), /Serie de máquina EOGM005134/);
  assert.match(lineaLectura(3, 'otro', null, null, false), /Sin código/);
});
