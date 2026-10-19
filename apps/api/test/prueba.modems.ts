import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clasificarModem } from '../src/modems/clasificar';

test('un módem consumido en la orden queda fabricado con esa MO', () => {
  const clase = clasificarModem(0, [
    { fecha: '2026-10-01 10:00:00', referencia: 'ZGROU/IN/06009', desde: 'Vendors', hacia: 'ZGROU/Existencias', cantidad: 1, estado: 'done' },
    { fecha: '2026-10-13 19:09:28', referencia: 'ZGROU/MO/05820', desde: 'ZGROU/Existencias', hacia: 'Physical Locations/Production', cantidad: 1, estado: 'done' },
  ]);
  assert.equal(clase.estado, 'fabricado');
  assert.equal(clase.orden, 'ZGROU/MO/05820');
  assert.equal(clase.salida, '');
});

test('un módem que sigue en existencia queda disponible', () => {
  const clase = clasificarModem(1, [
    { fecha: '2026-08-01 10:00:00', referencia: 'ZGROU/IN/05000', desde: 'Vendors', hacia: 'ZGROU/Existencias', cantidad: 1, estado: 'done' },
  ]);
  assert.equal(clase.estado, 'disponible');
  assert.equal(clase.orden, '');
});

test('un módem entregado al cliente queda como salida', () => {
  const clase = clasificarModem(0, [
    { fecha: '2026-09-01 10:00:00', referencia: 'ZGROU/OUT/01000', desde: 'ZGROU/Existencias', hacia: 'Partner Locations/Customers', cantidad: 1, estado: 'done' },
  ]);
  assert.equal(clase.estado, 'salida');
  assert.equal(clase.salida, 'ZGROU/OUT/01000');
});
