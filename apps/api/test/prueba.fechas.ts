import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogoFechas, plegarCita } from '../src/tareas/fechas';

test('cada forma del menú se reconoce', () => {
  const formas = catalogoFechas(2026);
  assert.ok(formas.length >= 8);
  for (const forma of formas) assert.equal(forma.reconocida, true, forma.ejemplo);
});

test('plegar una cita conserva la anterior si el correo nuevo no trae hora', () => {
  const vigente = { fecha: '2026-09-12', hora: '10:00', direccion: 'Huacho' };
  const siguiente = plegarCita(vigente, { fecha: '2026-10-31', hora: null, direccion: null });
  assert.equal(siguiente.fecha, '2026-09-12');
  assert.equal(siguiente.hora, '10:00');
  const completa = plegarCita(vigente, { fecha: '2026-10-31', hora: '08:00', direccion: 'Av. Colonial 120, Lima' });
  assert.equal(completa.fecha, '2026-10-31');
  assert.equal(completa.hora, '08:00');
  assert.equal(completa.direccion, 'Av. Colonial 120, Lima');
});
