import assert from 'node:assert/strict';
import test from 'node:test';
import { hiloListo, lineaHilo, textoEquipo, type HiloAtencion } from '../src/tareas/hilos';

const base: HiloAtencion = {
  id: '1',
  tarea_id: 't',
  orden: 1,
  estado: 'abierto',
  lleva_telemetria: null,
  contenedor: null,
  maquina: null,
  despacho_texto: null,
  chip_imei: null,
  chip_celular: null,
  chip_estado: null,
  despacho_validado: false,
};

test('despacho pide el primer equipo y luego el segundo cuando hay dos telemetrías', () => {
  assert.match(textoEquipo(2, 1), /Tengo 2 solicitudes de telemetría/);
  assert.match(textoEquipo(2, 1), /primer equipo/);
  assert.match(textoEquipo(2, 2), /equipo 2/);
  assert.match(textoEquipo(1, 1), /contenedor y la máquina/);
  assert.doesNotMatch(textoEquipo(null, 1), /solicitudes/);
});

test('un hilo queda listo solo con despacho validado y, si se instala, con el chip', () => {
  assert.equal(hiloListo(base).listo, false);
  const validado = { ...base, despacho_validado: true, lleva_telemetria: false };
  assert.equal(hiloListo(validado).listo, true);
  const conChip = { ...base, despacho_validado: true, lleva_telemetria: true, chip_celular: null };
  assert.match(hiloListo(conChip).falta.join(' '), /chip/);
  const listo = { ...conChip, chip_celular: '919867281', chip_estado: 'disponible' as const };
  assert.equal(hiloListo(listo).listo, true);
  const ocupado = { ...listo, chip_estado: 'ocupado' as const };
  assert.equal(hiloListo(ocupado).listo, false);
  assert.match(hiloListo(ocupado).falta.join(' '), /ocupado/);
  assert.match(lineaHilo(ocupado), /chip ocupado/);
});

test('la línea del hilo dice qué falta para la orden de fabricación', () => {
  assert.match(lineaHilo({ ...base, orden: 2 }), /Hilo 2/);
  assert.match(lineaHilo({ ...base, orden: 2 }), /falta validar/);
});
