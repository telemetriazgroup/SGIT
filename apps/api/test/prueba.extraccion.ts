import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { test } from 'node:test';
import { extraer, leerCantidad, partirAsunto } from '../src/tareas/extraer';
import { cotsDe, normalizarFecha, normalizarHora } from '../src/tareas/texto';

const fixture = leerFixture();

test('el fixture deja los campos del correo de ejemplo', () => {
  const lectura = extraer(fixture.asunto, fixture.cuerpo);
  assert.equal(lectura.cot.valor, '10020263623');
  assert.equal(lectura.ticket.valor, '2139');
  assert.equal(lectura.lugar.valor, 'MAKRO HUACHO');
  assert.equal(lectura.cliente.valor, 'MAKRO SUPERMAYORISTA S.A.');
  assert.equal(lectura.fecha.valor, '12/09/2026');
  assert.equal(lectura.hora.valor, '10:00');
  assert.equal(lectura.direccion.valor, 'Ave San Martin 580, Huacho 15138');
  assert.equal(lectura.mapa.valor, 'https://maps.app.goo.gl/JUPbNn35GtDB2ENQ6');
  assert.equal(lectura.temperatura.valor, '-21°C');
  assert.equal(lectura.producto.valor, 'congelados');
  assert.equal(lectura.cantidad.valor, '1');
  assert.equal(lectura.comercialNombre.valor, 'Olinda Lopez');
  assert.equal(lectura.comercialCargo.valor, 'Asistente comercial');
  assert.equal(lectura.comercialCorreo.valor, 'comercial4@zgroup.com.pe');
  assert.equal(lectura.comercialTelefono.valor, '+51 981 322 944');
  assert.equal(lectura.descripcion.valor, 'ALQUILER DE CONTENEDOR REEFER 40 RH + SERVICIO DE TRANSPORTE Y MANIPULEO');
  assert.ok(lectura.cot.fragmento);
  assert.ok(lectura.lugar.fragmento);
  assert.ok(lectura.fecha.fragmento);
  assert.equal(lectura.citaParcialFecha.valor, '12/09/2026');
  assert.equal(lectura.citaParcialHora.valor, '10:00');
});

test('las formas de COT se normalizan a los dígitos', () => {
  assert.deepEqual(cotsDe('cot 10020263623'), ['10020263623']);
  assert.deepEqual(cotsDe('COT10020263623'), ['10020263623']);
  assert.deepEqual(cotsDe('COT 10020263623'), ['10020263623']);
  assert.deepEqual(cotsDe('COTIZACIÓN N°: 10020263597'), ['10020263597']);
  assert.deepEqual(cotsDe('ASIGNAR Y DESPACHAR // 10020263263 // SERVICIO'), ['10020263263']);
});

test('las formas de hora quedan en 10:00', () => {
  assert.equal(normalizarHora('10 AM'), '10:00');
  assert.equal(normalizarHora('10:00'), '10:00');
  assert.equal(normalizarHora('10:00 a.m.'), '10:00');
  assert.equal(normalizarHora('22:00'), '22:00');
});

test('la cantidad lee una o varias telemetrías', () => {
  assert.equal(leerCantidad('1 und de telemetría').valor, '1');
  assert.equal(leerCantidad('2 telemetrías').valor, '2');
});

test('el saludo de la firma no tapa al comercial ni a la cita del cuerpo', () => {
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // TICKET VENTAS #1932 // COT 10020263024 // ALQUILER DE CONTENEDOR REFRIGERADO 40RH // QORI FOODS S.A.C.',
    `Razón social del cliente: QORI FOODS S.A.C.
Fecha de entrega en el cliente: 04/08/2026
Hora: 9:00 am.
Producto: arándanos
Temperatura: 0°
Dirección: NRO. SN LIMA -
CAÑETE - NUEVO IMPERIAL
Maps: https://maps.app.goo.gl/KM3Y4TP9nKgehLJs7
01 CONTENEDOR REEFER 40 RH
Saludos cordiales.
Que tenga un excelente dia.
<https://www.zgroup.com.pe/es>
Saludos cordiales / Best Regards
Kiara Castillo
Ejecutivo comercial
<mailto:Comercial1@zgroup.com.pe> Comercial1@zgroup.com.pe
+51 922 464 680`,
  );
  assert.equal(lectura.comercialNombre.valor, 'Kiara Castillo');
  assert.equal(lectura.comercialCargo.valor, 'Ejecutivo comercial');
  assert.equal(lectura.comercialCorreo.valor, 'comercial1@zgroup.com.pe');
  assert.equal(lectura.comercialTelefono.valor, '+51 922 464 680');
  assert.equal(lectura.fecha.valor, '04/08/2026');
  assert.equal(lectura.hora.valor, '09:00');
  assert.equal(lectura.producto.valor, 'arándanos');
  assert.equal(lectura.temperatura.valor, '0°C');
  assert.equal(lectura.direccion.valor, 'NRO. SN LIMA - CAÑETE - NUEVO IMPERIAL');
  assert.equal(lectura.mapa.valor, 'https://maps.app.goo.gl/KM3Y4TP9nKgehLJs7');
  assert.match(lectura.contenedor.valor ?? '', /CONTENEDOR REEFER/i);
});

test('el correo del comercial sale limpio aunque venga como enlace', () => {
  const lectura = extraer(
    'COT 10020263623',
    'Saludos cordiales.\n\nOlinda Lopez\nAsistente comercial\n<mailto:comercial4@zgroup.com.pe> comercial4@zgroup.com.pe\n+51 981 322 944',
  );
  assert.equal(lectura.comercialCorreo.valor, 'comercial4@zgroup.com.pe');
  assert.equal(lectura.comercialNombre.valor, 'Olinda Lopez');
});

test('el asunto real separa cliente, lugar y servicio', () => {
  const exportadora = partirAsunto(
    'ASIGNAR Y DESPACHAR // #2282 - EXPORTADORA FRUTICOLA DEL SUR SA // CARAZ //10020264097 - ALQUILER DE CONTENEDOR REFRIGERADO 20 RH',
  );
  assert.equal(exportadora.cot.valor, '10020264097');
  assert.equal(exportadora.ticket.valor, '2282');
  assert.equal(exportadora.cliente.valor, 'EXPORTADORA FRUTICOLA DEL SUR SA');
  assert.equal(exportadora.lugar.valor, 'CARAZ');
  assert.match(exportadora.descripcion.valor ?? '', /ALQUILER DE CONTENEDOR/);

  const transporte = partirAsunto(
    'RE: ASIGNAR Y DESPACHAR // COT 10020262891 // ALQUILER DE CONTENEDOR REFRIGERADO 40 RH // NEW TRANSPORT S.A',
  );
  assert.equal(transporte.cliente.valor, 'NEW TRANSPORT S.A');
  assert.equal(transporte.lugar.valor, null);
  assert.match(transporte.descripcion.valor ?? '', /ALQUILER/);

  const conRuc = partirAsunto(
    'ASIGNAR Y DESPACHAR // COT 10020263358 // TICKET DE VENTAS #2080 // ALQUILER DE CONTENEDOR REEFER 20 RH - MAKRO CHORRILLOS - MAKRO SUPERMAYORISTA S.A. ‒ 20492092313',
  );
  assert.equal(conRuc.lugar.valor, 'MAKRO CHORRILLOS');
  assert.equal(conRuc.cliente.valor, 'MAKRO SUPERMAYORISTA S.A. – 20492092313');
  assert.equal(conRuc.ticket.valor, '2080');

  const samir = partirAsunto(
    'ASIGNAR Y DESPACHAR // 10020264047 - ALQUILER DE CONTENEDOR REEFER DE 40 PIES // TRANSPORTES Y LOGISTICA SAMIR S.A.C. ‒ 20547919093',
  );
  assert.equal(samir.cot.valor, '10020264047');
  assert.equal(samir.descripcion.valor, 'ALQUILER DE CONTENEDOR REEFER DE 40 PIES');
  assert.equal(samir.cliente.valor, 'TRANSPORTES Y LOGISTICA SAMIR S.A.C. – 20547919093');
  assert.equal(samir.lugar.valor, null);

  const banco = partirAsunto(
    'ASIGNAR Y DESPACHAR // COTIZACIÓN N°: 10020261161 - VENTA DE 10 GENERADORES // CITITRANS S.A.C. - BANCO BBVA PERÚ',
  );
  assert.equal(banco.cliente.valor, 'CITITRANS S.A.C.');
  const gobierno = partirAsunto('ASIGNAR Y DESPACHAR // VENTA DE COLD STORAGE // GOBIERNO REGIONAL DE ANCASH');
  assert.equal(gobierno.cliente.valor, 'GOBIERNO REGIONAL DE ANCASH');
  const dosEmpresas = partirAsunto(
    'LEVANTAMIENTO DE OBSERVACIONES PARA CAMARA DE ATMOSFERA CONTROLADA // QALI FRUITS S.A.C. - AGRICOLA CERRO PRIETO SA (10020250809)',
  );
  assert.equal(dosEmpresas.cliente.valor, 'QALI FRUITS S.A.C.');
  const destino = partirAsunto('ASIGNAR Y DESPACHAR: 10020262042 - ALQUILER DE CONTENEDOR REEFER 40 RH CON DESTINO TOTTUS SAN HILARION (SJL)');
  assert.equal(destino.lugar.valor, 'TOTTUS SAN HILARION (SJL)');
});

test('una llegada escrita en la respuesta corrige la hora citada del hilo', () => {
  const lectura = extraer(
    'RE: ASIGNAR Y DESPACHAR // 10020264047 - ALQUILER DE CONTENEDOR REEFER DE 40 PIES // TRANSPORTES Y LOGISTICA SAMIR S.A.C. ‒ 20547919093',
    `Cotización confirmada, el cliente estará llegando 6:00 PM.

Saludos Cordiales.

De: operaciones@zgroup.com.pe
Hora: 3:00 pm`,
  );
  assert.equal(lectura.hora.valor, '18:00');
  assert.equal(lectura.cliente.valor, 'TRANSPORTES Y LOGISTICA SAMIR S.A.C. – 20547919093');
  assert.match(lectura.contenedor.valor ?? '', /CONTENEDOR REEFER DE 40 PIES/i);
});

test('la fecha con barras y el año corto es la de arriba, no la entrega citada', () => {
  assert.equal(normalizarFecha('Fecha: 04/09/26').valor, '04/09/2026');
  assert.equal(normalizarFecha('Fecha del servicio: 29-09-2026').iso, '2026-09-29');
  assert.equal(normalizarFecha('Fecha de entrega: 18 julio 2026').valor, '18/07/2026');
  assert.equal(normalizarFecha('Fecha: 30 mayo', 2026).valor, '30/05/2026');
  assert.equal(normalizarFecha('Fecha: 15/11/20204').valor, null);
  assert.equal(normalizarFecha('FECHA: 12 DE AGOSTO 2026_ NESTLE').valor, '12/08/2026');
  assert.equal(normalizarFecha('Fecha: Martes 19/ 11/ 2024').valor, '19/11/2024');
  const conHora = extraer('ASIGNAR', 'Fecha y hora: Jueves 02/07/26 - 11:00 am.');
  assert.equal(conHora.fecha.valor, '02/07/2026');
  assert.equal(conHora.hora.valor, '11:00');
  const sinRotulo = extraer('ASIGNAR', '* Miércoles 12/08/2026  Hora: 12:00 pm.');
  assert.equal(sinRotulo.fecha.valor, '12/08/2026');
  assert.equal(sinRotulo.hora.valor, '12:00');
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // COT. 10020250153',
    `* Fecha: 04/09/26
* Hora: 11 am
* Fecha: 05/09/26
* Hora: 09 am
Fecha: 28/01/2025
Hora: 08:00 AM
* FECHA DE ENTREGA: 17/01/25
* HORA DE LLEGADA: 3:00 PM`,
    2026,
  );
  assert.equal(lectura.fecha.valor, '04/09/2026');
  assert.equal(lectura.hora.valor, '11:00');
  assert.equal(lectura.citaParcialFecha.valor, '05/09/2026');
  assert.equal(lectura.citaParcialHora.valor, '09:00');
});

test('la entrega del cliente gana a la hora del protocolo', () => {
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // 10020263697 // 10020263977',
    `* Fecha del servicio: Martes 29 de septiembre
* Hora: 7:30 pm.
* Fecha de entrega: 11.09.26
* Hora: 2:30 pm en el cliente`,
    2026,
  );
  assert.equal(lectura.fecha.valor, '11/09/2026');
  assert.equal(lectura.hora.valor, '14:30');
});

test('la fecha con puntos y el año en dos dígitos es 29/09/2026', () => {
  assert.equal(normalizarFecha('29.09.26').valor, '29/09/2026');
  assert.equal(normalizarFecha('Fecha del servicio: 29.09.2026').iso, '2026-09-29');
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // #2238 - EXPORTADORA FRUTICOLA DEL SUR SA // CARAZ //10020263966',
    `Fecha de entrega: Mates 29.09.26
* Hora: 08:00 am.
* Condición: Alquiler`,
  );
  assert.equal(lectura.fecha.valor, '29/09/2026');
  assert.equal(lectura.hora.valor, '08:00');
  assert.equal(normalizarFecha('31.02.26').valor, null);
});

test('el cliente va entre la cotización y la palabra del servicio', () => {
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // 10020252371 BRANCHOUT FOOD - SUCURSAL PERU ALQUILER DE 01 CONTENEDOR REFRIGERADO DE 40 PIES Y SERVICIO DE TRANSPORTE A PISCO',
    `Producto: 01 REEFER 40 RH CON MAQUINA MODERNA
Producto: Fruta congelada
Temperatura: -25
Fecha: Jueves 10 de julio 2025
Hora de llegada al cliente: 11:00 am.
Dirección: Av. Tupac Amaru 339, Pisco 11601
10020252371
Saludos cordiales
Kiara Castillo
Ejecutiva Comercial
Mobile: +51 970796592
comercial6@zgroup.com.pe`,
  );
  assert.equal(lectura.cliente.valor, 'BRANCHOUT FOOD - SUCURSAL PERU');
  assert.match(lectura.descripcion.valor ?? '', /^ALQUILER DE 01 CONTENEDOR/);
  assert.equal(lectura.lugar.valor, 'PISCO');
  assert.equal(lectura.fecha.valor, '10/07/2025');
  assert.equal(lectura.hora.valor, '11:00');
  assert.equal(lectura.producto.valor, 'Fruta congelada');
  assert.equal(lectura.comercialTelefono.valor, '+51 970796592');
  assert.notEqual(lectura.comercialTelefono.valor, '10020252371');
});

test('la razón social del cliente completa el asunto', () => {
  const lectura = extraer(
    'ASIGNAR Y DESPACHAR // COT 10020262891 // ALQUILER DE CONTENEDOR REFRIGERADO 40 RH',
    'Razón social del cliente: NEW TRANSPORT S.A.\nDestino final: Sullana',
  );
  assert.equal(lectura.cliente.valor, 'NEW TRANSPORT S.A.');
  assert.equal(lectura.lugar.valor, 'Sullana');
});

test('una fecha ilegible no se inventa', () => {
  const lectura = extraer('COT 10020263623', 'FECHA Y HORA DE ENTREGA – CLIENTE:\nFecha: mañana\nHora: a mediodía');
  assert.equal(lectura.fecha.valor, null);
  assert.equal(lectura.hora.valor, null);
});

function leerFixture(): { asunto: string; cuerpo: string } {
  const archivo = readFileSync(path.resolve(__dirname, '../../../docs/ejemplos/correo-cot-10020263623.md'), 'utf8');
  const bloques = [...archivo.matchAll(/```text\n([\s\S]*?)```/g)].map((coincidencia) => coincidencia[1].trim());
  return { asunto: bloques[0], cuerpo: bloques[1] };
}
