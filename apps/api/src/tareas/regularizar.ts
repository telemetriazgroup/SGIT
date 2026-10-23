import { randomUUID } from 'crypto';
import { AlmacenCorreo } from '../buzon/almacen';
import type { Conexiones } from '../conexiones';
import { cierreFabricacion, fragmentosDeTexto, identificarChips, imeisDeTexto, textoChip, type ChipHallado } from '../bot/lectura-chip';
import { asumirZgru, claseDe, leerEtiquetaModulo, proponerImagen, textoDeImagen, type ClaseCodigo } from '../bot/proceso-imagen';
import { corregirEquipo, guardarChip, guardarModem, type HiloAtencion } from './hilos';

const SIN_CODIGO = 'sin código leído';

export type FotoRegularizar = { nombre: string; mime: string; contenido: Buffer };
export type AutorRegularizar = { correo: string; nombre: string };

type Catalogo = { imei: string; celular: string; estado: string; telemetria: string };

export async function leerFotoChip(conexiones: Conexiones, foto: FotoRegularizar): Promise<{ hallados: ChipHallado[]; detalle: string; paraWhatsapp: string } | null> {
  const leido = await textoDeImagen(foto);
  if (leido == null) return null;
  const candidatos = imeisDeTexto(leido);
  const fragmentos = fragmentosDeTexto(leido);
  const catalogo = await conexiones.pg.query<Catalogo>(`SELECT imei, celular, estado, telemetria FROM chip WHERE NOT archivado`);
  const resultado = identificarChips(candidatos, catalogo.rows, fragmentos);
  const esTarjeta = /alai|alaisecure|suma m[oó]vil|8951\d{10,}/i.test(leido);
  const detalle = `${esTarjeta ? 'La foto es una tarjeta de chip.\n' : ''}${textoChip(resultado.hallados, resultado.desconocidos)}`;
  const paraWhatsapp = resultado.hallados.length === 0 && resultado.desconocidos.length === 0
    ? 'No pude leer un IMEI en la foto. No hay coincidencia.'
    : `${esTarjeta ? 'La foto es una tarjeta de chip.\n' : ''}${textoChip(resultado.hallados, resultado.desconocidos, true)}`;
  return { hallados: resultado.hallados, detalle, paraWhatsapp };
}

export function chipParaGuardar(hallados: ChipHallado[]): ChipHallado | null {
  return hallados.find((chip) => chip.estado !== 'ocupado') ?? hallados[0] ?? null;
}

export async function registrarChip(
  conexiones: Conexiones,
  hiloId: string,
  tareaId: string,
  chip: ChipHallado,
  autor: AutorRegularizar,
  foto: FotoRegularizar | null,
  origen: 'almacén' | 'técnico',
  canal: 'web' | 'whatsapp',
): Promise<HiloAtencion> {
  const hilo = await guardarChip(conexiones.pg, hiloId, chip.imei, chip.celular, chip.estado);
  const cierre = cierreFabricacion([chip]);
  const texto = `Regularización. ${origen === 'técnico' ? 'El técnico' : 'Almacén'} registró el chip.\nIMEI ${chip.imei}. Celular ${chip.celular}.${chip.estado === 'ocupado' ? ` Está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.` : ''}\n${cierre}`;
  await anotar(conexiones, tareaId, autor, texto, foto, canal);
  return hilo;
}

export async function leerFotoEquipo(foto: FotoRegularizar): Promise<{ clase: ClaseCodigo; codigo: string } | null> {
  const propuesta = await proponerImagen(foto);
  if (!propuesta?.codigo) return null;
  const clase = claseDe(propuesta.tipo, propuesta.codigo);
  const puesto = asumirZgru(propuesta.codigo, clase);
  if (!puesto.codigo || clase === 'otro') return null;
  return { clase, codigo: puesto.codigo };
}

export async function registrarEquipo(
  conexiones: Conexiones,
  hiloId: string,
  tareaId: string,
  clase: 'contenedor' | 'maquina',
  codigo: string,
  autor: AutorRegularizar,
  foto: FotoRegularizar | null,
  canal: 'web' | 'whatsapp',
): Promise<HiloAtencion> {
  const hilo = await corregirEquipo(conexiones.pg, hiloId, clase === 'contenedor' ? { contenedor: codigo } : { maquina: codigo });
  const nombre = clase === 'contenedor' ? 'contenedor' : 'máquina';
  await anotar(conexiones, tareaId, autor, `Regularización. El técnico registró la ${nombre} ${codigo}.`, foto, canal);
  return hilo;
}

export async function registrarModem(
  conexiones: Conexiones,
  hiloId: string,
  tareaId: string,
  datos: { serie?: string; imei?: string },
  autor: AutorRegularizar,
  foto: FotoRegularizar | null,
  origen: 'almacén' | 'técnico',
  canal: 'web' | 'whatsapp',
): Promise<HiloAtencion> {
  const filas = await conexiones.pg.query<HiloAtencion>(
    `SELECT id, tarea_id, orden, estado, lleva_telemetria, contenedor, maquina, despacho_texto, chip_imei, chip_celular, chip_estado, despacho_validado, modem_serie, modem_imei
     FROM hilo_atencion WHERE id = $1`,
    [hiloId],
  );
  const actual = filas.rows[0];
  if (!actual) throw new Error('Ese hilo ya no está.');
  const serieNueva = (datos.serie ?? '').trim();
  const imeiNuevo = (datos.imei ?? '').replace(/\D/g, '');
  const hilo =
    serieNueva || imeiNuevo
      ? await guardarModem(conexiones.pg, hiloId, serieNueva, imeiNuevo)
      : actual;
  const serie = (hilo.modem_serie ?? '').trim();
  const imei = (hilo.modem_imei ?? '').trim();
  const senal = imei ? ` IMEI ${imei}.` : '';
  const quien = origen === 'técnico' ? 'El técnico' : 'Almacén';
  const detalle =
    serieNueva || imeiNuevo
      ? `Hilo ${hilo.orden}. ${quien} registró el módulo 4G${serie ? ` SN ${serie}` : ''}.${senal} Quedó en el hilo.`
      : `Hilo ${hilo.orden}. ${quien} adjuntó la foto del módulo 4G${serie || imei ? ` (${[serie && `SN ${serie}`, imei && `IMEI ${imei}`].filter(Boolean).join(' · ')})` : ''}.`;
  if (!serieNueva && !imeiNuevo && !foto) throw new Error('Escribe el SN o el IMEI del módulo 4G, o sube la foto.');
  await anotar(conexiones, tareaId, autor, detalle, foto, canal);
  return hilo;
}

export async function recibirFotoRegularizacion(
  conexiones: Conexiones,
  tareaId: string,
  hiloId: string,
  clase: 'chip' | 'contenedor' | 'maquina' | 'modem',
  autor: AutorRegularizar,
  foto: FotoRegularizar,
  canal: 'web' | 'whatsapp',
  origen: 'técnico' | 'almacén',
): Promise<string> {
  const orden = await ordenDe(conexiones, hiloId);
  const notaId = await anotar(conexiones, tareaId, autor, textoPendiente(orden, clase), foto, canal);
  try {
    return await leerGuardada(conexiones, notaId, hiloId, clase, origen);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'El lector falló.';
    return `Guardé la foto del hilo ${orden}. ${detalle} Quedó en la cotización para volver a leerla.`;
  }
}

export async function releerFotoGuardada(conexiones: Conexiones, tareaId: string, notaId: string): Promise<string> {
  const filas = await conexiones.pg.query<{ texto: string; archivo_clave: string | null; archivo_nombre: string | null; archivo_mime: string | null }>(
    `SELECT texto, archivo_clave, archivo_nombre, archivo_mime FROM nota_bitacora WHERE id = $1 AND tarea_id = $2`,
    [notaId, tareaId],
  );
  const nota = filas.rows[0];
  if (!nota?.archivo_clave) throw new Error('Esa nota no tiene foto.');
  if (!nota.texto.includes(SIN_CODIGO)) return 'Esa foto ya tiene lectura.';
  const clase = claseDeNota(nota.texto);
  const orden = Number(nota.texto.match(/Hilo\s+(\d+)/i)?.[1] ?? '');
  if (!clase || !orden) throw new Error('Esa foto no está marcada para volver a leerla.');
  const hilo = await conexiones.pg.query<{ id: string }>(
    `SELECT id FROM hilo_atencion WHERE tarea_id = $1 AND orden = $2`,
    [tareaId, orden],
  );
  const hiloId = hilo.rows[0]?.id;
  if (!hiloId) throw new Error('Ese hilo ya no está.');
  const contenido = await new AlmacenCorreo(conexiones).leer(nota.archivo_clave);
  const foto = { nombre: nota.archivo_nombre || 'foto.jpg', mime: nota.archivo_mime || 'image/jpeg', contenido };
  return leerGuardada(conexiones, notaId, hiloId, clase, 'técnico', foto);
}

async function leerGuardada(
  conexiones: Conexiones,
  notaId: string,
  hiloId: string,
  clase: 'chip' | 'contenedor' | 'maquina' | 'modem',
  origen: 'técnico' | 'almacén',
  fotoYa?: FotoRegularizar,
): Promise<string> {
  const foto = fotoYa ?? (await fotoDeNota(conexiones, notaId));
  const orden = await ordenDe(conexiones, hiloId);
  if (clase === 'chip') return aplicarChip(conexiones, notaId, orden, hiloId, origen, foto);
  if (clase === 'modem') return aplicarModem(conexiones, notaId, orden, hiloId, origen, foto);
  return aplicarEquipo(conexiones, notaId, orden, hiloId, clase, foto);
}

async function aplicarEquipo(
  conexiones: Conexiones,
  notaId: string,
  orden: number,
  hiloId: string,
  clase: 'contenedor' | 'maquina',
  foto: FotoRegularizar,
): Promise<string> {
  const equipo = await leerFotoEquipo(foto);
  if (!equipo) return `Guardé la foto del hilo ${orden}. No pude leer un código. Quedó en la cotización para volver a leerla.`;
  const espera = clase === 'contenedor' ? 'contenedor' : 'serie';
  if (equipo.clase !== espera) {
    const visto = equipo.clase === 'contenedor' ? 'contenedor' : 'máquina';
    return `Guardé la foto del hilo ${orden}. Se leyó como ${visto} ${equipo.codigo}. No la apliqué a este campo.`;
  }
  await corregirEquipo(conexiones.pg, hiloId, clase === 'contenedor' ? { contenedor: equipo.codigo } : { maquina: equipo.codigo });
  const nombre = clase === 'contenedor' ? 'contenedor' : 'máquina';
  await completarNota(conexiones, notaId, `Hilo ${orden}. Regularización de ${nombre}. Código ${equipo.codigo}.`);
  return `Guardé la foto. ${nombre} ${equipo.codigo}. Quedó en el hilo ${orden}.`;
}

async function aplicarChip(
  conexiones: Conexiones,
  notaId: string,
  orden: number,
  hiloId: string,
  origen: 'técnico' | 'almacén',
  foto: FotoRegularizar,
): Promise<string> {
  const lectura = await leerFotoChip(conexiones, foto);
  if (!lectura) return `Guardé la foto del hilo ${orden}. El lector no respondió. Quedó en la cotización para volver a leerla.`;
  const chip = chipParaGuardar(lectura.hallados);
  if (!chip) return `Guardé la foto del hilo ${orden}. ${lectura.paraWhatsapp} Quedó para volver a leerla.`;
  await guardarChip(conexiones.pg, hiloId, chip.imei, chip.celular, chip.estado);
  const quien = origen === 'técnico' ? 'El técnico' : 'Almacén';
  const ocupado = chip.estado === 'ocupado' ? ` Está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.` : '';
  await completarNota(conexiones, notaId, `Hilo ${orden}. ${quien} registró el chip.\nIMEI ${chip.imei}. Celular ${chip.celular}.${ocupado}`);
  const aviso = chip.estado === 'ocupado'
    ? `Guardé la foto. IMEI ${chip.imei}. Celular ${chip.celular}. Está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.\nNo se envía a una orden de fabricación con un chip ocupado.`
    : `Guardé la foto. IMEI ${chip.imei}. Celular ${chip.celular}.`;
  return aviso;
}

async function aplicarModem(
  conexiones: Conexiones,
  notaId: string,
  orden: number,
  hiloId: string,
  origen: 'técnico' | 'almacén',
  foto: FotoRegularizar,
): Promise<string> {
  const lectura = await leerEtiquetaModulo(foto);
  if (!lectura.respondio || !lectura.etiqueta?.sn) {
    return `Guardé la foto del hilo ${orden}. No leí el SN del módulo 4G. Quedó en la cotización para volver a leerla.`;
  }
  const serie = lectura.etiqueta.sn;
  const imei = lectura.etiqueta.imei ?? '';
  await guardarModem(conexiones.pg, hiloId, serie, imei);
  const quien = origen === 'técnico' ? 'El técnico' : 'Almacén';
  await completarNota(conexiones, notaId, `Hilo ${orden}. ${quien} registró el módulo 4G SN ${serie}${imei ? `. IMEI ${imei}` : ''}.`);
  return `Guardé la foto. Módulo 4G SN ${serie}${imei ? `. IMEI ${imei}` : ''}. Quedó en el hilo ${orden}.`;
}

function textoPendiente(orden: number, clase: 'chip' | 'contenedor' | 'maquina' | 'modem'): string {
  const nombre = clase === 'maquina' ? 'máquina' : clase === 'modem' ? 'módulo 4G' : clase;
  return `Hilo ${orden}. Regularización de ${nombre}. Foto guardada, ${SIN_CODIGO}.`;
}

function claseDeNota(texto: string): 'chip' | 'contenedor' | 'maquina' | 'modem' | null {
  const marca = texto.match(/Regularización de ([^.]+)/i)?.[1]?.toLowerCase() ?? '';
  if (marca.includes('contenedor')) return 'contenedor';
  if (marca.includes('máquina') || marca.includes('maquina')) return 'maquina';
  if (marca.includes('módulo') || marca.includes('modulo')) return 'modem';
  if (marca.includes('chip')) return 'chip';
  return null;
}

async function ordenDe(conexiones: Conexiones, hiloId: string): Promise<number> {
  const filas = await conexiones.pg.query<{ orden: number }>(`SELECT orden FROM hilo_atencion WHERE id = $1`, [hiloId]);
  const orden = filas.rows[0]?.orden;
  if (!orden) throw new Error('Ese hilo ya no está.');
  return orden;
}

async function fotoDeNota(conexiones: Conexiones, notaId: string): Promise<FotoRegularizar> {
  const filas = await conexiones.pg.query<{ archivo_clave: string | null; archivo_nombre: string | null; archivo_mime: string | null }>(
    `SELECT archivo_clave, archivo_nombre, archivo_mime FROM nota_bitacora WHERE id = $1`,
    [notaId],
  );
  const nota = filas.rows[0];
  if (!nota?.archivo_clave) throw new Error('Esa nota no tiene foto.');
  const contenido = await new AlmacenCorreo(conexiones).leer(nota.archivo_clave);
  return { nombre: nota.archivo_nombre || 'foto.jpg', mime: nota.archivo_mime || 'image/jpeg', contenido };
}

async function completarNota(conexiones: Conexiones, notaId: string, texto: string): Promise<void> {
  await conexiones.pg.query(`UPDATE nota_bitacora SET texto = $2 WHERE id = $1`, [notaId, texto]);
}

async function anotar(conexiones: Conexiones, tareaId: string, autor: AutorRegularizar, texto: string, foto: FotoRegularizar | null, canal: 'web' | 'whatsapp'): Promise<string> {
  const notaId = randomUUID();
  let clave: string | null = null;
  let nombre: string | null = null;
  let mime: string | null = null;
  if (foto) {
    mime = foto.mime.toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
    nombre = foto.nombre.trim().slice(0, 180) || 'foto.jpg';
    clave = `hilos/${tareaId}/${notaId}`;
    await new AlmacenCorreo(conexiones).guardar(clave, foto.contenido, mime);
  }
  await conexiones.pg.query(
    `INSERT INTO nota_bitacora (id, tarea_id, tipo, canal, texto, autor_correo, autor_nombre, archivo_clave, archivo_nombre, archivo_mime)
     VALUES ($1, $2, 'seguimiento', $3, $4, $5, $6, $7, $8, $9)`,
    [notaId, tareaId, canal, texto, autor.correo, autor.nombre, clave, nombre, mime],
  );
  return notaId;
}
