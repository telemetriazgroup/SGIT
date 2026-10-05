import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { test } from 'node:test';
import { TERMINOS_INICIALES, clasificar } from '../src/tareas/clasificar';
import { normalizarSeccion } from '../src/tareas/texto';

const fixture = leerFixture();

test('el fixture es evento de desarrollo', () => {
  assert.equal(clasificar(fixture.asunto, fixture.cuerpo, [...TERMINOS_INICIALES]), 'evento_desarrollo');
});

test('sin cotización ni ticket queda en otros', () => {
  assert.equal(clasificar('Reunión interna', 'Buenas tardes, nos vemos el lunes en la oficina.', []), 'otros');
});

test('LinkedIn, Cursor Team y Canva son publicidad y quedan en otros', () => {
  const cuerpo = 'Novedades de telemetría para tu equipo.';
  assert.equal(clasificar('Tienes 1 mensaje nuevo', cuerpo, ['telemetria'], 'LinkedIn <messages-noreply@linkedin.com>'), 'otros');
  assert.equal(clasificar('Tu diseño está listo', cuerpo, ['telemetria'], 'Canva <marketing@engage.canva.com>'), 'otros');
  assert.equal(clasificar('Novedades de Cursor', cuerpo, ['telemetria'], 'Cursor Team <team@mail.cursor.com>'), 'otros');
});

test('una palabra del diccionario en el asunto, sin COT, es asunto interno', () => {
  const clase = clasificar('Consulta de Luis', 'Confirma la visita de mañana.', ['luis']);
  assert.equal(clase, 'interna');
});

test('etiquetar a telemetría o a ZTRACK equivale a citar a Luis y Eusebio', () => {
  const cuerpo = "Estimado @'telemetria zgroup', @'ZTRACK TELEMETRY'\nBuenas tardes, capacitación del furgón.";
  assert.equal(clasificar('ASISTENCIA PARA CAPACITACION // 10020240692- FURGON', cuerpo, []), 'evento_desarrollo');
  assert.equal(clasificar('Aviso de coordinación', cuerpo, []), 'interna');
});

test('una cotización que no nos cita queda pendiente', () => {
  const clase = clasificar('ASIGNAR Y DESPACHAR // COT 10020263263 // SERVICIO', 'Buenas tardes, equipo de transporte.', ['luis']);
  assert.equal(clase, 'pendiente');
});

test('estar en copia no es un pedido de participar', () => {
  const cuerpo = `Buenos días.
Favor de validar la orden de compra.
Saludos cordiales.
De: Gabriela Carrillo <tecnicos@zgroup.com.pe>
CC: Johan Romero <operaciones@zgroup.com.pe>; ZTRACK TELEMETRY <
Ztrack@zgroup.com.pe>; telemetria zgroup <
telemetria@zgroup.com.pe>; Marisol Zabarburu <mzabarburu@zgroup.com.pe>
Asunto: RE: COT 10020262956
Buenos días, estimado.`;
  assert.equal(clasificar('ASIGNAR Y DESPACHAR // COT 10020262956 // SERVICIO', cuerpo, ['telemetria', 'ztrack', 'eusebio']), 'pendiente');
});

test('una etiqueta @ en el cuerpo sigue convocando aunque también haya copia', () => {
  const cuerpo = `Estimado @'telemetria zgroup', favor asignar.
CC: telemetria zgroup <telemetria@zgroup.com.pe>`;
  assert.equal(clasificar('COT 10020262956 servicio', cuerpo, []), 'evento_desarrollo');
});

test('la dirección del buzón no convoca a desarrollo', () => {
  const clase = clasificar(
    'Informe semanal',
    'Cc: telemetria@zgroup.com.pe\nZTRACK TELEMETRY <ztrack@zgroup.com.pe>',
    ['telemetria', 'ztrack', 'luis'],
  );
  assert.equal(clase, 'otros');
});

test('nombrar al Ing. Eusebio con una COT es tarea', () => {
  const clase = clasificar(
    'MODIFICACION DE PROCESO DE GASIFICADO: 10020263791 - VENTA // CORPORACION AGROLATINA S.A.C.',
    'De acuerdo a lo conversado con el Ing. Eusebio vía llamada telefónica.',
    [],
  );
  assert.equal(clase, 'evento_desarrollo');
});

test('una frase del diccionario en el cuerpo, con COT, es tarea', () => {
  const clase = clasificar(
    'COT 10020260010 servicio',
    'Cuando esté instalado, enviar el usuario y contraseña del acceso a la plataforma.',
    ['usuario y contrasena', 'acceso a la plataforma'],
  );
  assert.equal(clase, 'evento_desarrollo');
});

test('una frase del diccionario sin COT es asunto interno', () => {
  const clase = clasificar('Coordinación de accesos', 'Falta el usuario y contraseña.', ['usuario y contrasena']);
  assert.equal(clase, 'interna');
});

test('un Luis suelto en el cuerpo no convoca', () => {
  const clase = clasificar('COT 10020263792 servicio de recojo', 'Apoyo al técnico Luis para el recojo.', ['luis', 'eusebio']);
  assert.equal(clase, 'pendiente');
});

test('la convocatoria a Eusebio y Luis con una COT es evento', () => {
  const clase = clasificar(
    'ASIGNAR Y DESPACHAR // 10020263263 // SERVICIO DE TRANSPORTE - LUGAR - CLIENTE S.A.',
    'Estimada Eusebio / Luis, por favor asignar la telemetría',
    ['luis'],
  );
  assert.equal(clase, 'evento_desarrollo');
});

test('dos COT que nos citan son una tarea', () => {
  const clase = clasificar(`${fixture.asunto} // COT 10020260000`, fixture.cuerpo, [...TERMINOS_INICIALES]);
  assert.equal(clase, 'evento_desarrollo');
});

test('dos COT que no nos citan siguen pendientes', () => {
  const clase = clasificar('COT 10020260001 // COT 10020260002', 'Buenas tardes, equipo de transporte.', []);
  assert.equal(clase, 'pendiente');
});

test('quitar un término y agregar otro no cambia el fixture', () => {
  const terminos = TERMINOS_INICIALES.filter((termino) => termino !== 'eusebio');
  assert.equal(clasificar(fixture.asunto, fixture.cuerpo, [...terminos, 'termino de prueba']), 'evento_desarrollo');
});

test('área técnica con tilde y sin tilde es la misma sección', () => {
  assert.equal(normalizarSeccion('ÁREA TECNICA'), 'area tecnica');
  assert.equal(normalizarSeccion('AREA TECNICA'), normalizarSeccion('ÁREA TECNICA'));
});

function leerFixture(): { asunto: string; cuerpo: string } {
  const archivo = readFileSync(path.resolve(__dirname, '../../../docs/ejemplos/correo-cot-10020263623.md'), 'utf8');
  const bloques = [...archivo.matchAll(/```text\n([\s\S]*?)```/g)].map((coincidencia) => coincidencia[1].trim());
  return { asunto: bloques[0], cuerpo: bloques[1] };
}
