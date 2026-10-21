import assert from 'node:assert/strict';
import test from 'node:test';
import { menuAreaAlmacen, menuAreaDespacho, menuDeHilo, menuInstalacion, menuOrden, menuValidarInstalacion, opcionesCot, preguntaHilosPendientes, textoColaHilos } from '../src/bot/avisos';

test('la cotización del admin ya no pide chip ni respuesta de despacho', () => {
  const menu = opcionesCot(true);
  assert.match(menu, /7\. Cerrar por regularización/);
  assert.match(menu, /8\. Telemetrías/);
  assert.match(menu, /9\. Volver al menú anterior/);
  assert.doesNotMatch(menu, /Pedir chip/);
  assert.doesNotMatch(menu, /Respuesta de despacho/);
  assert.doesNotMatch(menu, /Volver al menú general/);
});

test('el técnico entra a telemetrías sin la opción de cierre', () => {
  const menu = opcionesCot(false);
  assert.match(menu, /7\. Telemetrías/);
  assert.match(menu, /8\. Volver al menú anterior/);
  assert.doesNotMatch(menu, /Cerrar por regularización/);
});

test('el hilo separa despacho, almacén, el motivo y los insumos', () => {
  const menu = menuDeHilo('Hilo 1', 'Despacho todavía no dejó texto de este equipo.', 'Para resolverlo: falta el chip.');
  assert.match(menu, /1\. Área despacho/);
  assert.match(menu, /2\. Área almacén/);
  assert.match(menu, /3\. Esta telemetría no se instala/);
  assert.match(menu, /4\. Ya tiene telemetría/);
  assert.match(menu, /5\. Orden de fabricación \/ instalación/);
  assert.match(menu, /6\. Volver al menú anterior/);
  assert.doesNotMatch(menu, /Pedir reporte de orden de fabricación/);
});

test('la orden de fabricación y la instalación tienen su menú', () => {
  const orden = menuOrden('ORDEN', 'Este hilo ya tiene lo necesario.');
  assert.match(orden, /1\. Pedir insumo en orden de fabricación/);
  assert.match(orden, /2\. Agregar o modificar insumos, si está en borrador/);
  assert.match(orden, /4\. Ver PDF de orden de producción/);
  assert.match(orden, /6\. Reporte de instalación/);
  assert.match(orden, /7\. Volver al menú anterior/);
  const instalacion = menuInstalacion('INSTALACIÓN', 'Módulo 4G validado: *1234*. Con 6 lo cambias.');
  assert.match(instalacion, /1\. Registrar imágenes de la instalación/);
  assert.match(instalacion, /6\. Módulo 4G\. IMEI de la instalación/);
  assert.match(menuValidarInstalacion('VALIDAR'), /3\. Asimilar orden de fabricación/);
  assert.match(menuValidarInstalacion('VALIDAR'), /8\. Volver al menú anterior/);
  assert.doesNotMatch(menuValidarInstalacion('VALIDAR'), /Orden de fabricación \/ instalación/);
});

test('despacho y almacén tienen su propio menú', () => {
  assert.match(menuAreaDespacho('ÁREA DESPACHO'), /2\. Pedir ahora el contenedor y la máquina/);
  assert.match(menuAreaDespacho('ÁREA DESPACHO'), /5\. Ver los últimos registros de despacho/);
  assert.match(menuAreaAlmacen('ÁREA ALMACÉN'), /1\. Ver lo que envió despacho/);
  assert.match(menuAreaAlmacen('ÁREA ALMACÉN'), /3\. Pedir módulo 4G/);
  assert.match(menuAreaAlmacen('ÁREA ALMACÉN'), /6\. Registrar entrega de solicitud a almacén/);
  assert.match(menuAreaAlmacen('ÁREA ALMACÉN'), /8\. Ver estado de solicitud de insumos en almacén/);
  assert.match(menuAreaAlmacen('ÁREA ALMACÉN'), /9\. Volver al menú anterior/);
});

test('abrir hilos deja la consulta en la cola y nombra cuántos faltan', () => {
  assert.match(textoColaHilos(1, 'encolada'), /cola de despacho/);
  assert.match(textoColaHilos(3, 'encolada'), /3 hilos pendientes/);
  assert.match(textoColaHilos(2, 'en_curso'), /ya está en esta cotización/);
  assert.equal(preguntaHilosPendientes(3), 'Hay 3 hilos pendientes. Envíame el contenedor y la máquina de cada uno.');
  assert.match(preguntaHilosPendientes(1), /1 hilo pendiente/);
});
