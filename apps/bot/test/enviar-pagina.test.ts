import assert from 'node:assert/strict';
import test from 'node:test';
import { enviarEnWhatsapp, sanearMediaWhatsapp } from '../src/enviar-pagina';

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
  assert.match(fuente, /waitUntilMsgSent: false/);
  assert.match(fuente, /__x_id/);
  assert.doesNotMatch(fuente, /: string/);
});

test('el archivo pierde el id interno que rompe el envío', async () => {
  const pagina: Pagina & { WWebJS: { processMediaData: () => Promise<{ __x_id?: string; mimetype: string; toJSON: () => { __x_id?: string; mimetype: string } }> } } = {
    require() {
      return {};
    },
    WWebJS: {
      async processMediaData() {
        return {
          __x_id: 'id-interno-del-archivo',
          mimetype: 'application/pdf',
          toJSON() {
            return { __x_id: 'id-interno-del-archivo', mimetype: 'application/pdf' };
          },
        };
      },
    },
  };
  await conPagina(pagina, async () => {
    sanearMediaWhatsapp();
    return undefined;
  });
  const data = await pagina.WWebJS.processMediaData();
  assert.equal(data.__x_id, undefined);
  assert.equal(data.mimetype, 'application/pdf');
  assert.equal(data.toJSON().__x_id, undefined);
  assert.equal(data.toJSON().mimetype, 'application/pdf');
});

test('sin la página lista el envío explica el corte', async () => {
  const resultado = await conPagina({ require: () => ({}) }, () => enviarEnWhatsapp('51929467505', { texto: 'hola' }));
  assert.deepEqual(resultado, { ok: false, error: 'WhatsApp todavía no está listo.' });
});

test('el chat ya abierto recibe el texto y la imagen conserva el pie', async () => {
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
  assert.equal(enviados[1].contenido, 'no va');
  assert.equal(enviados[1].opciones.media?.filename, 'foto.jpg');
});

test('si el texto ya quedó en el chat, un fallo posterior cuenta como enviado', async () => {
  let llamadas = 0;
  const pagina: Pagina = {
    require(nombre) {
      if (nombre !== 'WAWebCollections') throw new Error(`no debía pedir ${nombre}`);
      return {
        Chat: {
          getModelsArray: () => [{
            id: { _serialized: '51929467505@c.us' },
            msgs: {
              getModelsArray: () => [{ id: { fromMe: true }, body: 'Hola, Rafael prueba.', t: Math.floor(Date.now() / 1000) }],
            },
          }],
        },
      };
    },
    WWebJS: {
      async sendMessage() {
        llamadas += 1;
        throw new Error('__name is not defined');
      },
    },
  };
  const resultado = await conPagina(pagina, () => enviarEnWhatsapp('51929467505', { texto: 'Hola, Rafael prueba.' }));
  assert.equal(resultado.ok, true);
  assert.equal(resultado.error, '');
  assert.equal(llamadas, 1);
});

test('si el pie de la imagen ya quedó en el chat, el fallo posterior no reenvía', async () => {
  const pagina: Pagina = {
    require(nombre) {
      if (nombre !== 'WAWebCollections') throw new Error(`no debía pedir ${nombre}`);
      return {
        Chat: {
          getModelsArray: () => [{
            id: { _serialized: '51977738855@c.us' },
            msgs: {
              getModelsArray: () => [{ id: { fromMe: true }, body: 'Reporte de orden de producción ZGROU/MO/06841.', t: Math.floor(Date.now() / 1000) }],
            },
          }],
        },
      };
    },
    WWebJS: {
      async sendMessage() {
        throw new Error('Data passed to getter must include an id property (it\'s how we memoize) but got undefined');
      },
    },
  };
  const resultado = await conPagina(pagina, () => enviarEnWhatsapp('51977738855', {
    texto: 'Reporte de orden de producción ZGROU/MO/06841.',
    mime: 'application/pdf',
    data: 'JVBERi0=',
    filename: 'Produccion - ZGROU-MO-06841.pdf',
  }));
  assert.equal(resultado.ok, true);
});

test('un fallo sin el texto en el chat no se da por enviado', async () => {
  const pagina: Pagina = {
    require(nombre) {
      if (nombre !== 'WAWebCollections') throw new Error(`no debía pedir ${nombre}`);
      return { Chat: { getModelsArray: () => [{ id: { _serialized: '51929467505@c.us' }, msgs: { getModelsArray: () => [] } }] } };
    },
    WWebJS: {
      async sendMessage() {
        throw new Error('WhatsApp rechazó el envío');
      },
    },
  };
  const resultado = await conPagina(pagina, () => enviarEnWhatsapp('51929467505', { texto: 'hola' }));
  assert.equal(resultado.ok, false);
  assert.equal(resultado.error, 'WhatsApp rechazó el envío');
});
