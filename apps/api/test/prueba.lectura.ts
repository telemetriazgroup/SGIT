import assert from 'node:assert/strict';
import { test } from 'node:test';
import { negrita, textoAvisoAsignacion } from '../src/bot/avisos';
import { asumirZgru, claseDe, codigoContado, lineaLectura, presentarLectura } from '../src/bot/proceso-imagen';

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

test('el aviso al técnico pide un ok y deja en negrita lo que escribió despacho', () => {
  const texto = textoAvisoAsignacion('10020263584', 'CENCOSUD', 'Johan', 'Listo el contenedor', 2, ['1. Contenedor ZGRU6203905.']);
  assert.match(texto, /\*Listo el contenedor\*/);
  assert.match(texto, /Escribe ok si sí/);
  assert.match(texto, /Estás en la cotización 10020263584/);
  assert.doesNotMatch(texto, /escribe 9/);
});

test('lo escrito por la persona va en negrita y el resto no', () => {
  assert.equal(negrita('Aun no tenemos contenedor'), '*Aun no tenemos contenedor*');
  assert.equal(negrita('linea uno\nlinea dos'), '*linea uno*\n*linea dos*');
  assert.equal(negrita('  '), '');
});

test('un contenedor de puros números se asume ZGRU hasta que el técnico lo corrija', () => {
  assert.deepEqual(asumirZgru('1237542', 'contenedor'), { codigo: 'ZGRU1237542', asumido: true });
  assert.deepEqual(asumirZgru('ZGRU5205415', 'contenedor'), { codigo: 'ZGRU5205415', asumido: false });
  assert.deepEqual(asumirZgru('EOGM019537', 'serie'), { codigo: 'EOGM019537', asumido: false });
  assert.match(presentarLectura(1, 'ZGRU', '1237542', null), /Contenedor ZGRU1237542/);
  assert.match(presentarLectura(1, 'ZGRU', '1237542', null), /se asumió ZGRU/);
  assert.match(presentarLectura(1, 'ZGRU', '1237542', 'ZGRU9999999'), /ZGRU9999999/);
  assert.doesNotMatch(presentarLectura(1, 'ZGRU', '1237542', 'ZGRU9999999'), /se asumió ZGRU/);
});

test('la línea que ve el técnico nombra contenedor o serie', () => {
  assert.match(lineaLectura(1, 'contenedor', 'ZGRU5205415', 'ZGRU5205415', false), /Contenedor ZGRU5205415/);
  assert.match(lineaLectura(2, 'serie', 'EOGM005134', 'E0GM005134', true), /Serie de máquina EOGM005134/);
  assert.match(lineaLectura(3, 'otro', null, null, false), /Sin código/);
});
