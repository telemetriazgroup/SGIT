import assert from 'node:assert/strict';
import test from 'node:test';
import { candidatosTelefono, correoRaw, momentoCorreo, PAUSA_CORREO_MS, separarCorreos, telefonoSalida, telefonoValido, textoContacto } from '../src/salida/reglas';

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

test('una lista de correos acepta coma, punto y coma y saltos de línea', () => {
  const lista = separarCorreos('Cliente@Ejemplo.com, copia@ejemplo.com\noculta@ejemplo.com; Cliente@Ejemplo.com');
  assert.deepEqual(lista.correos, ['cliente@ejemplo.com', 'copia@ejemplo.com', 'oculta@ejemplo.com']);
  assert.equal(lista.motivo, null);
  assert.equal(separarCorreos('no-es-correo').motivo, 'invalido');
});
