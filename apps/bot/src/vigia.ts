import { config } from 'dotenv';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { crearClienteBot } from './api';
import { cerrarNavegadorDeSesion } from './navegador';
import { directorioDeEstado, raizDelRepo, rutaDeSesion } from './rutas';

config({ path: path.resolve(__dirname, '../../../.env') });

const clave = process.env.SESION_SECRETO?.trim() ?? '';
const pedido = (process.env.API_URL?.trim() || 'http://localhost:18003/SGIT').replace(/\/$/, '');
const base = pedido.endsWith('/SGIT') ? pedido : `${pedido}/SGIT`;
if (!clave) {
  console.error('SGIT bot: falta SESION_SECRETO. Este proceso no arranca.');
  process.exit(1);
}

const api = crearClienteBot(base, clave);
const yo = `sgit-bot-${process.pid}`;
const SILENCIO_MS = 120_000;
let hijo: ChildProcess | null = null;
let cortando = false;
let ocupado = false;
let ultimoPulso = Date.now();
let lanzadoEn = 0;

void vigilar();

async function vigilar(): Promise<void> {
  const primero = await api.estadoLider(yo);
  if (primero === 'ocupado') {
    console.error('SGIT bot: ya hay un líder. Este vigía no arranca.');
    process.exit(1);
  }
  if (primero === 'fallo') {
    console.error('SGIT bot: no pude tomar el liderazgo. Reintento cuando el servicio vuelva a arrancar.');
    process.exit(1);
  }
  await anotar('info', 'Vigía en marcha. Si el cliente de WhatsApp se cuelga, este proceso lo cierra y lo vuelve a abrir.');
  const pendiente = await api.pedirReinicio().catch(() => ({ reiniciar: false, olvidar: false }));
  if (pendiente.olvidar) await borrarSesion();
  lanzar();
  setInterval(() => {
    void ciclo();
  }, 5_000);
}

async function ciclo(): Promise<void> {
  if (ocupado) return;
  ocupado = true;
  try {
    const lider = await api.estadoLider(yo);
    if (lider === 'fallo') {
      await anotar('fallo', 'No pude renovar el liderazgo. El cliente sigue abierto y reintento en unos segundos.');
      return;
    }
    if (lider === 'ocupado') {
      await anotar('fallo', 'Otro proceso tomó el bot. Cierro este vigía.');
      await matar();
      process.exit(1);
    }
    const pedido = await api.pedirReinicio().catch(() => ({ reiniciar: false, olvidar: false }));
    const silencio = hijo !== null && Date.now() - ultimoPulso > SILENCIO_MS;
    if (pedido.olvidar) {
      await anotar('info', 'Cierro el cliente, borro la sesión de este equipo y pido otro código.');
      await api.publicar('desconectado').catch(() => undefined);
      await matar();
      await borrarSesion();
      lanzar();
      return;
    }
    if (pedido.reiniciar || silencio) {
      await anotar('info', silencio
        ? 'El cliente dejó de responder. Lo cierro y abro otra vez la misma sesión.'
        : 'Reinicio pedido. Cierro el cliente y abro otra vez la misma sesión.');
      await api.publicar('desconectado').catch(() => undefined);
      await matar();
      lanzar();
    }
  } finally {
    ocupado = false;
  }
}

function lanzar(): void {
  const comando = comandoTsx();
  lanzadoEn = Date.now();
  ultimoPulso = Date.now();
  const proceso = spawn(comando.bin, comando.args, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SGIT_SIN_LIDER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hijo = proceso;
  const marcar = (buf: Buffer) => {
    const texto = buf.toString();
    process.stdout.write(texto);
    if (texto.includes('SGIT bot: pulso')) ultimoPulso = Date.now();
  };
  proceso.stdout?.on('data', marcar);
  proceso.stderr?.on('data', (buf: Buffer) => {
    process.stderr.write(buf);
  });
  proceso.on('error', (error: Error) => {
    void anotar('fallo', `No pude arrancar el cliente de WhatsApp. ${error.message}`);
  });
  proceso.on('exit', () => {
    if (hijo !== proceso) return;
    hijo = null;
    if (cortando) return;
    ultimoPulso = Date.now();
    const pronto = Date.now() - lanzadoEn < 5_000;
    void anotar('fallo', pronto
      ? 'El cliente de WhatsApp se cerró al abrir. Espero unos segundos y lo vuelvo a intentar.'
      : 'El cliente de WhatsApp se cerró. Lo vuelvo a abrir.');
    setTimeout(() => {
      if (!hijo && !cortando) lanzar();
    }, pronto ? 10_000 : 2_000);
  });
}

async function matar(): Promise<void> {
  cortando = true;
  const actual = hijo;
  hijo = null;
  if (actual) await esperarCierre(actual);
  await cerrarNavegadorDeSesion();
  cortando = false;
  ultimoPulso = Date.now();
}

function esperarCierre(actual: ChildProcess): Promise<void> {
  return new Promise((resolver) => {
    if (actual.exitCode !== null || actual.signalCode !== null) {
      resolver();
      return;
    }
    const timer = setTimeout(() => {
      try {
        actual.kill('SIGKILL');
      } catch {
        // Ya no está.
      }
    }, 4_000);
    actual.once('exit', () => {
      clearTimeout(timer);
      resolver();
    });
    try {
      actual.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolver();
    }
  });
}

async function borrarSesion(): Promise<void> {
  await rm(path.join(rutaDeSesion(), 'session-sgit-lab'), { recursive: true, force: true });
  await rm(path.join(directorioDeEstado(), 'qr.png'), { force: true });
  await anotar('info', 'Borré la sesión guardada. El código nuevo aparece cuando WhatsApp lo publique.');
}

function comandoTsx(): { bin: string; args: string[] } {
  const script = path.resolve(__dirname, 'main.ts');
  const candidatos = [
    path.resolve(raizDelRepo(), 'node_modules/tsx/dist/cli.mjs'),
    path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs'),
  ];
  const cli = candidatos.find((ruta) => existsSync(ruta));
  if (cli) return { bin: process.execPath, args: [cli, script] };
  return { bin: process.execPath, args: [script] };
}

async function anotar(nivel: 'info' | 'fallo', texto: string): Promise<void> {
  if (nivel === 'fallo') console.error(`SGIT bot: ${texto}`);
  else console.log(`SGIT bot: ${texto}`);
  await api.bitacora(nivel, texto).catch(() => undefined);
}

process.on('SIGTERM', () => {
  void apagar();
});
process.on('SIGINT', () => {
  void apagar();
});

async function apagar(): Promise<void> {
  await matar();
  await api.soltar(yo).catch(() => undefined);
  process.exit(0);
}
