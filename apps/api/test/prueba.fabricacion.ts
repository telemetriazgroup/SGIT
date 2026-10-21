import assert from 'node:assert/strict';
import test from 'node:test';
import { EJECUTOR_DEFECTO, borradorLibre, conPedidoInicial, ejecutorDe, esLimiteDeOrdenes, huellaConsumidos, nombreDeProducto, notaInsumos, notasRegistro, textoMateriales, type MaterialPedido } from '../src/fabricacion/reglas';

const chip: MaterialPedido = { moveId: 1, productoId: 10244, codigo: 'INDND4855', nombre: '[INDND4855] CHIP', cantidad: 1, unidad: 'Unidad', pedido: false };
const modem: MaterialPedido = { moveId: 2, productoId: 11531, codigo: 'INDND7509', nombre: '[INDND7509] USR-G786-G', cantidad: 1, unidad: 'Unidad', pedido: false };
const cable: MaterialPedido = { moveId: 3, productoId: 9, codigo: 'INDND0105', nombre: '[INDND0105] CABLE', cantidad: 2, unidad: 'm', pedido: false };

test('el ejecutor sale del nombre del técnico', () => {
  assert.equal(ejecutorDe('Marcelo Perea'), 'MARCELO PEREA LUIS PABLO');
  assert.equal(ejecutorDe('edwin'), 'COBEÑAS RAMOS EDWIN JHOEL');
  assert.equal(ejecutorDe('Vásquez'), 'VASQUEZ VASQUEZ JOSEP RODRIGO');
  assert.equal(ejecutorDe('Eusebio Avellaneda'), EJECUTOR_DEFECTO);
  assert.equal(ejecutorDe('Administrador'), EJECUTOR_DEFECTO);
});

test('el límite de 80 órdenes se reconoce en el texto de Odoo', () => {
  assert.equal(esLimiteDeOrdenes('Operación no válida. No se pueden tener más órdenes de fabricación. Se ha alcanzado el límite máximo de 80 órdenes activas.'), true);
  assert.equal(esLimiteDeOrdenes('Odoo no tiene la cotización.'), false);
});

test('un borrador libre no tiene cotización ni serie', () => {
  assert.equal(borradorLibre({ cotizacion: false, imei: '', gsm: ' ', lotes: 0 }), true);
  assert.equal(borradorLibre({ cotizacion: true, imei: '', gsm: '', lotes: 0 }), false);
  assert.equal(borradorLibre({ cotizacion: false, imei: '8951', gsm: '', lotes: 0 }), false);
  assert.equal(borradorLibre({ cotizacion: false, imei: '', gsm: '', lotes: 1 }), false);
});

test('el chip y el módem vienen marcados y el resto no', () => {
  const pedidos = conPedidoInicial([chip, modem, cable]);
  assert.deepEqual(pedidos.map((item) => item.pedido), [true, true, false]);
});

test('el nombre del insumo no se queda en el código', () => {
  assert.equal(nombreDeProducto('PILA 2A', 'INDND3282'), 'PILA 2A');
  assert.equal(nombreDeProducto('[INDND3282] INDND3282', 'INDND3282'), '');
  assert.equal(nombreDeProducto('INDND4855\tCHIP', 'INDND4855'), 'CHIP');
  assert.equal(nombreDeProducto('[INDND1008] INDND1008\tCINTILLO DE AMARRE 350MM', 'INDND1008'), 'CINTILLO DE AMARRE 350MM');
  assert.equal(nombreDeProducto('TERMINAL TUBULAR SOBREMOLDEADO DOBLE ROJO 1.5MM 16AWG', 'INDND7166'), 'TERMINAL TUBULAR SOBREMOLDEADO DOBLE ROJO 1.5MM 16AWG');
});

test('la nota de insumos pone el equipo antes que la cotización', () => {
  const texto = notaInsumos({
    contenedor: 'ZGRU5333709',
    maquina: 'E0GM015342',
    chip: '919867926',
    imei: '8951029071100014012',
    modem: '',
    cotizacion: ['Cotización 10020262172', 'Cliente HIPERMERCADOS TOTTUS S.A'],
    tecnico: 'MARCELO PEREA LUIS PABLO',
    pedidos: ['INDND4855 CHIP: 1 Unidad'],
  });
  const notas = notasRegistro({
    contenedor: 'ZGRU5333709',
    maquina: 'E0GM015342',
    chip: '919867926',
    imei: '8951029071100014012',
    modem: '',
    cotizacion: ['Cotización 10020262172', 'Cliente HIPERMERCADOS TOTTUS S.A'],
    tecnico: 'MARCELO PEREA LUIS PABLO',
    pedidos: ['INDND4855 CHIP: 1 Unidad'],
  });
  assert.equal(notas.equipo, 'Contenedor ZGRU5333709\nMáquina E0GM015342\nChip 919867926\nIMEI 8951029071100014012');
  assert.equal(notas.cotizacion, 'Cotización 10020262172\nCliente HIPERMERCADOS TOTTUS S.A\nTécnico MARCELO PEREA LUIS PABLO');
  assert.doesNotMatch(`${notas.equipo}\n${notas.cotizacion}`, /Fuera de la lista|Se piden/);
  assert.match(texto, /Se piden:\nINDND4855 CHIP: 1 Unidad/);
});

test('la huella del reporte cambia solo si cambian los insumos consumidos', () => {
  const marcados = conPedidoInicial([chip, modem, cable]);
  const otraVez = conPedidoInicial([chip, modem, cable]);
  assert.equal(huellaConsumidos(marcados), huellaConsumidos(otraVez));
  const sinModem = marcados.map((item) => item.codigo === 'INDND7509' ? { ...item, pedido: false } : item);
  assert.notEqual(huellaConsumidos(marcados), huellaConsumidos(sinModem));
  assert.doesNotMatch(huellaConsumidos(marcados), /INDND0105/);
});

test('el resumen nombra el chip detectado y deja la serie del módem a Odoo', () => {
  const texto = textoMateriales(conPedidoInicial([chip, modem, cable]), '919890232', '');
  assert.match(texto, /INDND4855/);
  assert.match(texto, /919890232/);
  assert.match(texto, /Odoo elige la serie/);
  assert.doesNotMatch(texto, /INDND0105/);
});
