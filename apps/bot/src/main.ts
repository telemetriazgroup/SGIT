import { config } from 'dotenv';
import { execFile } from 'child_process';
import { readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import qrcodeTerminal from 'qrcode-terminal';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { crearClienteBot } from './api';
import { enlazarEstado } from './estado';
import { directorioDeEstado, rutaDeSesion } from './rutas';
import { crearSumideroArchivo } from './sumidero';

config({ path: path.resolve(__dirname, '../../../.env') });

const clave = process.env.SESION_SECRETO?.trim() ?? '';
const base = process.env.API_URL?.trim() || 'http://localhost:18003';
if (!clave) {
  console.error('SGIT bot: falta SESION_SECRETO. Este proceso no arranca.');
  process.exit(1);
}

const api = crearClienteBot(base, clave);
const yo = `sgit-bot-${process.pid}`;
const archivos = crearSumideroArchivo(directorioDeEstado());
let pulso: NodeJS.Timeout | null = null;
let salida: NodeJS.Timeout | null = null;
const ESPERA_MS = 2000;
const turno = new Map<string, number>();
let cliente = crearCliente();
let reiniciando = false;
let ultimoReinicio = 0;
let ultimoAviso = '';
let ultimoAvisoEn = 0;

function crearCliente(): Client {
  const nuevo = new Client({
    authStrategy: new LocalAuth({ clientId: 'sgit-lab', dataPath: rutaDeSesion() }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });
  enganchar(nuevo);
  return nuevo;
}

function enganchar(actual: Client): void {
  enlazarEstado(actual, {
    async actualizar(estado, qr) {
      try {
        await archivos.actualizar(estado, qr);
        await api.publicar(estado);
      } catch (error) {
        console.error(`SGIT bot: no pude publicar el estado. ${detalle(error)}`);
      }
      if (estado === 'esperando_qr' && qr) {
        console.log('SGIT bot: esperando QR. Imagen en sessions/qr.png');
        qrcodeTerminal.generate(qr, { small: true });
        void anotar('info', 'WhatsApp muestra un código nuevo. Hay que escanearlo en el teléfono de laboratorio.');
      }
      if (estado === 'listo') {
        console.log('SGIT bot: listo');
        void anotar('info', 'Sesión lista. La sincronización de WhatsApp está activa.');
      }
      if (estado === 'desconectado' && !reiniciando) {
        console.log('SGIT bot: desconectado');
        void anotar('fallo', 'WhatsApp quedó desconectado.');
      }
    },
  });
  actual.on('message', (mensaje) => {
    void atender(mensaje).catch((error: unknown) => {
      console.error(`SGIT bot: no pude atender el mensaje. ${detalle(error)}`);
    });
  });
  actual.on('disconnected', (razon: string) => {
    if (reiniciando) return;
    void anotar('fallo', `WhatsApp cortó la sesión${razon ? `: ${razon}` : ''}.`);
  });
  actual.on('auth_failure', (mensaje: string) => {
    void anotar('fallo', `La sesión guardada no fue aceptada. ${mensaje || 'Hay que cerrarla y escanear otro código.'}`);
  });
}

void arrancar();

async function arrancar(): Promise<void> {
  const tomado = await api.reclamar(yo);
  if (!tomado) {
    console.error('SGIT bot: ya hay un líder. Este proceso no arranca.');
    process.exit(1);
  }
  const pedido = await api.pedirReinicio().catch(() => ({ reiniciar: false, olvidar: false }));
  if (pedido.olvidar) await borrarCarpetaSesion();
  pulso = setInterval(() => {
    void api.reclamar(yo).catch((error: unknown) => {
      console.error(`SGIT bot: no pude renovar el liderazgo. ${detalle(error)}`);
      void anotar('fallo', `No pude renovar el liderazgo. ${detalle(error)}`);
    });
  }, 10_000);
  salida = setInterval(() => {
    void enviarPendiente();
    void vigilarReinicio();
  }, 2000);
  await anotar('info', 'Proceso en marcha. Abro la sesión guardada en este equipo.');
  await abrir('al arrancar');
}

async function vigilarReinicio(): Promise<void> {
  if (reiniciando) return;
  let pedido = { reiniciar: false, olvidar: false };
  try {
    pedido = await api.pedirReinicio();
  } catch (error) {
    console.error(`SGIT bot: no pude leer el reinicio. ${detalle(error)}`);
    void anotar('fallo', `No pude leer el pedido de reinicio. ${detalle(error)}`);
    return;
  }
  if (pedido.olvidar) {
    await olvidar();
    return;
  }
  if (pedido.reiniciar) await recuperar('reinicio pedido', true);
}

async function recuperar(motivo: string, forzar = false): Promise<void> {
  if (reiniciando) return;
  if (!forzar && Date.now() - ultimoReinicio < 60_000) return;
  reiniciando = true;
  ultimoReinicio = Date.now();
  console.log(`SGIT bot: reinicio de WhatsApp (${motivo})`);
  await anotar('info', `Reinicio de la misma sesión: ${motivo}.`);
  try {
    await api.publicar('desconectado');
    await cliente.destroy();
  } catch (error) {
    const texto = detalle(error);
    console.error(`SGIT bot: no pude cerrar WhatsApp. ${texto}`);
    await anotar('fallo', `No pude cerrar la ventana de WhatsApp. ${texto}`);
  }
  try {
    await abrir('sesión anterior');
  } finally {
    reiniciando = false;
  }
}

async function olvidar(): Promise<void> {
  if (reiniciando) return;
  reiniciando = true;
  ultimoReinicio = Date.now();
  console.log('SGIT bot: cierro la sesión guardada y pido otro código');
  await anotar('info', 'Cierro la sesión guardada en este equipo.');
  try {
    await api.publicar('desconectado');
    await cliente.destroy();
  } catch (error) {
    await anotar('fallo', `No pude cerrar la ventana antes de borrar la sesión. ${detalle(error)}`);
  }
  await cerrarNavegadorDeSesion();
  await borrarCarpetaSesion();
  cliente = crearCliente();
  try {
    await abrir('sesión nueva');
    await anotar('info', 'La sesión anterior quedó borrada. Escanea el código nuevo en el teléfono de laboratorio.');
  } finally {
    reiniciando = false;
  }
}

async function abrir(origen: string): Promise<void> {
  try {
    await cliente.initialize();
    return;
  } catch (error) {
    const texto = detalle(error);
    console.error(`SGIT bot: no pude abrir WhatsApp (${origen}). ${texto}`);
    if (!/already running/i.test(texto)) {
      await anotar('fallo', `No pude abrir WhatsApp (${origen}). ${texto} Si la misma sesión no vuelve, ciérrala y pide otro código.`);
      return;
    }
  }
  const cerrados = await cerrarNavegadorDeSesion();
  await anotar('info', `El navegador de esta sesión seguía abierto (${cerrados}). Lo cerré y vuelvo a abrir la misma sesión.`);
  await esperar(1000);
  try {
    await cliente.initialize();
  } catch (error) {
    const texto = detalle(error);
    console.error(`SGIT bot: no pude abrir WhatsApp después de cerrar el navegador. ${texto}`);
    await anotar('fallo', `La misma sesión no volvió a abrir. ${texto} Ciérrala y pide otro código.`);
  }
}

async function borrarCarpetaSesion(): Promise<void> {
  const carpeta = path.join(rutaDeSesion(), 'session-sgit-lab');
  await rm(carpeta, { recursive: true, force: true });
  await anotar('info', 'Borré la carpeta de la sesión de este equipo.');
}

function cerrarNavegadorDeSesion(): Promise<number> {
  return new Promise((resolver) => {
    execFile('ps', ['-eo', 'pid,args'], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error || !stdout) {
        resolver(0);
        return;
      }
      let cerrados = 0;
      for (const linea of stdout.split('\n')) {
        if (!linea.includes('session-sgit-lab') || linea.includes('session-zgroup-bot')) continue;
        if (!/chrome|chromium/i.test(linea)) continue;
        const pid = Number(linea.trim().split(/\s+/)[0]);
        if (!pid || pid === process.pid) continue;
        try {
          process.kill(pid, 'SIGTERM');
          cerrados += 1;
        } catch {
          // El navegador ya no está.
        }
      }
      resolver(cerrados);
    });
  });
}

async function anotar(nivel: 'info' | 'fallo', texto: string): Promise<void> {
  const ahora = Date.now();
  if (texto === ultimoAviso && ahora - ultimoAvisoEn < 60_000) return;
  ultimoAviso = texto;
  ultimoAvisoEn = ahora;
  if (nivel === 'fallo') console.error(`SGIT bot: ${texto}`);
  else console.log(`SGIT bot: ${texto}`);
  await api.bitacora(nivel, texto).catch(() => undefined);
}

async function enviarPendiente(): Promise<void> {
  if (reiniciando) return;
  try {
    const aviso = await api.tomar();
    if (!aviso) return;
    const destino = aviso.destino.includes('@') ? aviso.destino : `${aviso.destino}@c.us`;
    const imagenes = aviso.imagenes ?? [];
    if (imagenes.length === 0) {
      await cliente.sendMessage(destino, aviso.cuerpo);
    } else {
      for (const [indice, imagen] of imagenes.entries()) {
        const media = new MessageMedia(imagen.mime, imagen.contenido, imagen.nombre);
        await cliente.sendMessage(destino, media, { caption: indice === 0 ? aviso.cuerpo : '', sendSeen: false });
      }
    }
    await api.confirmar(aviso.id);
  } catch (error) {
    const texto = detalle(error);
    console.error(`SGIT bot: el aviso sigue en la cola. ${texto}`);
    if (!sesionMuerta(texto)) {
      void anotar('fallo', `Un aviso no salió. ${texto}`);
      return;
    }
    await api.fallo('La página de WhatsApp se cerró. Hay que reiniciar la sesión.').catch(() => undefined);
    await anotar('fallo', `La página de WhatsApp se cerró. ${texto}`);
    await recuperar('la página de WhatsApp se cerró');
  }
}

function sesionMuerta(texto: string): boolean {
  return /detached Frame|Session closed|Target closed|Execution context was destroyed|Protocol error|page has been closed|Navigating frame was detached/i.test(texto);
}

type MensajeEntrante = {
  from: string;
  fromMe: boolean;
  body: string;
  type?: string;
  hasMedia: boolean;
  id?: {
    fromMe?: boolean;
    remote?: string | { _serialized?: string; $1?: string };
    id?: string;
    _serialized?: string;
    $1?: string;
  };
  downloadMedia: () => Promise<{ data: string; mimetype?: string; filename?: string | null } | undefined>;
  reload?: () => Promise<unknown>;
  getContact: () => Promise<{ number?: string }>;
  reply: (contenido: string | MessageMedia) => Promise<unknown>;
};

async function atender(mensaje: MensajeEntrante): Promise<void> {
  if (mensaje.fromMe || mensaje.from.endsWith('@g.us')) return;
  const clave = mensaje.from;
  const mio = (turno.get(clave) ?? 0) + 1;
  turno.set(clave, mio);
  const archivo = await bajarImagen(mensaje);
  const fallo = pareceImagen(mensaje) && !archivo;
  await esperar(ESPERA_MS);
  if (turno.get(clave) !== mio) return;
  if (fallo) {
    await mensaje.reply('No pude leer la imagen. Envíala otra vez, o escribe no para seguir sin imagen.');
    return;
  }
  const telefono = await telefonoReal(mensaje);
  const resultado = await api.entrar(telefono, mensaje.body ?? '', archivo);
  if (turno.get(clave) !== mio) return;
  if (resultado.archivo?.contenido) {
    const media = new MessageMedia(resultado.archivo.mime, resultado.archivo.contenido, resultado.archivo.nombre);
    try {
      await cliente.sendMessage(mensaje.from, media, { caption: resultado.respuesta, sendSeen: false });
      return;
    } catch (error) {
      console.error(`SGIT bot: no pude enviar la imagen guardada. ${detalle(error)}`);
    }
  }
  if (resultado.respuesta) await mensaje.reply(resultado.respuesta);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function pareceImagen(mensaje: MensajeEntrante): boolean {
  if (mensaje.type === 'image' || mensaje.type === 'sticker') return true;
  if (mensaje.type === 'video' || mensaje.type === 'audio' || mensaje.type === 'ptt' || mensaje.type === 'document') return false;
  return mensaje.hasMedia;
}

async function bajarImagen(mensaje: MensajeEntrante): Promise<{ nombre: string; mime: string; contenido: string } | null> {
  if (!pareceImagen(mensaje)) return null;
  const identidad = identidadMensaje(mensaje);
  if (!identidad.serial && !identidad.id) {
    console.error('SGIT bot: la foto llegó sin identificador.');
  }
  for (let intento = 0; intento < 2; intento += 1) {
    const media = await bajarEnPagina(identidad);
    if (media) return media;
    await esperar(800);
  }
  console.error('SGIT bot: la foto no se pudo guardar.');
  return null;
}

function identidadMensaje(mensaje: MensajeEntrante): { fromMe: boolean; remote: string; id: string; serial: string } {
  const id = mensaje.id;
  const remote = typeof id?.remote === 'string' ? id.remote : id?.remote?._serialized || id?.remote?.$1 || '';
  const propio = id?.id ?? '';
  const serial = id?._serialized || id?.$1 || (remote && propio ? `${id?.fromMe ? 'true' : 'false'}_${remote}_${propio}` : '');
  return { fromMe: Boolean(id?.fromMe), remote, id: propio, serial };
}

type ReporteImagen = {
  en: string;
  id: string;
  tipo: string;
  mime: string;
  mimeObjeto: string;
  etapa: string;
  directPath: boolean;
  mediaKey: boolean;
  filehash: boolean;
  cache: boolean;
  blob: boolean;
  bytes: number;
  via: string;
  error: string;
  guardada: boolean;
};

type LecturaFoto = {
  data: string;
  mimetype: string;
  filename: string;
  error: string;
  reporte: Omit<ReporteImagen, 'en' | 'id' | 'guardada'>;
};

const leerFotoEnWhatsapp = new Function(
  'clave',
  `return (async () => {
    var reporte = { tipo: '', mime: '', mimeObjeto: '', etapa: '', directPath: false, mediaKey: false, filehash: false, cache: false, blob: false, bytes: 0, via: '', error: '' };
    function fallo(error) {
      if (!error) return 'no se pudo leer';
      return (error.name ? error.name + ': ' : '') + (error.message || String(error));
    }
    function mimeDe(valor) {
      var base = String(valor || '').toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
      if (base === 'image/jpeg' || base === 'image/png' || base === 'image/webp' || base === 'image/gif') return base;
      return '';
    }
    function mimeDeBytes(buffer) {
      var b = new Uint8Array(buffer);
      if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
      if (b.length >= 4 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'image/png';
      if (b.length >= 3 && b[0] === 71 && b[1] === 73 && b[2] === 70) return 'image/gif';
      if (b.length >= 12 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return 'image/webp';
      return '';
    }
    function serie(valor) {
      if (!valor) return '';
      return valor._serialized || valor.$1 || '';
    }
    function vacio(error) {
      reporte.error = error;
      return { data: '', mimetype: '', filename: '', error: error, reporte: reporte };
    }
    async function buscar() {
      var coleccion = window.require('WAWebCollections').Msg;
      var candidatos = [];
      if (clave.serial) candidatos.push(clave.serial);
      if (clave.remote && clave.id) candidatos.push((clave.fromMe ? 'true' : 'false') + '_' + clave.remote + '_' + clave.id);
      try {
        var fabrica = window.require('WAWebWidFactory');
        if (clave.remote && fabrica.createWid && clave.id) {
          candidatos.push({ fromMe: clave.fromMe, remote: fabrica.createWid(clave.remote), id: clave.id, _serialized: clave.serial });
        }
      } catch (error) {}
      for (var i = 0; i < candidatos.length; i++) {
        try {
          var directo = coleccion.get(candidatos[i]);
          if (directo) return directo;
        } catch (error) {}
        try {
          var hallados = await coleccion.getMessagesById([candidatos[i]]);
          if (hallados && hallados.messages && hallados.messages[0]) return hallados.messages[0];
        } catch (error) {}
      }
      var modelos = (coleccion.getModelsArray && coleccion.getModelsArray()) || coleccion.models || [];
      for (var j = 0; j < modelos.length; j++) {
        var suyo = serie(modelos[j].id);
        if (suyo && (suyo === clave.serial || (clave.id && suyo.slice(-clave.id.length - 1) === '_' + clave.id))) return modelos[j];
      }
      return null;
    }
    async function empaquetar(buffer, via, nombre) {
      reporte.bytes = buffer.byteLength;
      reporte.via = via;
      var mime = mimeDeBytes(buffer) || mimeDe(reporte.mime) || mimeDe(reporte.mimeObjeto) || (reporte.tipo === 'sticker' ? 'image/webp' : reporte.tipo === 'image' ? 'image/jpeg' : '');
      if (!mime) return vacio('los bytes no son jpeg, png, webp ni gif');
      var data = await window.WWebJS.arrayBufferToBase64Async(buffer);
      return { data: data, mimetype: mime, filename: nombre, error: '', reporte: reporte };
    }
    try {
      var msg = await buscar();
      if (!msg) return vacio('mensaje no encontrado en la sesion');
      reporte.tipo = String(msg.type || '');
      reporte.mime = String(msg.mimetype || '');
      reporte.mimeObjeto = String((msg.mediaObject && msg.mediaObject.mimetype) || '');
      reporte.directPath = Boolean(msg.directPath);
      reporte.mediaKey = Boolean(msg.mediaKey);
      reporte.filehash = Boolean(msg.filehash || (msg.mediaObject && msg.mediaObject.filehash));
      reporte.etapa = String((msg.mediaData && msg.mediaData.mediaStage) || '');
      if (!msg.mediaData) return vacio('sin media');
      if (msg.downloadMedia) {
        try {
          await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true });
        } catch (error) {
          reporte.error = fallo(error);
        }
      }
      reporte.etapa = String((msg.mediaData && msg.mediaData.mediaStage) || reporte.etapa);
      var hash = (msg.mediaObject && msg.mediaObject.filehash) || msg.filehash || '';
      var blob = null;
      try {
        var modulo = window.require('WAWebMediaInMemoryBlobCache');
        var cache = modulo.InMemoryMediaBlobCache || modulo;
        if (hash && cache && cache.get) blob = cache.get(hash) || null;
        reporte.cache = Boolean(blob);
      } catch (error) {
        if (!reporte.error) reporte.error = fallo(error);
      }
      if (!blob && msg.mediaObject && msg.mediaObject.mediaBlob && msg.mediaObject.mediaBlob.forceToBlob) {
        try {
          blob = msg.mediaObject.mediaBlob.forceToBlob();
          reporte.blob = Boolean(blob);
        } catch (error) {
          if (!reporte.error) reporte.error = fallo(error);
        }
      }
      if (blob && blob.arrayBuffer) return empaquetar(await blob.arrayBuffer(), reporte.cache ? 'cache' : 'blob', String(msg.filename || ''));
      if (reporte.etapa.indexOf('ERROR') >= 0 || reporte.etapa === 'FETCHING' || reporte.etapa === 'REUPLOADING' || !msg.directPath) {
        return vacio(reporte.error || reporte.etapa || 'sin etapa');
      }
      var mimeEnvio = mimeDe(reporte.mime) || mimeDe(reporte.mimeObjeto) || (reporte.tipo === 'sticker' ? 'image/webp' : 'image/jpeg');
      var marca = { addAnnotations: function () { return this; }, addPoint: function () { return this; } };
      var descifrado = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
        directPath: msg.directPath,
        encFilehash: msg.encFilehash,
        filehash: msg.filehash,
        mediaKey: msg.mediaKey,
        mediaKeyTimestamp: msg.mediaKeyTimestamp,
        type: msg.type,
        mimetype: mimeEnvio,
        signal: new AbortController().signal,
        downloadQpl: marca
      });
      reporte.error = '';
      return empaquetar(descifrado, 'descifrado', String(msg.filename || ''));
    } catch (error) {
      return vacio(fallo(error));
    }
  })();`,
) as (clave: { fromMe: boolean; remote: string; id: string; serial: string }) => Promise<LecturaFoto>;

async function bajarEnPagina(identidad: { fromMe: boolean; remote: string; id: string; serial: string }): Promise<{ nombre: string; mime: string; contenido: string } | null> {
  const pagina = cliente.pupPage;
  if (!pagina || (!identidad.serial && !identidad.id)) return null;
  try {
    const media = await pagina.evaluate(leerFotoEnWhatsapp, identidad);
    const guardada = Boolean(media.data && !media.error);
    await anotarReporte({ ...media.reporte, en: new Date().toISOString(), id: identidad.id, guardada });
    if (!guardada) return null;
    return empaquetar(media.data, media.mimetype, media.filename, 'image');
  } catch (error) {
    const texto = detalle(error);
    await anotarReporte({
      en: new Date().toISOString(),
      id: identidad.id,
      tipo: '',
      mime: '',
      mimeObjeto: '',
      etapa: '',
      directPath: false,
      mediaKey: false,
      filehash: false,
      cache: false,
      blob: false,
      bytes: 0,
      via: '',
      error: texto,
      guardada: false,
    });
    console.error(`SGIT bot: no pude leer la foto en la sesión. ${texto}`);
    return null;
  }
}

async function anotarReporte(reporte: ReporteImagen): Promise<void> {
  const ruta = path.join(directorioDeEstado(), 'reporte-imagen.json');
  let previos: ReporteImagen[] = [];
  try {
    const leido = JSON.parse(await readFile(ruta, 'utf8')) as unknown;
    if (Array.isArray(leido)) previos = leido as ReporteImagen[];
  } catch {
    previos = [];
  }
  previos.push(reporte);
  try {
    await writeFile(ruta, JSON.stringify(previos.slice(-12), null, 2));
  } catch (error) {
    console.error(`SGIT bot: no pude guardar el reporte de imagen. ${detalle(error)}`);
  }
  console.error(`SGIT bot: reporte de imagen. ${reporte.guardada ? 'guardada' : 'falló'} via=${reporte.via || '-'} mime=${reporte.mime || '-'} etapa=${reporte.etapa || '-'} error=${reporte.error || '-'}`);
}

function empaquetar(data: string | undefined, mime: string | undefined, filename: string | null | undefined, tipo: string | undefined): { nombre: string; mime: string; contenido: string } | null {
  const normal = mimeImagen(mime, tipo);
  if (!data || !normal) return null;
  return { nombre: filename?.trim() || 'foto-whatsapp', mime: normal, contenido: data };
}

function mimeImagen(mime: string | undefined, tipo: string | undefined): string | null {
  const base = (mime ?? '').toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
  if (base === 'image/jpeg' || base === 'image/png' || base === 'image/webp' || base === 'image/gif') return base;
  if (!mime && tipo === 'sticker') return 'image/webp';
  if (!mime && tipo === 'image') return 'image/jpeg';
  return null;
}

async function telefonoReal(mensaje: { from: string; getContact: () => Promise<{ number?: string }> }): Promise<string> {
  if (!mensaje.from.endsWith('@lid')) return mensaje.from;
  try {
    const pares = await cliente.getContactLidAndPhone([mensaje.from]);
    const numero = pares?.[0]?.pn;
    if (numero) return numero;
  } catch (error) {
    console.error(`SGIT bot: no pude leer el número. ${detalle(error)}`);
  }
  try {
    const contacto = await mensaje.getContact();
    if (contacto?.number) return contacto.number;
  } catch (error) {
    console.error(`SGIT bot: no pude leer el contacto. ${detalle(error)}`);
  }
  return mensaje.from;
}

function detalle(error: unknown): string {
  return error instanceof Error ? error.message : 'error de red';
}

function cerrar(): void {
  if (pulso) clearInterval(pulso);
  if (salida) clearInterval(salida);
  void cliente.destroy().catch(() => undefined).finally(() => {
    void api.soltar(yo).finally(() => process.exit(0));
  });
}

process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
