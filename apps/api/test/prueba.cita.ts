import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluarCita } from '../src/tareas/cita';

test('cambiar la hora deja la cita anterior y la nueva vigente', () => {
  const efecto = evaluarCita(
    { fecha: '2026-09-12', hora: '10:00', direccion: 'Av. San Martín 580' },
    { fecha: '2026-09-12', hora: '15:00', direccion: 'Av. San Martín 580' },
  );
  assert.equal(efecto.reprograma, true);
  assert.equal(efecto.hora, '15:00');
  assert.equal(efecto.fecha, null);
  assert.equal(efecto.anterior?.hora, '10:00');
});

test('una fecha sin hora no pisa una cita completa', () => {
  const efecto = evaluarCita(
    { fecha: '2026-08-05', hora: '15:00', direccion: 'Av. Tupac Amaru 339' },
    { fecha: '2026-09-02', hora: null, direccion: null },
  );
  assert.equal(efecto.reprograma, false);
  assert.equal(efecto.fecha, null);
});

test('una dirección citada con marcas no reemplaza la vigente', () => {
  const efecto = evaluarCita(
    { fecha: '2026-08-17', hora: '10:00', direccion: 'Av. Guardia Civil Sur 1031, Chorrillos' },
    { fecha: null, hora: null, direccion: '>    - **Av. Guardia Civil Sur 1031, Chorrillos' },
  );
  assert.equal(efecto.reprograma, false);
  assert.equal(efecto.direccion, null);
});

test('el mismo lugar con un enlace al lado no es reprogramación', () => {
  const efecto = evaluarCita(
    { fecha: '2026-08-05', hora: '15:00', direccion: 'Av. Tomás Marsano 5000' },
    { fecha: '2026-08-05', hora: '15:00', direccion: 'Av. Tomás Marsano 5000 < https://maps.app.goo.gl/abc' },
  );
  assert.equal(efecto.reprograma, false);
  assert.equal(efecto.direccion, null);
});
