import { spawn } from 'child_process';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export const NOMBRE_PARTIDA = 'sgit-partida.tar.gz';

export type ManifiestoPartida = {
  version: 1;
  tipo: 'partida';
  generadoEn: string;
  correos: {
    desde: string | null;
    hasta: string | null;
    cantidad: number;
    rangos: Array<{ desde: string; hasta: string }>;
  };
  clasificacion: {
    tareasProcesadas: number;
    diccionario: number;
    tarea: number;
    asuntoInterno: number;
    otros: number;
  };
  chips: number;
  modems: number;
};

export function directorioDatos(): string {
  const pedido = process.env.SGIT_DATOS?.trim();
  if (pedido) return path.resolve(pedido);
  const base = process.cwd().endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(process.cwd(), '../..') : process.cwd();
  return path.join(base, 'datos');
}

export function rutaPartida(): string {
  return path.join(directorioDatos(), NOMBRE_PARTIDA);
}

export function esPartida(dato: unknown): dato is ManifiestoPartida {
  if (!dato || typeof dato !== 'object') return false;
  const fila = dato as { version?: number; tipo?: string; correos?: { rangos?: unknown }; clasificacion?: { diccionario?: unknown } };
  return fila.version === 1 && fila.tipo === 'partida' && Array.isArray(fila.correos?.rangos) && typeof fila.clasificacion?.diccionario === 'number';
}

export function textoPartida(manifiesto: ManifiestoPartida, asimilada = false): string {
  const desde = dia(manifiesto.correos.desde);
  const hasta = dia(manifiesto.correos.hasta);
  const clase = manifiesto.clasificacion;
  return [
    asimilada ? 'Partida asimilada.' : 'Partida lista.',
    `Correos del ${desde} al ${hasta}: ${manifiesto.correos.cantidad}.`,
    `Tareas procesadas: ${clase.tareasProcesadas}.`,
    `Diccionario: ${clase.diccionario} términos.`,
    `Clasificación: ${clase.tarea} tarea, ${clase.asuntoInterno} asunto interno, ${clase.otros} otros.`,
    `Chips: ${manifiesto.chips}. M2M: ${manifiesto.modems}.`,
    'La sincronización de correo sigue a partir de ese rango.',
  ].join('\n');
}

export async function carpetaTemporal(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'sgit-partida-'));
}

export async function empaquetar(origen: string, destino: string): Promise<void> {
  const nombres = await readdir(origen);
  if (nombres.length === 0) throw new Error('La partida no tiene archivos.');
  await ejecutar('tar', ['-czf', destino, '-C', origen, ...nombres]);
}

export function desempaquetar(archivo: string, destino: string): Promise<void> {
  return ejecutar('tar', ['-xzf', archivo, '-C', destino]);
}

export async function manifiestoDe(archivo: string): Promise<ManifiestoPartida | null> {
  for (const nombre of ['manifiesto.json', './manifiesto.json']) {
    const texto = await miembro(archivo, nombre);
    if (!texto) continue;
    try {
      const dato = JSON.parse(texto) as unknown;
      if (esPartida(dato)) return dato;
    } catch {
      return null;
    }
  }
  return null;
}

function miembro(archivo: string, nombre: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proceso = spawn('tar', ['-xOzf', archivo, nombre]);
    const trozos: Buffer[] = [];
    proceso.stdout.on('data', (trozo: Buffer) => trozos.push(trozo));
    proceso.stderr.on('data', () => undefined);
    proceso.on('error', reject);
    proceso.on('close', (codigo) => {
      resolve(codigo === 0 ? Buffer.concat(trozos).toString('utf8') : '');
    });
  }).catch(() => '');
}

export async function leerJson<T>(archivo: string): Promise<T> {
  return JSON.parse(await readFile(archivo, 'utf8')) as T;
}

export async function borrarCarpeta(carpeta: string): Promise<void> {
  await rm(carpeta, { recursive: true, force: true });
}

function dia(iso: string | null): string {
  if (!iso) return 'sin fecha';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'sin fecha';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha);
}

function ejecutar(comando: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, args);
    let error = '';
    proceso.stderr.on('data', (trozo: Buffer) => { error += trozo.toString(); });
    proceso.on('error', reject);
    proceso.on('close', (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(error.trim() || `${comando} terminó con ${codigo}`));
    });
  });
}
