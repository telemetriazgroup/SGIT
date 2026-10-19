import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claveTienda, coincideTienda, tiendasDeHtml, tiendasDeTexto } from '../src/tareas/campana';

const html = `
<table>
  <tr><td>N°</td><td>CADENA</td><td>TIENDA</td><td>CONTACTO</td><td>CELULAR</td><td>FECHA DE ENTREGA</td><td>HORA DE ENTREGA</td><td>STATUS</td><td>TAMAÑO REEFER</td><td>DIRECCION DE ENTREGA</td><td>MAPS</td></tr>
  <tr><td>1</td><td>METRO</td><td>BARRANCA</td><td>RONALD CANTO</td><td>954 063 292</td><td>15/10/2026</td><td>15:00</td><td>PROGRAMADO</td><td>20 RH</td><td>Jr. Castilla, Barranca</td><td><a href="https://maps.app.goo.gl/barranca">mapa</a></td></tr>
  <tr><td>2</td><td>METRO</td><td>BREÑA</td><td>WALTER</td><td>991 877 904</td><td>15/10/2026</td><td>21:30</td><td>POR CONFIRMAR HORARIO</td><td>20 RH</td><td>Av. Alfonso Ugarte, Breña</td><td>https://maps.app.goo.gl/brena</td></tr>
</table>`;

test('el cronograma saca una tienda por fila, con entrega, tamaño y mapa', () => {
  const tiendas = tiendasDeHtml(html);
  assert.equal(tiendas.length, 2);
  assert.equal(tiendas[0]?.tienda, 'BARRANCA');
  assert.equal(tiendas[0]?.cadena, 'METRO');
  assert.equal(tiendas[0]?.entregaFecha, '2026-10-15');
  assert.equal(tiendas[0]?.entregaHora, '15:00');
  assert.equal(tiendas[0]?.tamano, '20 RH');
  assert.equal(tiendas[0]?.mapa, 'https://maps.app.goo.gl/barranca');
  assert.equal(tiendas[1]?.tienda, 'BREÑA');
  assert.equal(tiendas[1]?.status, 'POR CONFIRMAR HORARIO');
  assert.equal(claveTienda('Metro', 'Breña'), claveTienda('METRO', 'BREÑA'));
});

test('un correo posterior no duplica la tienda y el servicio se ata por el nombre', () => {
  const primero = tiendasDeTexto(['CADENA', 'TIENDA', 'STATUS', 'MAPS', 'METRO', 'BARRANCA', 'PROGRAMADO', 'https://maps.app.goo.gl/a'].join('\n'));
  const despues = tiendasDeHtml(html);
  const claves = new Set([...primero, ...despues].map((tienda) => claveTienda(tienda.cadena, tienda.tienda)));
  assert.equal(claves.size, 2);
  assert.equal(coincideTienda('#2336 - DONOFRIO // METRO BARRANCA - Done', 'BARRANCA'), true);
  assert.equal(coincideTienda('#2336 - DONOFRIO // METRO BREÑA - New', 'BRENA'), true);
  assert.equal(coincideTienda('#2336 - DONOFRIO // METRO BREÑA - New', 'BARRANCA'), false);
});
