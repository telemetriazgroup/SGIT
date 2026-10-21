import type { LecturaOdoo } from '../configuracion';

const REPORTE_ORDEN = 'studio_customization.studio_report_docume_138dca13-39c9-4e14-8aed-3b87e59369a6';
import { autenticar, buscar, llamar, presentes, camposDe } from '../odoo/cliente';
import { CHIP_CODIGO, MODEM_CODIGO, PRODUCTO_TELEMETRIA, borradorLibre, codigoDeProducto, conPedidoInicial, esLimiteDeOrdenes, nombreDeProducto, type MaterialPedido } from './reglas';

type OrdenLista = { ok: true; odooId: number; nombre: string; reutilizada: boolean; materiales: MaterialPedido[] };
type OrdenFalla = { ok: false; incidente: string };

export async function tomarOrden(
  config: LecturaOdoo,
  datos: { cot: string; ejecutor: string; contenedor: string; maquina: string },
): Promise<OrdenLista | OrdenFalla> {
  const uid = await autenticar(config);
  const producto = await uno(config, uid, 'product.product', [['default_code', '=', PRODUCTO_TELEMETRIA]], ['product_tmpl_id', 'uom_id']);
  if (!producto) return { ok: false, incidente: `Odoo no tiene el producto ${PRODUCTO_TELEMETRIA}.` };
  const plantillaId = idDe(producto.product_tmpl_id);
  const bom = await uno(config, uid, 'mrp.bom', [['product_tmpl_id', '=', plantillaId]], ['id']);
  if (!bom) return { ok: false, incidente: `Odoo no tiene la lista de materiales de ${PRODUCTO_TELEMETRIA}.` };
  const venta = await uno(config, uid, 'sale.order', [['name', '=', datos.cot]], ['name']);
  if (!venta) return { ok: false, incidente: `Odoo no tiene la cotización ${datos.cot}.` };
  const empleado = await uno(config, uid, 'hr.employee', [['name', '=', datos.ejecutor]], ['name']);
  if (!empleado) return { ok: false, incidente: `Odoo no tiene al ejecutor ${datos.ejecutor}.` };
  const valores: Record<string, unknown> = {
    product_id: Number(producto.id),
    bom_id: Number(bom.id),
    product_qty: 1,
    x_studio_ref_cotizacion_1: Number(venta.id),
    x_studio_solicitante: Number(empleado.id),
    x_studio_contenedor: datos.contenedor || false,
    x_studio_maquina: datos.maquina || false,
  };
  const unidad = idDe(producto.uom_id);
  if (unidad) valores.product_uom_id = unidad;
  const libre = await borradorSinUso(config, uid, Number(producto.id));
  if (libre) {
    await llamar(config, uid, 'mrp.production', 'write', [[libre.id], valores]);
    const materiales = await materialesDe(config, uid, libre.id);
    return { ok: true, odooId: libre.id, nombre: libre.nombre, reutilizada: true, materiales };
  }
  try {
    const creado = Number(await llamar(config, uid, 'mrp.production', 'create', [valores]));
    if (!creado) return { ok: false, incidente: 'Odoo no devolvió la orden de fabricación.' };
    const materiales = await materialesDe(config, uid, creado);
    const nombre = await nombreDe(config, uid, creado);
    return { ok: true, odooId: creado, nombre, reutilizada: false, materiales };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Odoo rechazó la orden.';
    if (esLimiteDeOrdenes(mensaje)) {
      return { ok: false, incidente: 'El sistema no permite crear la orden de fabricación: hay 80 órdenes activas y ningún borrador de GPNDND0002 sin cotización ni serie.' };
    }
    return { ok: false, incidente: mensaje };
  }
}

export async function aplicarSeleccion(
  config: LecturaOdoo,
  odooId: number,
  datos: { cot: string; ejecutor: string; contenedor: string; maquina: string; materiales: MaterialPedido[] },
): Promise<MaterialPedido[]> {
  const uid = await autenticar(config);
  const valores: Record<string, unknown> = {
    x_studio_contenedor: datos.contenedor || false,
    x_studio_maquina: datos.maquina || false,
  };
  const venta = await uno(config, uid, 'sale.order', [['name', '=', datos.cot]], ['name']);
  if (venta) valores.x_studio_ref_cotizacion_1 = Number(venta.id);
  const empleado = datos.ejecutor ? await uno(config, uid, 'hr.employee', [['name', '=', datos.ejecutor]], ['name']) : null;
  if (empleado) valores.x_studio_solicitante = Number(empleado.id);
  await llamar(config, uid, 'mrp.production', 'write', [[odooId], valores]);
  const orden = await uno(config, uid, 'mrp.production', [['id', '=', odooId]], ['location_src_id', 'production_location_id', 'picking_type_id', 'company_id']);
  const quedaron: MaterialPedido[] = [];
  for (const material of datos.materiales) {
    if (!material.pedido || material.cantidad <= 0) {
      await soltarMove(config, uid, material.moveId);
      quedaron.push({ ...material, pedido: false });
      continue;
    }
    const moveId = await dejarPedido(config, uid, odooId, orden, material);
    quedaron.push({ ...material, moveId });
  }
  return quedaron;
}

async function soltarMove(config: LecturaOdoo, uid: number, moveId: number): Promise<void> {
  if (!moveId) return;
  try {
    await llamar(config, uid, 'stock.move', 'unlink', [[moveId]]);
  } catch {
    await llamar(config, uid, 'stock.move', 'write', [[moveId], { product_uom_qty: 0 }]).catch(() => undefined);
  }
}

async function dejarPedido(
  config: LecturaOdoo,
  uid: number,
  odooId: number,
  orden: Record<string, unknown> | null,
  material: MaterialPedido,
): Promise<number> {
  try {
    await llamar(config, uid, 'stock.move', 'write', [[material.moveId], { product_uom_qty: material.cantidad }]);
    return material.moveId;
  } catch {
    const producto = await uno(config, uid, 'product.product', [['id', '=', material.productoId]], ['uom_id', 'name']);
    const creado = Number(await llamar(config, uid, 'stock.move', 'create', [{
      name: material.nombre || texto(producto?.name) || material.codigo,
      product_id: material.productoId,
      product_uom_qty: material.cantidad,
      product_uom: idDe(producto?.uom_id) || false,
      location_id: idDe(orden?.location_src_id) || false,
      location_dest_id: idDe(orden?.production_location_id) || false,
      raw_material_production_id: odooId,
      picking_type_id: idDe(orden?.picking_type_id) || false,
      company_id: idDe(orden?.company_id) || false,
      procure_method: 'make_to_stock',
    }]));
    if (!creado) throw new Error(`No pude volver a poner ${material.codigo || material.nombre} en la orden.`);
    return creado;
  }
}

export async function confirmarOrden(
  config: LecturaOdoo,
  odooId: number,
  materiales: MaterialPedido[],
  chip: { celular: string; imei: string },
  modemSerie: string,
): Promise<void> {
  const uid = await autenticar(config);
  for (const material of materiales) {
    if (!material.pedido || material.cantidad <= 0) continue;
    await llamar(config, uid, 'stock.move', 'write', [[material.moveId], { product_uom_qty: material.cantidad }]).catch(() => undefined);
  }
  const chipMove = materiales.find((material) => material.codigo === CHIP_CODIGO);
  const modemMove = materiales.find((material) => material.codigo === MODEM_CODIGO);
  if (chipMove?.pedido) {
    if (!chip.celular) throw new Error('Falta el número del chip. No se confirma para no tomar otro.');
    const puesto = await asignarLote(config, uid, chipMove, chip.celular);
    if (!puesto) throw new Error(`Odoo no tiene el lote ${chip.celular} del chip ${CHIP_CODIGO}. No se confirma para no tomar otro.`);
  }
  if (modemMove?.pedido && modemSerie.trim()) {
    const puesto = await asignarLote(config, uid, modemMove, modemSerie.trim());
    if (!puesto) throw new Error(`Odoo no tiene el lote ${modemSerie.trim()} del módem ${MODEM_CODIGO}.`);
  }
  await llamar(config, uid, 'mrp.production', 'write', [[odooId], {
    x_studio_numero: chip.celular || false,
    x_studio_imei: chip.imei || false,
    x_studio_gsm: modemSerie.trim() || false,
  }]);
  await llamar(config, uid, 'mrp.production', 'action_confirm', [[odooId]]);
}

export async function registrarConstancia(
  config: LecturaOdoo,
  odooId: number,
  datos: { materiales: MaterialPedido[]; chip: { celular: string; imei: string }; modemSerie: string; equipo: string; cotizacion: string },
): Promise<void> {
  const uid = await autenticar(config);
  const chipMove = datos.materiales.find((material) => material.codigo === CHIP_CODIGO && material.pedido);
  const modemMove = datos.materiales.find((material) => material.codigo === MODEM_CODIGO && material.pedido);
  if (chipMove) {
    if (!datos.chip.celular) throw new Error('Falta el número del chip. Sin ese lote, Odoo tomaría otro al confirmar.');
    const puesto = await asignarLote(config, uid, chipMove, datos.chip.celular);
    if (!puesto) throw new Error(`Odoo no tiene el lote ${datos.chip.celular} del chip ${CHIP_CODIGO}. Sin ese lote, Odoo tomaría otro al confirmar.`);
  }
  if (modemMove && datos.modemSerie.trim()) {
    const puesto = await asignarLote(config, uid, modemMove, datos.modemSerie.trim());
    if (!puesto) throw new Error(`Odoo no tiene el lote ${datos.modemSerie.trim()} del módem ${MODEM_CODIGO}.`);
  }
  await llamar(config, uid, 'mrp.production', 'write', [[odooId], {
    x_studio_numero: datos.chip.celular || false,
    x_studio_imei: datos.chip.imei || false,
    x_studio_gsm: datos.modemSerie.trim() || false,
    x_studio_notas: htmlNota(`${datos.equipo}\n\n${datos.cotizacion}`),
  }]);
  await publicarNota(config, uid, odooId, datos.equipo);
  await publicarNota(config, uid, odooId, datos.cotizacion);
}

async function publicarNota(config: LecturaOdoo, uid: number, odooId: number, texto: string): Promise<void> {
  await llamar(config, uid, 'mrp.production', 'message_post', [[odooId]], {
    body: htmlNota(texto),
    body_is_html: true,
    message_type: 'comment',
    subtype_xmlid: 'mail.mt_note',
  });
}

export async function estadoDeOrden(config: LecturaOdoo, odooId: number): Promise<string> {
  const uid = await autenticar(config);
  const orden = await uno(config, uid, 'mrp.production', [['id', '=', odooId]], ['state']);
  return String(orden?.state ?? '');
}

export async function marcarConsumido(config: LecturaOdoo, moveIds: number[]): Promise<void> {
  const ids = [...new Set(moveIds.filter((id) => id > 0))];
  if (ids.length === 0) return;
  const uid = await autenticar(config);
  await llamar(config, uid, 'stock.move', 'write', [ids, { picked: true }]);
}

export async function pdfDeOrden(config: LecturaOdoo, odooId: number): Promise<Buffer> {
  if (!config.sesion?.usuario || !config.sesion.clave) throw new Error('Falta el usuario y la clave normal de Odoo para bajar el reporte.');
  const sesion = await fetch(`${config.url}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { db: config.db, login: config.sesion.usuario, password: config.sesion.clave } }),
  });
  const cuerpo = (await sesion.json()) as { result?: { uid?: number | false }; error?: { data?: { message?: string }; message?: string } };
  if (!cuerpo.result?.uid) {
    const detalle = cuerpo.error?.data?.message || cuerpo.error?.message || `respuesta ${sesion.status}`;
    throw new Error(`Odoo no abrió la sesión del reporte. ${detalle}`.slice(0, 300));
  }
  const crudas = typeof sesion.headers.getSetCookie === 'function' ? sesion.headers.getSetCookie() : [sesion.headers.get('set-cookie') ?? ''];
  const cookie = crudas.map((item) => item.split(';')[0]).filter(Boolean).join('; ');
  const respuesta = await fetch(`${config.url}/report/pdf/${REPORTE_ORDEN}/${odooId}`, { headers: { cookie } });
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  if (!respuesta.ok || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Odoo no devolvió el reporte de orden de producción.');
  return bytes;
}

async function asignarLote(config: LecturaOdoo, uid: number, material: MaterialPedido, serie: string): Promise<boolean> {
  const lote = await uno(config, uid, 'stock.lot', [['name', '=', serie], ['product_id', '=', material.productoId]], ['name']);
  if (!lote) return false;
  const comando = [[6, 0, [Number(lote.id)]]];
  await llamar(config, uid, 'stock.move', 'write', [[material.moveId], { lot_ids: comando, move_lot_ids: comando }]);
  return true;
}

function htmlNota(texto: string): string {
  const lineas = texto.split('\n').map((linea) => linea.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;');
  return `<div>${lineas.join('<br>')}</div>`;
}

async function borradorSinUso(config: LecturaOdoo, uid: number, productoId: number): Promise<{ id: number; nombre: string } | null> {
  const meta = await camposDe(config, uid, 'mrp.production');
  const filas = await buscar(
    config,
    uid,
    'mrp.production',
    [['state', '=', 'draft'], ['product_id', '=', productoId], ['x_studio_ref_cotizacion_1', '=', false]],
    presentes(meta, ['name', 'x_studio_imei', 'x_studio_gsm', 'lot_producing_id', 'move_raw_ids']),
    40,
    20_000,
    'id asc',
  );
  for (const fila of filas) {
    const moveIds = idsDe(fila.move_raw_ids);
    const moves = moveIds.length ? await buscar(config, uid, 'stock.move', [['id', 'in', moveIds]], ['lot_ids'], 80) : [];
    const lotes = moves.reduce((total, move) => total + idsDe(move.lot_ids).length, 0) + (idDe(fila.lot_producing_id) ? 1 : 0);
    const libre = borradorLibre({
      cotizacion: false,
      imei: vacio(fila.x_studio_imei),
      gsm: vacio(fila.x_studio_gsm),
      lotes,
    });
    if (libre) return { id: Number(fila.id), nombre: String(fila.name ?? '') };
  }
  return null;
}

async function materialesDe(config: LecturaOdoo, uid: number, odooId: number): Promise<MaterialPedido[]> {
  const orden = await uno(config, uid, 'mrp.production', [['id', '=', odooId]], ['move_raw_ids']);
  const moveIds = idsDe(orden?.move_raw_ids);
  if (moveIds.length === 0) return [];
  const meta = await camposDe(config, uid, 'stock.move');
  const moves = await buscar(config, uid, 'stock.move', [['id', 'in', moveIds]], presentes(meta, ['product_id', 'product_uom_qty', 'product_uom']), 40);
  const materiales = moves.map((move) => {
    const visible = texto(move.product_id);
    return {
      moveId: Number(move.id),
      productoId: idDe(move.product_id),
      codigo: codigoDeProducto(visible),
      nombre: visible,
      cantidad: Number(move.product_uom_qty ?? 0),
      unidad: texto(move.product_uom) || 'Unidad',
      pedido: false,
    };
  });
  return conPedidoInicial(await conNombres(config, uid, materiales));
}

export async function completarNombres(config: LecturaOdoo, materiales: MaterialPedido[]): Promise<MaterialPedido[]> {
  if (materiales.length === 0) return materiales;
  const uid = await autenticar(config);
  return conNombres(config, uid, materiales);
}

async function conNombres(config: LecturaOdoo, uid: number, materiales: MaterialPedido[]): Promise<MaterialPedido[]> {
  const ids = [...new Set(materiales.map((material) => material.productoId).filter((id) => id > 0))];
  if (ids.length === 0) return materiales;
  const idioma = await idiomaDe(config, uid);
  const meta = await camposDe(config, uid, 'product.product');
  const productos = await buscar(config, uid, 'product.product', [['id', 'in', ids]], presentes(meta, ['name', 'default_code']), ids.length, 20_000, 'id asc', { lang: idioma });
  const porId = new Map(productos.map((producto) => [Number(producto.id), producto]));
  return materiales.map((material) => {
    const producto = porId.get(material.productoId);
    const codigo = textoPlano(producto?.default_code) || material.codigo;
    const limpio = nombreDeProducto(textoPlano(producto?.name), codigo) || nombreDeProducto(material.nombre, codigo);
    return { ...material, codigo, nombre: limpio };
  });
}

async function idiomaDe(config: LecturaOdoo, uid: number): Promise<string> {
  const filas = await buscar(config, uid, 'res.users', [['id', '=', uid]], ['lang'], 1);
  const idioma = filas[0]?.lang;
  return typeof idioma === 'string' && idioma ? idioma : 'es_PE';
}

async function nombreDe(config: LecturaOdoo, uid: number, odooId: number): Promise<string> {
  const orden = await uno(config, uid, 'mrp.production', [['id', '=', odooId]], ['name']);
  return String(orden?.name ?? '');
}

async function uno(config: LecturaOdoo, uid: number, modelo: string, dominio: unknown[], campos: string[]): Promise<Record<string, unknown> | null> {
  const meta = await camposDe(config, uid, modelo);
  const filas = await buscar(config, uid, modelo, dominio, presentes(meta, campos), 1);
  return filas[0] ?? null;
}

function texto(valor: unknown): string {
  return Array.isArray(valor) ? String(valor[1] ?? '') : '';
}

function textoPlano(valor: unknown): string {
  if (valor === false || valor == null) return '';
  return String(valor);
}

function vacio(valor: unknown): string {
  if (valor === false || valor == null) return '';
  return String(valor);
}

function idDe(valor: unknown): number {
  const id = Array.isArray(valor) ? Number(valor[0]) : Number(valor ?? 0);
  return Number.isInteger(id) ? id : 0;
}

function idsDe(valor: unknown): number[] {
  return Array.isArray(valor) ? valor.map(Number).filter((id) => id > 0) : [];
}
