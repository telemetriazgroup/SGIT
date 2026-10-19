import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cierreFabricacion, fragmentosDeTexto, identificarChips, imeisDeTexto, textoChip } from '../src/bot/lectura-chip';

const catalogo = [
  { imei: '8951029078500034060', celular: '919000406', estado: 'disponible', telemetria: '' },
  { imei: '8951029078500034094', celular: '919000409', estado: 'disponible', telemetria: '' },
  { imei: '8951029078500034102', celular: '919000410', estado: 'disponible', telemetria: '' },
  { imei: '8951029078500034052', celular: '919000405', estado: 'ocupado', telemetria: 'CT TRACK REEFER' },
  { imei: '8951029078500023279', celular: '919002327', estado: 'disponible', telemetria: '' },
];

test('una tarjeta leída en el código y en el chip es un solo IMEI', () => {
  const texto = '8951029078500034060\n8951029078\n50003406 0';
  assert.deepEqual(imeisDeTexto(texto)[0], '8951029078500034060');
  const lectura = identificarChips(imeisDeTexto(texto), catalogo);
  assert.equal(lectura.hallados.length, 1);
  assert.equal(lectura.hallados[0].celular, '919000406');
  assert.equal(lectura.hallados[0].por, 'completo');
});

test('una foto con dos tarjetas identifica los dos celulares', () => {
  const texto = '8951029078500034094\n8951029078 50003409 4\n8951029078500034102\n8951029078 50003410 2';
  const lectura = identificarChips(imeisDeTexto(texto), catalogo);
  assert.deepEqual(lectura.hallados.map((chip) => chip.celular).sort(), ['919000409', '919000410']);
});

test('el chip suelto se arma con el número partido', () => {
  const lectura = identificarChips(imeisDeTexto('8951029078\n50002327 9\nalaisecure.com'), catalogo);
  assert.equal(lectura.hallados[0].imei, '8951029078500023279');
  assert.equal(lectura.hallados[0].celular, '919002327');
});

test('el código de barras de la tarjeta devuelve el celular 919867281', () => {
  const tarjeta = [{ imei: '8951029078500034060', celular: '919867281', estado: 'ocupado', telemetria: '' }];
  const texto = 'Connect your business securely\n8951029078500034060\nAPN alai';
  const lectura = identificarChips(imeisDeTexto(texto), tarjeta, fragmentosDeTexto(texto));
  assert.equal(lectura.hallados.length, 1);
  assert.equal(lectura.hallados[0].celular, '919867281');
  assert.equal(lectura.hallados[0].por, 'completo');
});

test('si solo se lee 500034060 del recuadro ALAI, igual sale el celular', () => {
  const tarjeta = [{ imei: '8951029078500034060', celular: '919867281', estado: 'ocupado', telemetria: 'CT TRACK REEFER' }];
  const lectura = identificarChips([], tarjeta, fragmentosDeTexto('alaisecure.com APN alai 500034060'));
  assert.equal(lectura.hallados[0].celular, '919867281');
  assert.equal(lectura.hallados[0].por, 'fragmento');
  assert.equal(lectura.hallados[0].pista, '500034060');
});

test('si ya hay celular, WhatsApp no lista las otras lecturas y un chip ocupado no queda listo', () => {
  const hallados = [{ imei: '8951029078500034086', celular: '919863833', estado: 'ocupado', telemetria: 'CT TRACK REEFER', por: 'completo' as const, pista: '8951029078500034086' }];
  const ruido = ['89510290788951029078', '89510290789362115200'];
  assert.doesNotMatch(textoChip(hallados, ruido, true), /no está en los chips/);
  assert.match(textoChip(hallados, ruido), /89510290788951029078/);
  assert.match(cierreFabricacion(hallados), /No se envía a una orden de fabricación/);
  assert.doesNotMatch(cierreFabricacion(hallados), /Queda listo/);
});

test('si el IMEI completo no coincide, los últimos 6 dígitos buscan el celular', () => {
  const lectura = identificarChips(['8951999999950023279'], catalogo);
  assert.equal(lectura.hallados[0].celular, '919002327');
  assert.equal(lectura.hallados[0].por, 'ultimos6');
});
