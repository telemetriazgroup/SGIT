import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'zlib';
import { test } from 'node:test';
import { filasDeExcel } from '../src/chips/excel';
import { armarOrden, marcaDeOrden, serieCoincide, serieChipDe, seriesDe } from '../src/chips/orden';
import { clasificar } from '../src/chips/inventario';
import { normalizarCelular, normalizarImei } from '../src/chips/normalizar';

test('el excel con título usa la fila de columnas y conserva el imei completo', () => {
  const hoja = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet>
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>CHIPS ALAI</t></is></c></row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>id</t></is></c>
      <c r="B2" t="s"><v>0</v></c>
      <c r="C2" t="inlineStr"><is><t>marca</t></is></c>
      <c r="D2" t="inlineStr"><is><t>imei</t></is></c>
      <c r="E2" t="inlineStr"><is><t>celular</t></is></c>
    </row>
    <row r="3">
      <c r="A3"><v>1</v></c>
      <c r="B3" t="s"><v>1</v></c>
      <c r="C3" t="inlineStr"><is><t>ALAI</t></is></c>
      <c r="D3" t="inlineStr"><is><t>8951029071100014004</t></is></c>
      <c r="E3" t="inlineStr"><is><t>919865346</t></is></c>
    </row>
    <row r="4">
      <c r="B4" t="s"><v>1</v></c>
      <c r="C4" t="inlineStr"><is><t>ALAI</t></is></c>
      <c r="D4" t="inlineStr"><is><t>8.951029071100014E+18</t></is></c>
      <c r="E4" t="inlineStr"><is><t>919867926</t></is></c>
    </row>
  </sheetData>
</worksheet>`;
  const textos = `<?xml version="1.0"?><sst><si><t>producto</t></si><si><t>CHIP MULTIBANDA ALAI</t></si></sst>`;
  const filas = filasDeExcel(xlsx({ 'xl/sharedStrings.xml': textos, 'xl/worksheets/sheet1.xml': hoja }));
  assert.equal(filas.length, 2);
  assert.equal(filas[0].fila, 3);
  assert.equal(filas[0].producto, 'CHIP MULTIBANDA ALAI');
  assert.equal(filas[0].imei, '8951029071100014004');
  assert.equal(normalizarImei(filas[0].imei), '8951029071100014004');
  assert.equal(normalizarImei(filas[1].imei), null);
  assert.equal(normalizarCelular('51 919 865 346'), '919865346');
  assert.equal(normalizarCelular('9.19865346E8'), '919865346');
  assert.equal(normalizarCelular('9.1986285E8'), '919862850');
});

test('un chip que ya no está a la mano queda ocupado en la telemetría fabricada', () => {
  const lectura = clasificar(
    [
      { id: 17190, serie: '919865346', producto: '[INDND4855] CHIP', cantidad: 0 },
      { id: 15714, serie: '919865346', producto: '[GPNDND0002] CT TRACK REEFER (HARDWARE)', cantidad: 1 },
    ],
    [
      { loteId: 17190, fecha: '2026-03-31 12:41:57', referencia: 'ZGROU/MO/01684', producto: '[INDND4855] CHIP', desde: 'ZGROU/Existencias', hacia: 'Production', cantidad: 1 },
      { loteId: 15714, fecha: '2026-03-31 12:41:57', referencia: 'ZGROU/MO/01684', producto: '[GPNDND0002] CT TRACK REEFER (HARDWARE)', desde: 'Production', hacia: 'ZGROU/Existencias', cantidad: 1 },
    ],
  );
  assert.equal(lectura.estado, 'ocupado');
  assert.match(lectura.telemetria, /CT TRACK REEFER/);
  assert.equal(lectura.orden, 'ZGROU/MO/01684');
  assert.equal(lectura.ocupadoEn, '2026-03-31 12:41:57');
  assert.equal(clasificar([{ id: 1, serie: '919865346', producto: '[INDND4855] CHIP', cantidad: 1 }], []).estado, 'disponible');
});

test('un csv con las mismas columnas también entra', () => {
  const csv = 'producto,marca,imei,celular\nCHIP MULTIBANDA ALAI,ALAI,8951029071100014012,919867926\n';
  const filas = filasDeExcel(Buffer.from(csv));
  assert.equal(filas[0].celular, '919867926');
  assert.equal(filas[0].fila, 2);
});

test('la orden de fabricación guarda el producto, el chip consumido y la nota con foto', () => {
  const orden = armarOrden(
    {
      nombre: 'ZGROU/MO/01684',
      estado: 'done',
      producto: '[GPNDND0002] CT TRACK REEFER (HARDWARE)',
      cantidad: 1,
      produciendo: 1,
      inicio: '2026-03-31 12:41:27',
      fin: '2026-03-31 12:41:58',
      responsable: 'Eusebio Avellaneda',
      lista: '[GPNDND0002] CT TRACK REEFER (HARDWARE)',
      serie: '919865346',
    },
    [{ producto: '[INDND4855] CHIP', porConsumir: 1, consumido: 1, unidad: 'Unidad', desde: 'ZGROU/Existencias', serie: '919865346' }],
    [{ fecha: '2026-03-31 12:43:40', autor: 'Eusebio Avellaneda', texto: '<p>IMEI:8951029071100014004</p>', imagenes: [{ id: 'a', nombre: 'imagen.png', mime: 'image/png' }] }],
  );
  assert.equal(orden.estado, 'done');
  assert.equal(orden.pasos.at(-1), 'done');
  assert.equal(orden.componentes[0].serie, '919865346');
  assert.match(orden.notas[0].texto, /8951029071100014004/);
  assert.equal(orden.notas[0].imagenes[0].nombre, 'imagen.png');
  assert.equal(orden.lotesPropios, true);
});

test('el módem de una orden conserva su serie y no hereda la del chip', () => {
  const nombres = new Map<number, string>([
    [10, '919890232'],
    [11, '00501026082100008811'],
  ]);
  assert.equal(seriesDe([11], nombres), '00501026082100008811');
  assert.equal(seriesDe([10], nombres), '919890232');
  assert.equal(seriesDe([], nombres), '');
});

test('asimilar una orden exige el mismo número de chip', () => {
  const componentes = [{ producto: '[INDND4855] CHIP', serie: '919867926' }, { producto: 'USR-G786', serie: '00501026082100008811' }];
  assert.equal(serieChipDe(componentes), '919867926');
  assert.equal(serieCoincide('919867926', '919867926', '8951029071100014012'), true);
  assert.equal(serieCoincide('919865346', '919867926', '8951029071100014012'), false);
  assert.equal(serieCoincide('', '919867926', ''), false);
  assert.equal(marcaDeOrden('2026-10-21 12:00:00', ['2026-10-20 10:00:00', '2026-10-21 11:00:00']), '2026-10-21 12:00:00|2026-10-21 11:00:00');
});

function xlsx(archivos: Record<string, string>): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = Buffer.from(texto);
    const nombreBytes = Buffer.from(nombre);
    const comprimido = deflateRawSync(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(datos), 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);
    const pieza = Buffer.concat([local, nombreBytes, comprimido]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(datos), 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(Buffer.concat([central, nombreBytes]));
    locales.push(pieza);
    offset += pieza.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(centrales.length, 8);
  fin.writeUInt16LE(centrales.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, directorio, fin]);
}
