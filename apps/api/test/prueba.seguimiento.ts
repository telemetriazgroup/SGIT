import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { test } from 'node:test';
import { TERMINOS_INICIALES } from '../src/tareas/clasificar';
import { armarSeguimiento, leerFechaCorreo, resumenHilo } from '../src/tareas/seguimiento';

const encargo = `
Buenas tardes

DESPACHO

Estimado Johan por favor asignar y despachar en condición de alquiler.

SSOMA

Estimado Jose / Cesar

ZTRACK

Estimada Eusebio / Luis, por favor asignar la telemetría asimismo hacerme llegar el usuario y contraseña del acceso a la plataforma cuando este instalado el equipo

ALMACEN

Estimada Karen / Carina / Brigitt

Por favor despachar en condición de alquiler, lo siguiente:

TRANSPORTE

Estimada Xiomara / Sthepanie, por favor asignar unidad y operador.

FECHA Y HORA DE ENTREGA – CLIENTE:

Dirección: Makro sullana <https://maps.app.goo.gl/ejemplo>
`;

test('la fecha de un reenvío de Outlook queda en hora de Lima', () => {
  const fecha = leerFechaCorreo('Enviado el: jueves, 30 de abril de 2026 12:21');
  assert.equal(fecha?.toISOString(), '2026-04-30T17:21:00.000Z');
  const gmail = leerFechaCorreo('El jue, 30 jul 2026 a las 16:49, Olinda Lopez escribió:');
  assert.equal(gmail?.toISOString(), '2026-07-30T21:49:00.000Z');
});

test('el seguimiento señala a Eusebio y Luis y ordena el hilo', () => {
  const seguimiento = armarSeguimiento(
    [
      {
        de: 'Olinda Lopez <comercial4@zgroup.com.pe>',
        fecha: new Date('2026-08-03T14:32:45Z'),
        asunto: 'RE: ASIGNAR Y DESPACHAR // COT 10020261103',
        texto: `Buenos días\nYa contamos con la aprobación del centro comercial por ello se actualiza la fecha de entrega.\n\nDe: Olinda Lopez <comercial4@zgroup.com.pe>\nEnviado el: jueves, 30 de abril de 2026 12:21\nPara: operaciones@zgroup.com.pe\nAsunto: ASIGNAR Y DESPACHAR // COT 10020261103 - ALQUILER\n\n${encargo}`,
      },
      {
        de: 'INFORMES ZGROUP <informes@zgroup.com.pe>',
        fecha: new Date('2026-08-03T18:56:59Z'),
        asunto: 'RE: ASIGNAR Y DESPACHAR // COT 10020261103',
        texto: 'Favor de compartir Nro de Ticket, no se encuentra programado en Odoo.\n\nDe: Olinda Lopez <comercial4@zgroup.com.pe>\nEnviado el: lunes, 3 de agosto de 2026 9:32\nAsunto: RE: ASIGNAR Y DESPACHAR\n\nYa contamos con la aprobación.',
      },
    ],
    [...TERMINOS_INICIALES],
  );
  assert.equal(seguimiento.momento?.area, 'ZTRACK');
  assert.equal(seguimiento.momento?.cuando, '30/04/2026 12:21');
  assert.equal(seguimiento.momento?.de, 'Olinda Lopez');
  assert.match(seguimiento.momento?.extracto ?? '', /Eusebio \/ Luis/);
  const frases = seguimiento.momento?.frases ?? [];
  assert.ok(frases.length > 1);
  assert.ok(frases.some((frase) => /eusebio/i.test(frase)));
  assert.ok(frases.some((frase) => /luis/i.test(frase)));
  assert.ok(frases.some((frase) => /telemetr/i.test(frase)));
  assert.ok(frases.some((frase) => /usuario y contraseña/i.test(frase)));
  assert.ok(frases.some((frase) => /acceso a la plataforma/i.test(frase)));
  assert.equal(seguimiento.areas.find((area) => area.nuestra)?.area, 'ZTRACK');
  assert.match(seguimiento.areas.find((area) => area.area === 'Despacho')?.texto ?? '', /Johan/);
  assert.match(seguimiento.areas.find((area) => area.area === 'Entrega')?.texto ?? '', /Makro sullana/);
  assert.deepEqual(
    seguimiento.linea.map((paso) => [paso.cuando, paso.convoca]),
    [
      ['30/04/2026 12:21', true],
      ['03/08/2026 09:32', false],
      ['03/08/2026 13:56', false],
    ],
  );
  assert.match(seguimiento.linea[1]?.resumen ?? '', /aprobación/);
  assert.match(seguimiento.linea[2]?.resumen ?? '', /Ticket/);
});

test('un pendiente con dos COT resume las áreas', () => {
  const resumen = resumenHilo(
    [
      {
        de: 'Olinda Lopez <comercial4@zgroup.com.pe>',
        fecha: new Date('2026-08-03T14:32:45Z'),
        asunto: 'ASIGNAR Y DESPACHAR // COT 10020263597 // COT 10020263765',
        texto: encargo,
      },
    ],
    [...TERMINOS_INICIALES],
  );
  assert.equal(resumen.motivo, null);
  assert.match(resumen.resumen, /Van juntas en la misma tarea/);
  assert.match(resumen.resumen, /10020263597/);
  assert.match(resumen.resumen, /10020263765/);
  assert.ok(resumen.seguimiento.areas.some((area) => area.area === 'Despacho'));
  assert.ok(resumen.seguimiento.areas.some((area) => area.area === 'ZTRACK'));
});

test('el correo de ejemplo deja el extracto en ZTRACK', () => {
  const archivo = readFileSync(path.resolve(__dirname, '../../../docs/ejemplos/correo-cot-10020263623.md'), 'utf8');
  const cuerpo = [...archivo.matchAll(/```text\n([\s\S]*?)```/g)][1]?.[1] ?? '';
  const seguimiento = armarSeguimiento(
    [{ de: 'Olinda Lopez <comercial4@zgroup.com.pe>', fecha: new Date('2026-09-01T15:00:00Z'), asunto: 'ASIGNAR Y DESPACHAR', texto: cuerpo }],
    [...TERMINOS_INICIALES],
  );
  assert.match(seguimiento.momento?.extracto ?? '', /Eusebio \/ Luis/);
  assert.equal(seguimiento.linea.length, 1);
  assert.equal(seguimiento.linea[0]?.convoca, true);
});
