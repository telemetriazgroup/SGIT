import { randomUUID } from 'crypto';
import { AlmacenCorreo } from '../buzon/almacen';
import type { Conexiones } from '../conexiones';
import { cierreFabricacion, fragmentosDeTexto, identificarChips, imeisDeTexto, textoChip, type ChipHallado } from '../bot/lectura-chip';
import { asumirZgru, claseDe, proponerImagen, textoDeImagen, type ClaseCodigo } from '../bot/proceso-imagen';
import { corregirEquipo, guardarChip, guardarModem, type HiloAtencion } from './hilos';

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

async function anotar(conexiones: Conexiones, tareaId: string, autor: AutorRegularizar, texto: string, foto: FotoRegularizar | null, canal: 'web' | 'whatsapp'): Promise<void> {
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
}
