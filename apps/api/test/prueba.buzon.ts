import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'path';
import { config } from 'dotenv';
import type { ClienteGmail, MensajeDescargado } from '../src/buzon/cliente-gmail';
import { INTERVALO_SYNC_MS } from '../src/buzon/cliente-gmail';
import { usarClienteGmailDePrueba } from '../src/buzon/registro-cliente';

config({ path: path.resolve(__dirname, '../../../.env') });
process.env.GMAIL_DOBLE = '1';
process.env.INICIAR_SYNC = 'false';

class DobleGmail implements ClienteGmail {
  marca = 'h-inicial';
  cabeza = 'h-inicial';
  paginas: string[][] = [];
  mensajes = new Map<string, MensajeDescargado>();
  bytes = new Map<string, Buffer>();
  fallarObtener = new Set<string>();
  fallarAdjunto = new Set<string>();
  novedades: string[] = [];
  esperaListar: Promise<void> = Promise.resolve();
  listados = 0;
  obtenidos = 0;

  perfil(): Promise<{ historyId: string; correo: string }> {
    return Promise.resolve({ historyId: this.marca, correo: 'telemetria@zgroup.com.pe' });
  }

  async listar(_consulta: string, pageToken?: string) {
    this.listados += 1;
    await this.esperaListar;
    const indice = pageToken ? Number(pageToken) : 0;
    const ids = this.paginas[indice] ?? [];
    return { ids, nextPageToken: indice + 1 < this.paginas.length ? String(indice + 1) : undefined };
  }

  historial(): Promise<{ ids: string[]; historyId: string }> {
    return Promise.resolve({ ids: [...this.novedades], historyId: this.cabeza });
  }

  obtener(id: string): Promise<MensajeDescargado> {
    this.obtenidos += 1;
    if (this.fallarObtener.has(id)) return Promise.reject(new Error('corte de lote'));
    const mensaje = this.mensajes.get(id);
    if (!mensaje) return Promise.reject(new Error(`no está ${id}`));
    return Promise.resolve(mensaje);
  }

  adjunto(_mensajeId: string, attachmentId: string): Promise<Buffer> {
    if (this.fallarAdjunto.has(attachmentId)) return Promise.reject(new Error('adjunto caído'));
    const bytes = this.bytes.get(attachmentId);
    if (!bytes) return Promise.reject(new Error('sin bytes'));
    return Promise.resolve(bytes);
  }

  poner(id: string, extra: Partial<MensajeDescargado> = {}): void {
    this.mensajes.set(id, {
      id,
      threadId: `hilo-${id}`,
      de: 'Olinda Lopez <comercial4@zgroup.com.pe>',
      para: 'telemetria@zgroup.com.pe',
      cc: '',
      fecha: '2026-09-12T15:00:00.000Z',
      asunto: `ASIGNAR Y DESPACHAR // COT 10020263623 // ${id}`,
      html: '<p>hola</p>',
      texto: 'hola',
      etiquetas: [],
      adjuntos: [],
      ...extra,
    });
  }
}

const doble = new DobleGmail();
usarClienteGmailDePrueba(doble);

let base = '';
let token = '';
let cerrar: () => Promise<void> = async () => undefined;
let servicio: {
  importarRango(desde: Date, hasta: Date): Promise<unknown>;
  sincronizarReciente(): Promise<void>;
  contarMensajes(): Promise<number>;
  leerHistoryPublico(): Promise<string | null>;
  detalle(id: string): Promise<{ replica: string; htmlSeguro: string; adjuntos: Array<{ id: string; nombre: string }> } | null>;
  listarMensajes(pagina?: number, tamano?: number, busqueda?: string): Promise<{
    mensajes: Array<{ id: string; asunto: string }>;
    total: number;
  }>;
};
let sql: { query(texto: string, params?: unknown[]): Promise<unknown> };

const desde = new Date('2026-09-01T00:00:00-05:00');
const hasta = new Date('2026-09-30T23:59:59-05:00');

before(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { BuzonService } = await import('../src/buzon/buzon.service');
  const { Conexiones } = await import('../src/conexiones');
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const direccion = app.getHttpServer().address();
  if (!direccion || typeof direccion === 'string') throw new Error('sin puerto');
  base = `http://127.0.0.1:${direccion.port}`;
  servicio = app.get(BuzonService);
  sql = app.get(Conexiones).pg;
  cerrar = () => app.close();

  const ingreso = await fetch(`${base}/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      correo: process.env.SEED_OPERATOR_CORREO,
      contrasena: process.env.SEED_OPERATOR_PASSWORD,
    }),
  });
  const cuerpo = (await ingreso.json()) as { token: string };
  token = cuerpo.token;
});

after(async () => {
  await cerrar();
  usarClienteGmailDePrueba(null);
});

test('el ciclo reciente es de 3 minutos', () => {
  assert.equal(INTERVALO_SYNC_MS, 3 * 60 * 1000);
});

test('un rango de varias páginas entra una sola vez', async () => {
  await limpiar();
  doble.paginas = [
    ['a', 'b'],
    ['c'],
  ];
  doble.poner('a');
  doble.poner('b');
  doble.poner('c');
  await servicio.importarRango(desde, hasta);
  const listados = doble.listados;
  const obtenidos = doble.obtenidos;
  doble.poner('a', { asunto: 'CAMBIADO EN GMAIL' });
  const segunda = (await servicio.importarRango(desde, hasta)) as { detalle: string; nuevos: number };
  assert.equal(await servicio.contarMensajes(), 3);
  assert.equal(await servicio.leerHistoryPublico(), 'h-inicial');
  assert.equal(doble.listados, listados);
  assert.equal(doble.obtenidos, obtenidos);
  assert.equal(segunda.nuevos, 0);
  assert.match(segunda.detalle, /No se volvieron a descargar/);
  const lista = await servicio.listarMensajes();
  const guardado = lista.mensajes.find((mensaje) => mensaje.id);
  assert.ok(guardado);
  const detalle = await servicio.detalle(lista.mensajes[0].id);
  assert.equal(detalle?.replica, 'completo');
  const asuntos = await sql.query('SELECT asunto FROM mensaje_correo');
  const filas = (asuntos as { rows: Array<{ asunto: string }> }).rows;
  assert.equal(filas.some((fila) => fila.asunto.includes('CAMBIADO')), false);
});

test('si el lote se corta, el historyId no avanza y el reintento completa', async () => {
  await limpiar();
  doble.paginas = [['a'], ['b']];
  doble.poner('a');
  doble.poner('b');
  doble.fallarObtener.add('b');
  await assert.rejects(() => servicio.importarRango(desde, hasta));
  assert.equal(await servicio.leerHistoryPublico(), null);
  assert.equal(await servicio.contarMensajes(), 1);
  doble.fallarObtener.delete('b');
  await servicio.importarRango(desde, hasta);
  assert.equal(await servicio.contarMensajes(), 2);
  assert.equal(await servicio.leerHistoryPublico(), 'h-inicial');
});

test('la imagen inline se ve y el adjunto se baja solo con sesión', async () => {
  await limpiar();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  doble.bytes.set('att-img', png);
  doble.bytes.set('att-pdf', Buffer.from('pdf'));
  doble.fallarAdjunto.add('att-pdf');
  doble.paginas = [['correo']];
  doble.poner('correo', {
    html: '<p>foto</p><img src="cid:foto1"><script>alert(1)</script>',
    adjuntos: [
      { attachmentId: 'att-img', nombre: 'foto.png', mime: 'image/png', tamano: png.length, contentId: 'foto1', inline: true },
      { attachmentId: 'att-pdf', nombre: 'guia.pdf', mime: 'application/pdf', tamano: 3, contentId: null, inline: false },
    ],
  });
  await servicio.importarRango(desde, hasta);
  const lista = await servicio.listarMensajes();
  const detalle = await servicio.detalle(lista.mensajes[0].id);
  assert.ok(detalle);
  assert.equal(detalle.replica, 'incompleto');
  assert.match(detalle.htmlSeguro, /\/buzon\/adjuntos\//);
  assert.doesNotMatch(detalle.htmlSeguro, /<script/);
  const imagen = detalle.adjuntos.find((adjunto) => adjunto.nombre === 'foto.png');
  assert.ok(imagen);

  const sinSesion = await fetch(`${base}/buzon/adjuntos/${imagen.id}`);
  assert.equal(sinSesion.status, 401);

  const conSesion = await fetch(`${base}/buzon/adjuntos/${imagen.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(conSesion.status, 200);
  const bytes = Buffer.from(await conSesion.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('hex'), '89504e47');

  doble.fallarAdjunto.delete('att-pdf');
  await servicio.sincronizarReciente();
  const despues = await servicio.detalle(lista.mensajes[0].id);
  assert.equal(despues?.replica, 'completo');
});

test('lo reciente no espera al histórico', async () => {
  await limpiar();
  let soltar: () => void = () => undefined;
  doble.esperaListar = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  doble.paginas = [['lento']];
  doble.poner('lento');
  doble.poner('nuevo', { asunto: 'llegó ahora' });
  doble.novedades = ['nuevo'];
  doble.cabeza = 'h-siguiente';
  await sql.query(
    `INSERT INTO buzon (id, correo, history_id, estado) VALUES (gen_random_uuid(), 'telemetria@zgroup.com.pe', 'h-inicial', 'conectado')`,
  );

  const historico = servicio.importarRango(desde, hasta);
  await servicio.sincronizarReciente();
  const mensajes = await servicio.listarMensajes();
  assert.equal(mensajes.mensajes.length, 1);
  soltar();
  await historico;
  assert.equal(await servicio.contarMensajes(), 2);
  assert.equal(await servicio.leerHistoryPublico(), 'h-siguiente');
});

async function limpiar(): Promise<void> {
  await sql.query('DELETE FROM adjunto_correo');
  await sql.query('DELETE FROM mensaje_correo');
  await sql.query('DELETE FROM rango_correo');
  await sql.query('DELETE FROM buzon');
  doble.paginas = [];
  doble.mensajes.clear();
  doble.bytes.clear();
  doble.fallarObtener.clear();
  doble.fallarAdjunto.clear();
  doble.novedades = [];
  doble.cabeza = 'h-inicial';
  doble.esperaListar = Promise.resolve();
  doble.listados = 0;
  doble.obtenidos = 0;
}
