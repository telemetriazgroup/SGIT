import assert from 'node:assert/strict';
import test from 'node:test';
import { asuntoRegistro, htmlFichaConductor, leerRegistro, mensajeWhatsappRegistro, MOTIVO_FICHA_REGISTRO, textoRegistro } from '../src/salida/ficha-registro';
import { candidatosTelefono, correoRaw, htmlRegistro, leerReferencia, momentoCorreo, MOTIVO_HTML_REGISTRO, MOTIVO_REFERENCIA, NOMBRE_REGISTRO_CONDUCTORES, PAUSA_CORREO_MS, repetirReferencia, separarCorreos, telefonoSalida, telefonoValido, textoContacto, VENTANA_YA_ENVIADO_MS } from '../src/salida/reglas';

test('un correo queda 20 segundos después del anterior', () => {
  const ahora = new Date('2026-10-29T14:00:00.000Z');
  assert.equal(momentoCorreo(null, ahora).toISOString(), ahora.toISOString());
  const siguiente = momentoCorreo(ahora, ahora);
  assert.equal(siguiente.getTime() - ahora.getTime(), PAUSA_CORREO_MS);
});

test('el teléfono de 9 dígitos sale con prefijo 51', () => {
  assert.equal(telefonoSalida('987654321'), '51987654321');
  assert.equal(telefonoSalida('51929467505'), '51929467505');
  assert.equal(telefonoValido(telefonoSalida('987654321')), true);
});

test('un número de 9 dígitos encuentra el mismo WhatsApp con prefijo 51', () => {
  assert.deepEqual(candidatosTelefono('987654321'), ['987654321', '51987654321']);
  assert.ok(candidatosTelefono('51987654321').includes('987654321'));
});

test('el mensaje de contacto nombra el número recibido', () => {
  assert.equal(textoContacto('51911111111'), 'Para continuar, comunícate al 51911111111.');
});

test('el correo crudo lleva destinatario y asunto', () => {
  const raw = correoRaw('telemetria@zgroup.com.pe', 'cliente@ejemplo.com', 'Aviso SGIT', 'Hola');
  const texto = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(texto, /From: telemetria@zgroup.com.pe/);
  assert.match(texto, /To: cliente@ejemplo.com/);
  assert.match(texto, /Subject: Aviso SGIT/);
  assert.match(texto, /Hola/);
  assert.doesNotMatch(texto, /Cc:/);
  assert.doesNotMatch(texto, /Bcc:/);
});

test('el registro de conductores nombra al remitente y manda las dos partes', () => {
  const raw = correoRaw(
    'telemetria@zgroup.com.pe',
    'operaciones@zgroup.com.pe',
    '[LIMA] CARGAR CONTENEDOR | CYB.476',
    'SEDE: LIMA',
    '',
    '',
    '<p>Nuevo registro de conductor</p>',
    NOMBRE_REGISTRO_CONDUCTORES,
  );
  const texto = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(texto, /From: "Registro de Conductores - ZGROUP" <telemetria@zgroup.com.pe>/);
  assert.match(texto, /multipart\/alternative/);
  assert.match(texto, /text\/plain/);
  assert.match(texto, /text\/html/);
  assert.match(texto, /SEDE: LIMA/);
  assert.match(texto, /Nuevo registro de conductor/);
});

test('el html del registro es obligatorio y cabe en 20000 caracteres', () => {
  assert.equal(htmlRegistro('').motivo, MOTIVO_HTML_REGISTRO);
  assert.equal(htmlRegistro('   ').motivo, MOTIVO_HTML_REGISTRO);
  assert.equal(htmlRegistro('x'.repeat(20001)).motivo, MOTIVO_HTML_REGISTRO);
  assert.equal(htmlRegistro('<p>ok</p>').motivo, null);
  assert.equal(htmlRegistro('<p>ok</p>').html, '<p>ok</p>');
});

test('el correo con diseño sale como texto y como html', () => {
  const raw = correoRaw('telemetria@zgroup.com.pe', 'cliente@ejemplo.com', 'Aviso', 'Hola en texto', '', '', '<p>Hola en diseño</p>');
  const texto = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(texto, /multipart\/alternative/);
  assert.match(texto, /text\/plain/);
  assert.match(texto, /text\/html/);
  assert.match(texto, /Hola en texto/);
  assert.match(texto, /Hola en diseño/);
});

test('el correo crudo incluye copia y copia oculta', () => {
  const raw = correoRaw('telemetria@zgroup.com.pe', 'cliente@ejemplo.com', 'Aviso', 'Hola', 'copia@ejemplo.com', 'oculta@ejemplo.com');
  const texto = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(texto, /Cc: copia@ejemplo.com/);
  assert.match(texto, /Bcc: oculta@ejemplo.com/);
});

const fichaEjemplo = {
  sede: 'LIMA',
  motivo: 'CARGAR CONTENEDOR',
  fecha: '10/11/2026',
  hora: '09:56:08',
  placaTracto: 'CYB.476',
  placaCarreta: 'A8F974',
  conductor: 'DOMINGO CHUCO CAPCHA',
  empresa: 'LH TRADE',
  ruc: '20545385296',
  brevete: '21106707',
  telefono: '954124973',
  codigoEquipo: 'NO INDICADO',
  estado: 'REGISTRADO',
  observaciones: 'SIN OBSERVACIONES',
  id: 'ZG-20261110-095608',
};

test('la ficha del registro separa cada dato y completa los vacíos', () => {
  const leido = leerRegistro(fichaEjemplo);
  assert.ok('ficha' in leido);
  if (!('ficha' in leido)) return;
  assert.equal(leido.ficha.fechaHora, '10/11/2026 09:56:08');
  assert.equal(asuntoRegistro(leido.ficha), '[LIMA] CARGAR CONTENEDOR | CYB.476');
  const corto = leerRegistro({ sede: 'LIMA', motivo: 'CARGAR CONTENEDOR', fecha: '10/11/2026', placa_tracto: 'CYB.476', conductor: 'DOMINGO', id: 'ZG-1' });
  assert.ok('ficha' in corto);
  if (!('ficha' in corto)) return;
  assert.equal(corto.ficha.placaCarreta, 'NO INDICADO');
  assert.equal(corto.ficha.observaciones, 'SIN OBSERVACIONES');
  assert.equal(corto.ficha.estado, 'REGISTRADO');
  assert.equal(leerRegistro({}).error, MOTIVO_FICHA_REGISTRO);
  assert.equal(leerRegistro({ sede: 'LIMA' }).error, MOTIVO_FICHA_REGISTRO);
});

test('el whatsapp del registro lleva cada dato en su línea', () => {
  const leido = leerRegistro({ ...fichaEjemplo, conductor: 'DOMINGO <script>' });
  assert.ok('ficha' in leido);
  if (!('ficha' in leido)) return;
  const mensaje = mensajeWhatsappRegistro(leido.ficha);
  const lineas = mensaje.split('\n').filter((linea) => linea.startsWith('*') && linea.includes(':*'));
  assert.equal(lineas.length, 14);
  assert.match(mensaje, /\*Sede:\* LIMA/);
  assert.match(mensaje, /\*Placa tracto:\* CYB\.476/);
  assert.match(mensaje, /\*Conductor:\* DOMINGO <script>/);
  assert.match(mensaje, /\*ID de registro:\* ZG-20261110-095608/);
  assert.ok(mensaje.includes('\n\n'));
  assert.ok(mensaje.length <= 4000);
  assert.doesNotMatch(mensaje, /LIMA CARGAR CONTENEDOR CYB\.476 DOMINGO/);
});

test('el correo del registro dibuja la ficha y escapa el html', () => {
  const leido = leerRegistro({ ...fichaEjemplo, empresa: 'LH & TRADE <b>' });
  assert.ok('ficha' in leido);
  if (!('ficha' in leido)) return;
  const html = htmlFichaConductor(leido.ficha);
  const texto = textoRegistro(leido.ficha);
  assert.match(html, /NUEVO REGISTRO DE CONDUCTOR/);
  assert.match(html, /INGENIERÍA EN FRÍO/);
  assert.match(html, /DETALLE DEL REGISTRO/);
  assert.match(html, /✓ REGISTRADO/);
  assert.match(html, /CYB\.476/);
  assert.match(html, /10\/11\/2026<br>09:56:08/);
  assert.match(html, /ZG-20261110-095608/);
  assert.match(html, /LH &amp; TRADE &lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(texto, /SEDE: LIMA/);
  assert.match(texto, /PLACA CARRETA: A8F974/);
  assert.match(texto, /ID DE REGISTRO: ZG-20261110-095608/);
  assert.ok(html.length <= 20000);
  assert.ok(texto.length <= 8000);
  assert.equal(htmlRegistro(html).motivo, null);
});

test('la misma referencia de conductor no se vuelve a encolar recién enviada', () => {
  const ahora = new Date('2026-11-11T12:00:00-05:00');
  assert.equal(leerReferencia(' zdry:visita:ZG-1:confirmacion ').referencia, 'zdry:visita:ZG-1:confirmacion');
  assert.equal(leerReferencia('').referencia, '');
  assert.equal(leerReferencia('x'.repeat(81)).motivo, MOTIVO_REFERENCIA);
  assert.equal(repetirReferencia('pendiente', null, ahora), 'en_espera');
  assert.equal(repetirReferencia('enviado', new Date(ahora.getTime() - 60_000), ahora), 'ya_enviado');
  assert.equal(repetirReferencia('enviado', new Date(ahora.getTime() - VENTANA_YA_ENVIADO_MS), ahora), null);
  assert.equal(repetirReferencia('cerrado', ahora, ahora), null);
  assert.equal(repetirReferencia(null, null, ahora), null);
});

test('una lista de correos acepta coma, punto y coma y saltos de línea', () => {
  const lista = separarCorreos('Cliente@Ejemplo.com, copia@ejemplo.com\noculta@ejemplo.com; Cliente@Ejemplo.com');
  assert.deepEqual(lista.correos, ['cliente@ejemplo.com', 'copia@ejemplo.com', 'oculta@ejemplo.com']);
  assert.equal(lista.motivo, null);
  assert.equal(separarCorreos('no-es-correo').motivo, 'invalido');
});
