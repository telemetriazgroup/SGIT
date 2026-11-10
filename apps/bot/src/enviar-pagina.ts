export type EnvioPagina = { texto: string; mime?: string; data?: string; filename?: string };
export type ResultadoEnvio = { ok: boolean; error: string };

// JavaScript plano a propósito. Esta función se copia dentro de la página de
// WhatsApp. Si se escribe en TypeScript, tsx le inyecta __name y la página
// corta el envío con "__name is not defined".
export const enviarEnWhatsapp = new Function(
  'telefono',
  'envio',
  `return (async () => {
    var paginaWa = window;
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
    var opciones = { waitUntilMsgSent: true, linkPreview: false };
    var contenido = envio.texto;
    if (envio.data && envio.mime) {
      opciones.media = { mimetype: envio.mime, data: envio.data, filename: envio.filename || 'archivo' };
      contenido = '';
    }
    try {
      var enviado = await paginaWa.WWebJS.sendMessage(chat, contenido, opciones);
      return { ok: Boolean(enviado), error: enviado ? '' : 'WhatsApp no confirmó el envío.' };
    } catch (error) {
      return { ok: false, error: (error && error.message) || 'WhatsApp rechazó el envío' };
    }
  })();`,
) as (telefono: string, envio: EnvioPagina) => Promise<ResultadoEnvio>;
