import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { puedeValidarGenset } from '../src/identidad/permisos';
import { interpretarD00 } from '../src/genset/interpretar';
import {
  camposDe,
  conexionDe,
  esTramaNueva,
  firmaDeTrama,
  leerGps,
  leerLista,
  leerTrama,
  sinSecretos,
} from '../src/genset/lectura';

const gps = 'GPRMC,145125.00,A,1147.05934,S,07709.31102,W,20.875,133.25,101126,,,A*5C';

const trama = {
  data: {
    i: '860389054928011',
    d00: 'F7010000,F7010000,118A',
    d01: null,
    gps,
    d09: '1B020400',
    estado: 1,
    fecha: '2026-11-10T09:46:29.906000',
    received_at: '2026-11-10 09:46:29.906189+00:00',
    secured: false,
    tipo_dispositivo: 'Generador',
    api_key_hash: 'no-guardar',
  },
  code: 200,
  message: 'Último dato recuperado.',
};

test('la lista de generadores conserva los IMEI y deja fuera la clave', () => {
  const ruta = [path.resolve(process.cwd(), '../../lista _genset.json'), path.resolve(process.cwd(), 'lista _genset.json')].find((item) => existsSync(item));
  assert.ok(ruta, 'No está el ejemplo de la lista GENSET.');
  const archivo = JSON.parse(readFileSync(ruta, 'utf8')) as {
    dispositivos: Array<Record<string, unknown>>;
  };
  archivo.dispositivos[0] = { ...archivo.dispositivos[0], api_key_hash: 'no-guardar' };
  const leida = leerLista(archivo);
  assert.ok(!('error' in leida));
  if ('error' in leida) return;
  assert.equal(leida.dispositivos.length, 26);
  assert.equal(leida.coleccion, 'G_dispositivos_11_2026');
  assert.equal(leida.dispositivos[0]?.imei, '860389054928011');
  assert.equal(leida.dispositivos[0]?.ultimo_dato, '2026-11-10T09:50:34.349Z');
  assert.equal(JSON.stringify(leida).includes('no-guardar'), false);
});

test('un IMEI mal formado no entra a la lista', () => {
  const leida = leerLista({ dispositivos: [{ imei: 'abc', estado: 1 }, { imei: '860389054928011', estado: 1, tipo: 'Generador' }] });
  assert.ok(!('error' in leida));
  if ('error' in leida) return;
  assert.deepEqual(leida.dispositivos.map((equipo) => equipo.imei), ['860389054928011']);
});

test('la última trama se lee y se rechaza si el IMEI no coincide', () => {
  const leida = leerTrama(trama, '860389054928011');
  assert.ok(!('error' in leida));
  if ('error' in leida) return;
  assert.equal(leida.mensaje, 'Último dato recuperado.');
  const otro = leerTrama(trama, '860389054928012');
  const vacia = leerTrama({ code: 404, message: 'Sin dato.' }, '860389054928011');
  assert.equal('error' in otro ? otro.error : '', 'La trama recibida pertenece a otro IMEI.');
  assert.equal('error' in vacia ? vacia.error : '', 'Sin dato.');
});

test('solo se guarda la trama cuando el contenido cambia', () => {
  const limpia = sinSecretos(trama.data);
  const firma = firmaDeTrama(limpia);
  assert.equal(JSON.stringify(limpia).includes('no-guardar'), false);
  assert.equal(firma, firmaDeTrama({ ...limpia, d09: limpia.d09, estado: 1 }));
  assert.equal(esTramaNueva(null, firma), true);
  assert.equal(esTramaNueva(firma, firma), false);
  assert.equal(esTramaNueva(firma, firmaDeTrama({ ...limpia, d00: 'otra' })), true);
  assert.equal(firmaDeTrama({ b: 1, a: 2 }), firmaDeTrama({ a: 2, b: 1 }));
});

test('el GPS de la trama pasa a grados, velocidad y hora', () => {
  const leido = leerGps(gps);
  assert.ok(leido);
  assert.equal(leido.valido, true);
  assert.ok(Math.abs((leido.latitud ?? 0) - -(11 + 47.05934 / 60)) < 1e-6);
  assert.ok(Math.abs((leido.longitud ?? 0) - -(77 + 9.31102 / 60)) < 1e-6);
  assert.equal(leido.velocidad_kmh, 38.7);
  assert.equal(leido.rumbo, 133.25);
  assert.equal(leido.cuando, '2026-11-10T14:51:25.000Z');
  assert.match(leido.texto, /Posición válida/);
  assert.equal(leerGps(null), null);
  assert.equal(leerGps('GPRMC,145125.00,V,1147.05934,S,07709.31102,W,0,0,101126,,,A')?.valido, false);
});

test('la frescura marca en línea, reportó hoy o sin reporte', () => {
  const ahora = new Date('2026-11-10T15:00:00.000Z');
  assert.equal(conexionDe('2026-11-10T14:30:00.000Z', ahora), 'en_linea');
  assert.equal(conexionDe('2026-11-10T14:30:00.001Z', new Date('2026-11-10T15:00:00.001Z')), 'en_linea');
  assert.equal(conexionDe('2026-11-10T14:29:59.000Z', ahora), 'reciente');
  assert.equal(conexionDe('2026-11-09T15:00:00.000Z', ahora), 'reciente');
  assert.equal(conexionDe('2026-11-09T14:59:59.000Z', ahora), 'sin_reporte');
  assert.equal(conexionDe(null, ahora), 'sin_reporte');
  const fechas = camposDe(trama.data).find((campo) => campo.nombre === 'fecha');
  assert.equal(fechas?.valor, '2026-11-10T09:46:29.906Z');
});

test('d00 se interpreta con horómetros, factores y el centinela de combustible', () => {
  const corta = interpretarD00('E3020000,37060000,1108');
  assert.equal(corta.medidas[0]?.valor, 739);
  assert.equal(corta.medidas[0]?.texto, '739 h');
  assert.equal(corta.medidas[1]?.valor, 1591);
  assert.equal(corta.medidas[2]?.valor, 436);
  assert.equal(corta.medidas[2]?.texto, '436 V');
  assert.equal(corta.corta, true);
  assert.equal(corta.medidas[3]?.valor, null);
  assert.equal(corta.medidas[3]?.calidad, 1);
  assert.equal(interpretarD00('ZZ')?.medidas[0]?.aviso, 'No se pudo leer.');

  const muestra = interpretarD00('F7010000,F7010000,118A,56F,2C3,25F,AD,114E,0,0,4,0,0,3,28F,11BC,25F,8B,2C2,71A');
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Tr_Timer1')?.valor, 503);
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Rt_Battery')?.valor, 13.91);
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Rt_Battery')?.texto, '13,91 V');
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Dv_Fuel')?.valor, 65.5);
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Dv_Battery')?.valor, 13.9);
  assert.equal(muestra.medidas.find((medida) => medida.nombre === 'Dv_rpm')?.valor, 1818);
  assert.equal(muestra.flag32, false);

  const centinela = Array(20).fill('1');
  centinela[6] = '0';
  centinela[14] = 'FFFF';
  const sinSensor = interpretarD00(centinela.join(','));
  assert.equal(sinSensor.medidas[14]?.texto, 'No programado');
  assert.equal(sinSensor.medidas[14]?.calidad, 2);
  assert.equal(sinSensor.flag32, null);

  const cero = Array(20).fill('A');
  cero[6] = '0';
  cero[14] = '5EE';
  assert.equal(interpretarD00(cero.join(',')).flag32, null);

  const distinto = Array(20).fill('A');
  distinto[6] = '64';
  distinto[14] = '28F';
  const cruce = interpretarD00(distinto.join(','));
  assert.equal(cruce.flag32, true);
  assert.match(cruce.avisos.join(' '), /no coinciden/);
});

test('técnico, administrador, superusuario y operador validan generadores', () => {
  assert.equal(puedeValidarGenset('tecnico'), true);
  assert.equal(puedeValidarGenset('administrador'), true);
  assert.equal(puedeValidarGenset('superusuario'), true);
  assert.equal(puedeValidarGenset('operador'), true);
  assert.equal(puedeValidarGenset('despacho'), false);
  assert.equal(puedeValidarGenset('almacen'), false);
});
