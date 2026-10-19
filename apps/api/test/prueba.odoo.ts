import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leerConfiguracion } from '../src/configuracion';
import {
  armarTarea,
  armarVenta,
  cambiosDe,
  diferenciasDe,
  fechasDe,
  cotsDe,
  dominioO,
  elegirServicio,
  entregaDeLineas,
  numerosDe,
  resolverBusqueda,
  textoPlano,
} from '../src/odoo/lectura';
import { armar } from '../src/odoo/servicio';

const base = {
  DATABASE_URL: 'postgres://local/sgit',
  REDIS_URL: 'redis://localhost',
  S3_ENDPOINT: 'http://localhost',
  S3_BUCKET: 'sgit',
  S3_ACCESS_KEY: 'sgit',
  S3_SECRET_KEY: 'secreto',
  SESION_SECRETO: 'local',
  SEED_OPERATOR_CORREO: 'operador@sgit.local',
  SEED_OPERATOR_PASSWORD: 'clave',
};

test('con la dirección, la base y la clave alcanza y el pedido es sale.order', () => {
  const odoo = leerConfiguracion({
    ...base,
    ODOO_URL: 'https://odoo.example/',
    ODOO_DB: 'produccion',
    ODOO_USUARIO: 'sgit.tecnico',
    ODOO_CLAVE: 'clave',
    ODOO_MODELO_VENTA: '78e690960eff0b0962cefd6cc375f034277b9233',
  }).odoo;
  assert.equal(odoo?.url, 'https://odoo.example');
  assert.equal(odoo?.venta.modelo, 'sale.order');
  assert.equal(odoo?.venta.campo, 'name');
  assert.equal(odoo?.tarea.modelo, 'project.task');
  assert.equal(leerConfiguracion({ ...base, ODOO_URL: 'https://odoo.example' }).odoo, null);
});

test('cero documentos no inventa un id y dos no eligen solos', () => {
  assert.equal(resolverBusqueda([]).vinculo, 'sin_vinculo');
  assert.equal(resolverBusqueda([{ id: 8, estado: 'sale', nombre: '10020264043' }]).documento?.id, 8);
  assert.equal(resolverBusqueda([{ id: 8, estado: 'sale', nombre: 'a' }, { id: 9, estado: 'draft', nombre: 'b' }]).vinculo, 'ambiguo');
  assert.deepEqual(numerosDe('COT 10020263623 ticket #2139'), ['10020263623', '2139']);
  assert.deepEqual(cotsDe('COT 10020264043 ticket 2365'), ['10020264043']);
});

test('el servicio externo se queda con la tarea que trae la cotización y el ticket', () => {
  const tareas = [
    { id: 1, estado: 'En progreso', nombre: '#2365 - ARVEC - 10020264043 - ALQUILER' },
    { id: 2, estado: 'Nuevo', nombre: '#2400 - OTRA - 10020264043 - VISITA' },
  ];
  assert.equal(elegirServicio(tareas, ['10020264043'], ['2365']).documento?.id, 1);
  assert.equal(elegirServicio([{ id: 3, estado: '', nombre: '10020264043 sola' }], ['10020264043'], []).documento?.id, 3);
  assert.equal(elegirServicio(tareas, ['10020264043'], []).vinculo, 'ambiguo');
  assert.deepEqual(dominioO([['name', '=', '10020264043']]), [['name', '=', '10020264043']]);
  assert.deepEqual(dominioO([['name', '=', '10020264043'], ['name', 'ilike', '2365']]).slice(0, 1), ['|']);
});

test('la copia del pedido trae líneas, factura, entrega y la nota del chatter', () => {
  const meta = {
    state: { type: 'selection', selection: [['sale', 'Orden de venta']] as Array<[string, string]> },
    invoice_status: { type: 'selection', selection: [['to invoice', 'Por facturar']] as Array<[string, string]> },
    partner_id: { type: 'many2one' },
  };
  const copia = armarVenta(
    meta,
    { name: '10020264043', state: 'sale', partner_id: [9, 'ARVEC GROUP S.A.C.'], invoice_status: 'to invoice', amount_total: 5864, currency_id: [1, 'USD'], note: '<p>Alquiler reefer</p>' },
    [{ name: 'Contenedor reefer', product_id: [4, 'Reefer'], product_uom_qty: 1, qty_delivered: 0, qty_invoiced: 0 }],
    [{ date: '2026-10-17 12:00:00', author_id: [3, 'Lesly Espinoza'], body: '<p>Cotización → Orden de venta</p>', subject: '' }],
  );
  assert.equal(copia.cliente, 'ARVEC GROUP S.A.C.');
  assert.equal(copia.estado, 'Orden de venta');
  assert.equal(copia.factura, 'Por facturar');
  assert.equal(copia.entrega, 'Sin entrega');
  assert.equal(copia.total, '5864.00 USD');
  assert.equal(copia.nota, 'Alquiler reefer');
  assert.equal(copia.ficha.find((campo) => campo.nombre === 'Cliente')?.valor, 'ARVEC GROUP S.A.C.');
  assert.equal(copia.paso, 'Orden de venta');
  assert.equal(copia.notas[0]?.autor, 'Lesly Espinoza');
  assert.equal(textoPlano('<p>Hola&nbsp;<b>equipo</b></p>'), 'Hola equipo');
  const tarea = armarTarea({ stage_id: { type: 'many2one' } }, { name: '#2365 - ARVEC - 10020264043', stage_id: [1, 'En progreso'], description: '<p>Bienes días</p>' }, []);
  assert.equal(tarea.estado, 'En progreso');
  assert.equal(tarea.nota, 'Bienes días');
  const despues = { ...copia, factura: 'Facturado', lineas: [{ ...copia.lineas[0], facturada: 1 }] };
  assert.match(cambiosDe(copia, despues), /facturación/);
  assert.equal(cambiosDe(null, copia), '');
  assert.equal(diferenciasDe(null, copia).length, 0);
  const conFecha = {
    ...copia,
    ficha: [...copia.ficha, { nombre: 'Validez', valor: '2026-10-20', lado: 'der' as const }],
  };
  const reprogramada = {
    ...conFecha,
    ficha: conFecha.ficha.map((campo) => (campo.nombre === 'Validez' ? { ...campo, valor: '2026-10-28' } : campo)),
  };
  assert.deepEqual(fechasDe(conFecha), [{ campo: 'Validez', valor: '2026-10-20' }]);
  assert.deepEqual(diferenciasDe(conFecha, reprogramada), [{ campo: 'Validez', antes: '2026-10-20', despues: '2026-10-28' }]);
  assert.match(cambiosDe(conFecha, reprogramada), /validez/);
  assert.equal(entregaDeLineas([{ nombre: 'a', producto: '', tipo: '', equipo: '', cantidad: 1, entregada: 1, facturada: 0, precio: '', descuento: '', importe: '' }]), 'Entregado');
  assert.equal(armar({ url: 'https://odoo.example', db: 'produccion', usuario: 'a', clave: 'b', modeloVenta: 'no-es-modelo' })?.venta.modelo, 'sale.order');
});
