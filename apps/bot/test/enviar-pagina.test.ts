import assert from 'node:assert/strict';
import test from 'node:test';
import { enviarEnWhatsapp } from '../src/enviar-pagina';

type Pagina = {
  require: (nombre: string) => unknown;
  WWebJS?: { sendMessage: (chat: unknown, contenido: string, opciones: unknown) => Promise<unknown> };
};

function conPagina<T>(pagina: Pagina, accion: () => Promise<T>): Promise<T> {
  const previo = (globalThis as { window?: Pagina }).window;
  (globalThis as { window?: Pagina }).window = pagina;
  return accion().finally(() => {
    (globalThis as { window?: Pagina }).window = previo;
  });
}

test('el script que entra a WhatsApp no lleva el ayudante de tsx', () => {
  const fuente = Function.prototype.toString.call(enviarEnWhatsapp);
  assert.equal(fuente.includes('__name'), false);
  assert.match(fuente, /sendMessage/);
  assert.doesNotMatch(fuente, /: string/);
});

test('sin la página lista el envío explica el corte', async () => {
  const resultado = await conPagina({ require: () => ({}) }, () => enviarEnWhatsapp('51929467505', { texto: 'hola' }));
  assert.deepEqual(resultado, { ok: false, error: 'WhatsApp todavía no está listo.' });
});

test('el chat ya abierto recibe el texto y una imagen sale sin texto', async () => {
  const enviados: Array<{ contenido: string; opciones: { media?: { filename: string } } }> = [];
  const pagina: Pagina = {
    require(nombre) {
      if (nombre === 'WAWebCollections') {
        return { Chat: { getModelsArray: () => [{ id: { _serialized: '51929467505@c.us' } }] } };
      }
      throw new Error(`no debía pedir ${nombre}`);
    },
    WWebJS: {
      async sendMessage(_chat, contenido, opciones) {
        enviados.push({ contenido, opciones: opciones as { media?: { filename: string } } });
        return { id: '1' };
      },
    },
  };
  const texto = await conPagina(pagina, () => enviarEnWhatsapp('51929467505', { texto: 'Prueba de SGIT' }));
  const imagen = await conPagina(pagina, () => enviarEnWhatsapp('51929467505', { texto: 'no va', mime: 'image/jpeg', data: 'abc', filename: 'foto.jpg' }));
  assert.equal(texto.ok, true);
  assert.equal(enviados[0].contenido, 'Prueba de SGIT');
  assert.equal(imagen.ok, true);
  assert.equal(enviados[1].contenido, '');
  assert.equal(enviados[1].opciones.media?.filename, 'foto.jpg');
});
