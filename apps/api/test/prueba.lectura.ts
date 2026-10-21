import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avisoSilencioMenu, negrita, textoApertura, textoAvisoAsignacion, textoFichaDespacho } from '../src/bot/avisos';
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
  assert.match(texto, /Escribe procesar para leer las imágenes/);
  assert.match(texto, /Estás en la cotización 10020263584/);
  assert.doesNotMatch(texto, /escribe 9/);
  assert.doesNotMatch(textoAvisoAsignacion('10020263584', 'CENCOSUD', 'Johan', 'Sin foto', 0, []), /procesar/);
});

test('una tienda de campaña nombra la cotización, la cadena y la tienda', () => {
  const datos = { cot: '10020263499#METRO|BARRANCA', cliente: 'DONOFRIO HELADOS S.A.', lugar: 'METRO · BARRANCA', cita: '2026-10-15 15:00', cantidad: null };
  const apertura = textoApertura(datos);
  assert.match(apertura, /cotización 10020263499/);
  assert.match(apertura, /Cadena y tienda: METRO · BARRANCA/);
  assert.doesNotMatch(apertura, /METRO\|BARRANCA/);
  const ficha = textoFichaDespacho(datos);
  assert.match(ficha, /COT 10020263499/);
  assert.match(ficha, /Telemetrías: una o más/);
  const aviso = textoAvisoAsignacion(datos.cot, datos.cliente, 'Johan', 'Listo el reefer', 1, [], null, datos.lugar);
  assert.match(aviso, /Campaña 10020263499/);
  assert.match(aviso, /Cadena y tienda: METRO · BARRANCA/);
});

test('a los 5 minutos sin respuesta se cierra y el siguiente mensaje pide el menú', () => {
  const aviso = avisoSilencioMenu();
  assert.match(aviso, /5 minutos sin respuesta/);
  assert.match(aviso, /no quedó guardado/);
  assert.match(aviso, /cualquier cosa/);
  assert.match(avisoSilencioMenu(true), /Guardé el texto y las imágenes/);
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
