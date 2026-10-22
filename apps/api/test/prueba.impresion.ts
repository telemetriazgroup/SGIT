import assert from 'node:assert/strict';
import test from 'node:test';
import { menuGeneral } from '../src/bot/avisos';
import { capturaDe, esPdf, normalizarBase, textoCaptura, textoTrabajo } from '../src/impresion/reglas';

test('la dirección de impresión queda en el origen y acepta otra IP', () => {
  assert.equal(normalizarBase('http://10.20.0.8:7101'), 'http://10.20.0.8:7101');
  assert.equal(normalizarBase('10.20.0.8:7101/'), 'http://10.20.0.8:7101');
  assert.throws(() => normalizarBase('http://10.20.0.8:7101/jobs'), /sin ruta/);
  assert.throws(() => normalizarBase(''), /Indica la dirección/);
});

test('solo un PDF real pasa y el resultado se dice en claro', () => {
  assert.equal(esPdf(Buffer.from('%PDF-1.4')), true);
  assert.equal(esPdf(Buffer.from('no es')), false);
  assert.match(textoTrabajo({ id: 'abc', status: 'completed', printer_job_id: 4, error: null, pages: 1 }), /Quedó impreso/);
  assert.match(textoTrabajo({ id: 'abc', status: 'queued' }), /en cola/);
  assert.match(textoTrabajo({ status: 'failed', error: 'media-empty' }), /no lo terminó/);
  assert.match(textoTrabajo({ duplicate: true, status: 'completed', id: 'abc' }), /No se imprimió otra vez/);
});

test('la captura de WhatsApp dice por qué el PDF no se guardó', () => {
  const texto = textoCaptura({
    tipoProceso: 'chat',
    tipoWhatsapp: 'document',
    tieneMedia: false,
    mime: '',
    nombre: '14349 Cotización (1).pdf',
    texto: '',
    leyenda: '',
    ruta: false,
    claveMedia: false,
    etapa: '',
    bytes: 0,
    esPdf: false,
    error: 'sin ruta del pdf',
    decision: 'WhatsApp muestra un PDF, pero el proceso no recibió los bytes.',
    claves: 'type, body',
  });
  assert.match(texto, /no se guardó como PDF/);
  assert.match(texto, /Tipo que vio el proceso: chat/);
  assert.match(texto, /Tipo en WhatsApp: document/);
  assert.match(texto, /14349 Cotización/);
  assert.match(texto, /Empieza por %PDF: no/);
  assert.equal(capturaDe(null), null);
  assert.equal(capturaDe({ tipoProceso: 'document', tieneMedia: true, bytes: 12.9 })?.bytes, 12);
});

test('el menú del administrador separa imprimir de salir', () => {
  const elevado = menuGeneral(true);
  assert.match(elevado, /5\. Imprimir/);
  assert.match(elevado, /6\. Salir/);
  const tecnico = menuGeneral(false);
  assert.match(tecnico, /3\. Salir/);
  assert.doesNotMatch(tecnico, /Imprimir/);
});
