export type EnvioPagina = { texto: string; mime?: string; data?: string; filename?: string };
export type ResultadoEnvio = { ok: boolean; error: string };

// El modelo de un archivo trae __x_id. Al armar el mensaje, ese campo pisa el
// id real y WhatsApp tira "Data passed to getter must include an id property".
// El texto no pasa por ahí. Hay que quitarlo antes de cada envío con archivo.
const parcheMedia = `
  var paginaWa = window;
  if (paginaWa.WWebJS && paginaWa.WWebJS.processMediaData && !paginaWa.WWebJS.processMediaData.__sgit) {
    var original = paginaWa.WWebJS.processMediaData;
    var envuelto = async function() {
      var data = await original.apply(this, arguments);
      function quitar(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        try { delete obj.__x_id; } catch (error) {}
        return obj;
      }
      if (data && typeof data.toJSON === 'function' && !data.toJSON.__sgit) {
        var previo = data.toJSON.bind(data);
        var limpio = function() { return quitar(previo()); };
        limpio.__sgit = true;
        data.toJSON = limpio;
      }
      return quitar(data);
    };
    envuelto.__sgit = true;
    paginaWa.WWebJS.processMediaData = envuelto;
  }
`;

// JavaScript plano a propósito. Esta función se copia dentro de la página de
// WhatsApp. Si se escribe en TypeScript, tsx le inyecta __name y la página
// corta el envío con "__name is not defined".
export const sanearMediaWhatsapp = new Function(`${parcheMedia}\nreturn true;`) as () => boolean;

export const enviarEnWhatsapp = new Function(
  'telefono',
  'envio',
  `return (async () => {
    ${parcheMedia}
    if (!paginaWa.WWebJS || !paginaWa.WWebJS.sendMessage) return { ok: false, error: 'WhatsApp todavía no está listo.' };
    function textoDe(valor) {
      try {
        if (!valor) return '';
        if (typeof valor === 'string') return valor;
        return String(valor.user || valor._serialized || '');
      } catch (error) {
        return '';
      }
    }
    var chats = paginaWa.require('WAWebCollections').Chat;
    var modelos = (chats.getModelsArray && chats.getModelsArray()) || [];
    var chat = null;
    var i;
    for (i = 0; i < modelos.length; i++) {
      var item = modelos[i];
      var id = textoDe(item && item.id);
      var contacto = '';
      try {
        contacto = textoDe(item && item.contact && item.contact.phoneNumber);
      } catch (error) {
        contacto = '';
      }
      if (id.indexOf(telefono) !== -1 || contacto.indexOf(telefono) !== -1) {
        chat = item;
        break;
      }
    }
    if (!chat) {
      try {
        var fabrica = paginaWa.require('WAWebWidFactory');
        var base = fabrica.createWid(telefono + '@c.us');
        var existe = base ? await paginaWa.require('WAWebQueryExistsJob').queryWidExists(base) : null;
        var wid = (existe && existe.wid) || base;
        if (!wid) return { ok: false, error: 'no armé el chat de ' + telefono };
        try {
          chat = chats.get(wid);
        } catch (error) {
          chat = null;
        }
        if (!chat) {
          var creado = await paginaWa.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
          chat = creado && creado.chat;
        }
      } catch (error) {
        return { ok: false, error: (error && error.message) || 'no abrí el chat' };
      }
    }
    if (!chat) return { ok: false, error: 'no hay chat para ' + telefono };
    var opciones = { waitUntilMsgSent: false, linkPreview: false };
    var contenido = envio.texto || '';
    if (envio.data && envio.mime) {
      opciones.media = { mimetype: envio.mime, data: envio.data, filename: envio.filename || 'archivo' };
    }
    async function yaSalio(texto) {
      var buscado = String(texto || '').replace(/\\s+/g, ' ').trim();
      if (!buscado) return false;
      var intento;
      for (intento = 0; intento < 3; intento++) {
        if (intento > 0) await new Promise(function (resolver) { setTimeout(resolver, 300); });
        var msgs = [];
        try {
          msgs = (chat.msgs && chat.msgs.getModelsArray && chat.msgs.getModelsArray()) || [];
        } catch (error) {
          msgs = [];
        }
        var desde = Math.max(0, msgs.length - 25);
        var j;
        var limite = Date.now() - 3 * 60 * 1000;
        for (j = msgs.length - 1; j >= desde; j--) {
          var msg = msgs[j];
          var cuerpo = '';
          var mio = false;
          var cuando = 0;
          try { cuerpo = String(msg.body || '').replace(/\\s+/g, ' ').trim(); } catch (error) { cuerpo = ''; }
          try { mio = Boolean((msg.id && msg.id.fromMe) || msg.fromMe); } catch (error) { mio = false; }
          try { cuando = Number(msg.t || 0) * 1000; } catch (error) { cuando = 0; }
          if (mio && cuerpo === buscado && (cuando === 0 || cuando >= limite)) return true;
        }
      }
      return false;
    }
    try {
      var enviado = await paginaWa.WWebJS.sendMessage(chat, contenido, opciones);
      if (enviado || await yaSalio(contenido)) return { ok: true, error: '' };
      return { ok: false, error: 'WhatsApp no confirmó el envío.' };
    } catch (error) {
      if (await yaSalio(contenido)) return { ok: true, error: '' };
      return { ok: false, error: (error && error.message) || 'WhatsApp rechazó el envío' };
    }
  })();`,
) as (telefono: string, envio: EnvioPagina) => Promise<ResultadoEnvio>;
