import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararUrgencia } from '../src/tareas/prioridad';

test('vence primero, luego hoy, luego la más cercana y al final la que no tiene fecha', () => {
  const hoy = '2026-10-18';
  const fechas = ['2026-10-20', null, '2026-10-18', '2026-10-01', '2026-10-19', '2026-09-30'];
  fechas.sort((izquierda, derecha) => compararUrgencia(izquierda, derecha, hoy));
  assert.deepEqual(fechas, ['2026-10-01', '2026-09-30', '2026-10-18', '2026-10-19', '2026-10-20', null]);
});
