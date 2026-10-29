import assert from 'node:assert/strict';
import test from 'node:test';
import { candidatosTelefono, correoRaw, momentoCorreo, PAUSA_CORREO_MS, telefonoSalida, telefonoValido, textoContacto } from '../src/salida/reglas';

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
  assert.match(texto, /To: cliente@ejemplo.com/);
  assert.match(texto, /Subject: Aviso SGIT/);
  assert.match(texto, /Hola/);
});
