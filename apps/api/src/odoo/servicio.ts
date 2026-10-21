import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { leerConfiguracion, type LecturaOdoo } from '../configuracion';
import { seriesDe } from '../chips/orden';
import { autenticar, buscar, camposDe, presentes } from './cliente';
import {
  armarTarea,
  armarVenta,
  cambiosDe,
  diferenciasDe,
  fechasDe,
  campoValido,
  cotsDe,
  dominioO,
  elegirServicio,
  etiquetaCampo,
  modeloValido,
  numerosDe,
  resumenDe,
  resolverBusqueda,
  type CopiaOdoo,
  type DiferenciaOdoo,
  type DocumentoOdoo,
  type MetaCampo,
  type VinculoOdoo,
} from './lectura';

const CAMPOS_VENTA = [
  'name', 'state', 'partner_id', 'partner_invoice_id', 'partner_shipping_id', 'date_order', 'validity_date',
  'user_id', 'pricelist_id', 'payment_term_id', 'client_order_ref', 'amount_untaxed', 'amount_total', 'currency_id',
  'invoice_status', 'note', 'order_line', 'delivery_status', 'x_studio_asunto_cotizacion', 'x_studio_celular',
  'x_studio_correo', 'x_studio_telefono', 'x_studio_contacto', 'x_studio_lugar_de_entrega', 'x_studio_tiempo_de_entrega',
  'x_studio_libre_costo_de_manipuleo', 'x_studio_leasing', 'x_studio_cliente_leasing', 'x_studio_cantidad_de_horas',
  'x_studio_imagen_garantia', 'x_studio_aplica_parte_de_horas', 'x_studio_estado_de_alquiler',
];
const CAMPOS_LINEA = ['name', 'product_id', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'discount', 'price_subtotal', 'x_studio_tipo', 'x_studio_equipo'];
const CAMPOS_TAREA = [
  'name', 'stage_id', 'partner_id', 'partner_phone', 'description', 'date_deadline', 'planned_date_begin',
  'project_id', 'user_names', 'allocated_hours', 'sale_order_id', 'sale_line_id', 'x_sale_order_id', 'x_sale_order_line_id',
  'x_studio_many2one_field_808_1jg8aj8u7', 'x_equipo',
];
const CAMPOS_NOTA = ['date', 'author_id', 'body', 'subject'];
const CAMPOS_PARTNER = ['vat', 'street', 'street2', 'city', 'state_id', 'zip', 'country_id'];
const FRESCURA_MS = 15 * 60_000;

export type CambioOdoo = {
  clase: 'venta' | 'ticket';
  texto: string;
  detalle: DiferenciaOdoo[];
  creado_en: Date | string;
};

export type VistaOdoo = {
  vinculo: VinculoOdoo;
  odoo_id: number | null;
  estado: string | null;
  candidatos: DocumentoOdoo[];
  copia: CopiaOdoo | null;
  aviso: string | null;
  leido_en: Date | string | null;
};

export type LecturaTarea = { venta: VistaOdoo; ticket: VistaOdoo; cambios: CambioOdoo[] };

export type PublicaOdoo = {
  url: string;
  db: string;
  usuario: string;
  clavePuesta: boolean;
  sesionUsuario: string;
  sesionClavePuesta: boolean;
  modeloVenta: string;
  campoCot: string;
  modeloTarea: string;
  origen: 'pantalla' | 'entorno' | 'sin_conexion';
};

type FilaConfig = { url: string; db: string; usuario: string; clave: string; modelo_venta: string; campo_cot: string; modelo_tarea: string; sesion_usuario: string; sesion_clave: string };
type TareaOdoo = { id: string; cot?: string | null; ticket?: string | null; estado?: string | null };

export class OdooServicio {
  constructor(private readonly conexiones: Conexiones) {}

  async publica(): Promise<PublicaOdoo> {
    const fila = await this.fila();
    const entorno = leerConfiguracion().odoo;
    if (fila?.clave) return publicaDe(fila, 'pantalla');
    if (entorno) return publicaDe(entorno, 'entorno');
    return {
      url: fila?.url || '',
      db: fila?.db || '',
      usuario: fila?.usuario || '',
      clavePuesta: false,
      sesionUsuario: fila?.sesion_usuario || '',
      sesionClavePuesta: Boolean(fila?.sesion_clave),
      modeloVenta: 'sale.order',
      campoCot: 'name',
      modeloTarea: 'project.task',
      origen: 'sin_conexion',
    };
  }

  async guardar(entrada: { url?: string; db?: string; usuario?: string; clave?: string; sesionUsuario?: string; sesionClave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string }): Promise<PublicaOdoo> {
    const previa = await this.fila();
    const entorno = leerConfiguracion().odoo;
    const clave = (entrada.clave ?? '').trim() || previa?.clave || entorno?.clave || '';
    const config = armar({
      url: entrada.url,
      db: entrada.db,
      usuario: entrada.usuario,
      clave,
      sesionUsuario: entrada.sesionUsuario ?? previa?.sesion_usuario,
      sesionClave: (entrada.sesionClave ?? '').trim() || previa?.sesion_clave,
      modeloVenta: entrada.modeloVenta,
      campoCot: entrada.campoCot,
      modeloTarea: entrada.modeloTarea,
    });
    if (!config) throw new BadRequestException('Faltan la dirección, la base, el usuario o la clave de API.');
    await this.conexiones.pg.query(
      `INSERT INTO configuracion_odoo (id, url, db, usuario, clave, modelo_venta, campo_cot, modelo_tarea, sesion_usuario, sesion_clave, actualizado_en)
       VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (id) DO UPDATE
         SET url = EXCLUDED.url, db = EXCLUDED.db, usuario = EXCLUDED.usuario, clave = EXCLUDED.clave,
             modelo_venta = EXCLUDED.modelo_venta, campo_cot = EXCLUDED.campo_cot, modelo_tarea = EXCLUDED.modelo_tarea,
             sesion_usuario = EXCLUDED.sesion_usuario, sesion_clave = EXCLUDED.sesion_clave,
             actualizado_en = now()`,
      [config.url, config.db, config.usuario, config.clave, config.venta.modelo, config.venta.campo, config.tarea.modelo, config.sesion?.usuario ?? '', config.sesion?.clave ?? ''],
    );
    return publicaDe(config, 'pantalla');
  }

  async probar(entrada: { url?: string; db?: string; usuario?: string; clave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string }): Promise<{ aceptada: true }> {
    const previa = await this.config();
    const clave = (entrada.clave ?? '').trim() || previa?.clave || '';
    const config = armar({
      url: entrada.url || previa?.url,
      db: entrada.db || previa?.db,
      usuario: entrada.usuario || previa?.usuario,
      clave,
      modeloVenta: entrada.modeloVenta || previa?.venta.modelo,
      campoCot: entrada.campoCot || previa?.venta.campo,
      modeloTarea: entrada.modeloTarea || previa?.tarea.modelo,
    });
    if (!config) throw new BadRequestException('Falta la conexión con Odoo.');
    try {
      await autenticar(config);
    } catch (error) {
      throw new BadRequestException(avisoDe(error, config.clave));
    }
    return { aceptada: true };
  }

  async deTarea(tarea: TareaOdoo, forzar: boolean): Promise<LecturaTarea | null> {
    const config = await this.config();
    const abierta = tarea.estado !== 'resuelta';
    if (config && abierta && (forzar || ((await this.habilitada(tarea.id)) && (await this.estaVieja(tarea.id))))) {
      await this.refrescar(config, tarea);
    }
    return this.guardado(tarea.id);
  }

  async listarServicios(cot: string, ordenId: number | null): Promise<DocumentoOdoo[]> {
    const config = await this.config();
    if (!config) return [];
    const uid = await autenticar(config);
    const meta = await camposDe(config, uid, config.tarea.modelo);
    const campos = presentes(meta, ['name', 'stage_id', 'x_sale_order_id', 'sale_order_id']);
    const campoOrden = meta.x_sale_order_id ? 'x_sale_order_id' : meta.sale_order_id ? 'sale_order_id' : '';
    const clausulas: unknown[][] = cotsDe(cot).map((numero) => ['name', 'ilike', numero]);
    if (ordenId != null && campoOrden) clausulas.push([campoOrden, '=', ordenId]);
    const filas = await buscar(config, uid, config.tarea.modelo, dominioO(clausulas), campos, 40);
    return filas.map((fila) => documentoDe(fila, meta, 'stage_id'));
  }

  async pulsar(): Promise<void> {
    const config = await this.config();
    if (!config) return;
    let uid: number;
    try {
      uid = await autenticar(config);
    } catch (error) {
      console.error(`Odoo: ${avisoDe(error, config.clave)}`);
      return;
    }
    const pendientes = await this.conexiones.pg.query<TareaOdoo>(
      `SELECT t.id, t.cot, t.ticket, t.estado
       FROM tarea t
       INNER JOIN habilitado h ON h.clase = 'tarea' AND h.clave = t.id::text
       WHERE t.estado IS DISTINCT FROM 'resuelta'
         AND NOT EXISTS (
           SELECT 1 FROM lectura_odoo l
           WHERE l.tarea_id = t.id AND l.clase = 'venta' AND l.fallo_en IS NULL AND l.leido_en > now() - interval '15 minutes'
         )
       ORDER BY h.creado_en DESC
       LIMIT 4`,
    );
    for (const tarea of pendientes.rows) await this.refrescar(config, tarea, uid);
  }

  private async refrescar(config: LecturaOdoo, tarea: TareaOdoo, uidYa?: number): Promise<void> {
    let uid = uidYa;
    try {
      uid ??= await autenticar(config);
    } catch (error) {
      await this.fallo(tarea.id, 'venta', avisoDe(error, config.clave));
      await this.fallo(tarea.id, 'ticket', avisoDe(error, config.clave));
      return;
    }
    const venta = await this.leerVenta(config, uid, tarea);
    await this.leerTarea(config, uid, tarea, venta);
  }

  private async leerVenta(config: LecturaOdoo, uid: number, tarea: TareaOdoo): Promise<number | null> {
    const cots = cotsDe(String(tarea.cot ?? ''));
    const elegido = await this.elegido(tarea.id, 'venta');
    if (cots.length === 0 && elegido == null) {
      await this.exito(tarea.id, 'venta', 'sin_vinculo', null, null, [], null, null);
      return null;
    }
    try {
      const meta = await camposDe(config, uid, config.venta.modelo);
      const campos = presentes(meta, [...CAMPOS_VENTA, ...seleccionesDe(meta)]);
      const dominio = elegido != null ? [['id', '=', elegido]] : dominioO(cots.map((cot) => [config.venta.campo, '=', cot]));
      let filas = await buscar(config, uid, config.venta.modelo, dominio, campos, 5);
      if (filas.length === 0 && elegido == null) {
        filas = await buscar(config, uid, config.venta.modelo, dominioO(cots.map((cot) => [config.venta.campo, 'ilike', cot])), campos, 5);
      }
      const documentos = filas.map((fila) => documentoDe(fila, meta, 'state'));
      const resuelto = resolverBusqueda(elegido == null ? documentos : documentos.filter((fila) => fila.id === elegido));
      if (resuelto.vinculo !== 'unico' || !resuelto.documento) {
        const aviso = elegido != null && resuelto.vinculo === 'sin_vinculo' ? 'El pedido vinculado ya no está en Odoo.' : null;
        await this.exito(tarea.id, 'venta', resuelto.vinculo, resuelto.documento?.id ?? elegido, null, resuelto.candidatos, null, aviso);
        return null;
      }
      const orden = filas.find((fila) => Number(fila.id) === resuelto.documento?.id) ?? filas[0];
      const lineas = await this.lineas(config, uid, orden.order_line);
      const notas = await this.notas(config, uid, config.venta.modelo, resuelto.documento.id);
      const partner = await this.partner(config, uid, orden.partner_id);
      const copia = armarVenta(meta, orden, lineas, notas, partner);
      const previa = await this.copiaGuardada(tarea.id, 'venta');
      await this.exito(tarea.id, 'venta', 'unico', resuelto.documento.id, resumenDe(copia), [], copia, cambiosDe(previa, copia) || null);
      await this.recordar(tarea.id, 'venta', previa, copia);
      return resuelto.documento.id;
    } catch (error) {
      await this.fallo(tarea.id, 'venta', avisoDe(error, config.clave));
      return null;
    }
  }

  private async leerTarea(config: LecturaOdoo, uid: number, tarea: TareaOdoo, ordenId: number | null): Promise<void> {
    const cots = cotsDe(String(tarea.cot ?? ''));
    const tickets = numerosDe(String(tarea.ticket ?? ''));
    const elegido = await this.elegido(tarea.id, 'ticket');
    if (cots.length === 0 && tickets.length === 0 && elegido == null && ordenId == null) {
      await this.exito(tarea.id, 'ticket', 'sin_vinculo', null, null, [], null, null);
      return;
    }
    try {
      const meta = await camposDe(config, uid, config.tarea.modelo);
      const campos = presentes(meta, [...CAMPOS_TAREA, ...seleccionesDe(meta)]);
      const campoOrden = meta.x_sale_order_id ? 'x_sale_order_id' : meta.sale_order_id ? 'sale_order_id' : '';
      let filas: Record<string, unknown>[] = [];
      if (elegido != null) filas = await buscar(config, uid, config.tarea.modelo, [['id', '=', elegido]], campos, 5);
      else if (ordenId != null && campoOrden) filas = await buscar(config, uid, config.tarea.modelo, [[campoOrden, '=', ordenId]], campos, 5);
      if (elegido == null && filas.length !== 1) {
        const clausulas: unknown[][] = [];
        for (const cot of cots) clausulas.push(['name', 'ilike', cot]);
        for (const ticket of tickets) clausulas.push(['name', 'ilike', ticket]);
        const porNombre = await buscar(config, uid, config.tarea.modelo, dominioO(clausulas), campos, 5);
        const vistos = new Set(filas.map((fila) => Number(fila.id)));
        filas = filas.concat(porNombre.filter((fila) => !vistos.has(Number(fila.id))));
      }
      const documentos = filas.map((fila) => documentoDe(fila, meta, 'stage_id'));
      const resuelto = elegido == null ? elegirServicio(documentos, cots, tickets) : resolverBusqueda(documentos.filter((fila) => fila.id === elegido));
      if (resuelto.vinculo !== 'unico' || !resuelto.documento) {
        const aviso = elegido != null && resuelto.vinculo === 'sin_vinculo' ? 'La tarea vinculada ya no está en Odoo.' : null;
        await this.exito(tarea.id, 'ticket', resuelto.vinculo, resuelto.documento?.id ?? elegido, null, resuelto.candidatos, null, aviso);
        return;
      }
      const registro = filas.find((fila) => Number(fila.id) === resuelto.documento?.id) ?? filas[0];
      const notas = await this.notas(config, uid, config.tarea.modelo, resuelto.documento.id);
      const copia = armarTarea(meta, registro, notas);
      const previa = await this.copiaGuardada(tarea.id, 'ticket');
      await this.exito(tarea.id, 'ticket', 'unico', resuelto.documento.id, resumenDe(copia), [], copia, cambiosDe(previa, copia) || null);
      await this.recordar(tarea.id, 'ticket', previa, copia);
    } catch (error) {
      await this.fallo(tarea.id, 'ticket', avisoDe(error, config.clave));
    }
  }

  private async lineas(config: LecturaOdoo, uid: number, ids: unknown): Promise<Record<string, unknown>[]> {
    const lista = Array.isArray(ids) ? ids.map(Number).filter((id) => Number.isInteger(id)) : [];
    if (lista.length === 0) return [];
    try {
      const meta = await camposDe(config, uid, 'sale.order.line');
      const filas = await buscar(config, uid, 'sale.order.line', [['id', 'in', lista]], presentes(meta, CAMPOS_LINEA), 40);
      return filas.map((fila) => ({
        ...fila,
        tipo: etiquetaCampo(meta.x_studio_tipo, fila.x_studio_tipo),
        equipo: fila.x_studio_equipo == null || fila.x_studio_equipo === false ? '' : String(fila.x_studio_equipo),
      }));
    } catch {
      return [];
    }
  }

  private async partner(config: LecturaOdoo, uid: number, relacion: unknown): Promise<Record<string, unknown> | null> {
    const id = Array.isArray(relacion) ? Number(relacion[0]) : 0;
    if (!Number.isInteger(id) || id <= 0) return null;
    try {
      const filas = await buscar(config, uid, 'res.partner', [['id', '=', id]], CAMPOS_PARTNER, 1);
      return filas[0] ?? null;
    } catch {
      return null;
    }
  }

  private async notas(config: LecturaOdoo, uid: number, modelo: string, id: number): Promise<Record<string, unknown>[]> {
    try {
      return await buscar(
        config,
        uid,
        'mail.message',
        [['model', '=', modelo], ['res_id', '=', id], ['message_type', 'in', ['comment', 'email', 'notification']]],
      CAMPOS_NOTA,
      25,
    );
    } catch {
      return [];
    }
  }

  private async config(): Promise<LecturaOdoo | null> {
    const fila = await this.fila();
    if (fila?.clave) return armar(fila);
    return leerConfiguracion().odoo;
  }

  private async fila(): Promise<FilaConfig | null> {
    const resultado = await this.conexiones.pg.query<FilaConfig>(
      `SELECT url, db, usuario, clave, modelo_venta, campo_cot, modelo_tarea, sesion_usuario, sesion_clave FROM configuracion_odoo WHERE id = true`,
    );
    return resultado.rows[0] ?? null;
  }

  async inventarioDe(series: string[]): Promise<{ lotes: Array<{ id: number; serie: string; producto: string; cantidad: number }>; lineas: Array<{ loteId: number; fecha: string; referencia: string; producto: string; desde: string; hacia: string; cantidad: number }>; aviso: string | null }> {
    const config = await this.config();
    if (!config) throw new BadRequestException('Odoo no está conectado.');
    const uid = await autenticar(config);
    const metaLote = await camposDe(config, uid, 'stock.lot');
    const camposLote = presentes(metaLote, ['name', 'product_id', 'product_qty']);
    const lotes = [];
    for (const grupo of trozos(series, 80)) {
      const filas = await buscar(config, uid, 'stock.lot', [['name', 'in', grupo]], camposLote, 500);
      for (const fila of filas) {
        lotes.push({
          id: Number(fila.id),
          serie: String(fila.name ?? ''),
          producto: textoRelacion(fila.product_id),
          cantidad: Number(fila.product_qty ?? 0),
        });
      }
    }
    const metaLinea = await camposDe(config, uid, 'stock.move.line');
    const camposLinea = presentes(metaLinea, ['date', 'reference', 'product_id', 'lot_id', 'location_id', 'location_dest_id', 'qty_done', 'quantity']);
    const lineas = [];
    for (const grupo of trozos(lotes.map((lote) => lote.id), 80)) {
      const filas = await buscar(config, uid, 'stock.move.line', [['lot_id', 'in', grupo]], camposLinea, 500);
      for (const fila of filas) {
        lineas.push({
          loteId: idRelacion(fila.lot_id),
          fecha: String(fila.date ?? ''),
          referencia: String(fila.reference ?? ''),
          producto: textoRelacion(fila.product_id),
          desde: textoRelacion(fila.location_id),
          hacia: textoRelacion(fila.location_dest_id),
          cantidad: Number(fila.qty_done ?? fila.quantity ?? 0),
        });
      }
    }
    return { lotes, lineas, aviso: null };
  }

  async marcasDeOrdenes(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids.filter((id) => id > 0))];
    const marcas = new Map<number, string>();
    if (unicos.length === 0) return marcas;
    const config = await this.config();
    if (!config) return marcas;
    const uid = await autenticar(config);
    const meta = await camposDe(config, uid, 'mrp.production');
    const ordenes = await buscar(config, uid, 'mrp.production', [['id', 'in', unicos]], presentes(meta, ['write_date']), unicos.length);
    const mensajes = await buscar(
      config,
      uid,
      'mail.message',
      [['model', '=', 'mrp.production'], ['res_id', 'in', unicos]],
      ['res_id', 'date'],
      Math.min(unicos.length * 8, 200),
      20_000,
      'date desc',
    );
    const ultima = new Map<number, string>();
    for (const mensaje of mensajes) {
      const id = Number(mensaje.res_id);
      const fecha = String(mensaje.date ?? '');
      const previa = ultima.get(id) ?? '';
      if (fecha > previa) ultima.set(id, fecha);
    }
    for (const orden of ordenes) marcas.set(Number(orden.id), `${String(orden.write_date ?? '')}|${ultima.get(Number(orden.id)) ?? ''}`);
    return marcas;
  }

  async ordenDe(nombre: string): Promise<{
    id: number;
    nombre: string;
    estado: string;
    producto: string;
    cantidad: number;
    produciendo: number;
    inicio: string;
    fin: string;
    responsable: string;
    lista: string;
    serie: string;
    escritoEn: string;
    componentes: Array<{ producto: string; porConsumir: number; consumido: number; unidad: string; desde: string; serie: string }>;
    notas: Array<{ fecha: string; autor: string; texto: string; imagenes: Array<{ nombre: string; mime: string; datos: Buffer }> }>;
  } | null> {
    const config = await this.config();
    if (!config) throw new BadRequestException('Odoo no está conectado.');
    const uid = await autenticar(config);
    const meta = await camposDe(config, uid, 'mrp.production');
    const campos = presentes(meta, ['name', 'state', 'product_id', 'product_qty', 'qty_producing', 'date_start', 'date_finished', 'user_id', 'bom_id', 'lot_producing_id', 'move_raw_ids', 'write_date']);
    const filas = await buscar(config, uid, 'mrp.production', [['name', '=', nombre]], campos, 1);
    const orden = filas[0];
    if (!orden) return null;
    const moveIds = Array.isArray(orden.move_raw_ids) ? orden.move_raw_ids.map(Number).filter((id) => id > 0) : [];
    const metaMove = await camposDe(config, uid, 'stock.move');
    const camposMove = presentes(metaMove, ['product_id', 'product_uom_qty', 'quantity', 'product_uom', 'location_id', 'picked', 'lot_ids']);
    const moves = moveIds.length ? await buscar(config, uid, 'stock.move', [['id', 'in', moveIds]], camposMove, 40) : [];
    const loteIds = moves.flatMap((move) => (Array.isArray(move.lot_ids) ? move.lot_ids.map(Number).filter((id) => id > 0) : []));
    const nombres = await this.nombresDeLote(config, uid, loteIds);
    const notas = await buscar(
      config,
      uid,
      'mail.message',
      [['model', '=', 'mrp.production'], ['res_id', '=', orden.id], ['message_type', 'in', ['comment', 'email', 'notification']]],
      ['date', 'author_id', 'body', 'attachment_ids'],
      30,
    );
    const imagenes = await this.imagenesDe(config, uid, notas);
    return {
      id: Number(orden.id),
      nombre: String(orden.name ?? nombre),
      estado: String(orden.state ?? ''),
      producto: textoRelacion(orden.product_id),
      cantidad: Number(orden.product_qty ?? 0),
      produciendo: Number(orden.qty_producing ?? 0),
      inicio: String(orden.date_start ?? ''),
      fin: String(orden.date_finished ?? ''),
      responsable: textoRelacion(orden.user_id),
      lista: textoRelacion(orden.bom_id),
      serie: textoRelacion(orden.lot_producing_id),
      escritoEn: String(orden.write_date ?? ''),
      componentes: moves.map((move) => ({
        producto: textoRelacion(move.product_id),
        porConsumir: Number(move.product_uom_qty ?? 0),
        consumido: Number(move.quantity ?? 0),
        unidad: textoRelacion(move.product_uom),
        desde: textoRelacion(move.location_id),
        serie: seriesDe(move.lot_ids, nombres),
      })),
      notas: notas.map((nota) => ({
        fecha: String(nota.date ?? ''),
        autor: textoRelacion(nota.author_id),
        texto: String(nota.body ?? ''),
        imagenes: (Array.isArray(nota.attachment_ids) ? nota.attachment_ids.map(Number) : [])
          .map((id) => imagenes.get(id))
          .filter((imagen): imagen is { nombre: string; mime: string; datos: Buffer } => Boolean(imagen)),
      })),
    };
  }

  async modemsDe(): Promise<{
    producto: string;
    codigo: string;
    existencia: number;
    equipos: Array<{
      odooId: number;
      serie: string;
      cantidad: number;
      movimientos: Array<{ odooId: number; fecha: string; referencia: string; desde: string; hacia: string; cantidad: number; estado: string }>;
    }>;
    chipPorOrden: Record<string, string>;
    aviso: string;
  }> {
    const config = await this.config();
    if (!config) throw new BadRequestException('Odoo no está conectado.');
    const uid = await autenticar(config);
    const metaProducto = await camposDe(config, uid, 'product.product');
    const productos = await buscar(config, uid, 'product.product', [['default_code', '=', 'INDND7509']], presentes(metaProducto, ['name', 'default_code', 'qty_available']), 1);
    const producto = productos[0];
    if (!producto) throw new BadRequestException('Odoo no tiene el producto USR-G786-G (INDND7509).');
    const productoId = Number(producto.id);
    const metaLote = await camposDe(config, uid, 'stock.lot');
    const lotes = await buscar(config, uid, 'stock.lot', [['product_id', '=', productoId]], presentes(metaLote, ['name', 'product_qty']), 1000);
    const metaLinea = await camposDe(config, uid, 'stock.move.line');
    const lineas = await buscar(
      config,
      uid,
      'stock.move.line',
      [['product_id', '=', productoId]],
      presentes(metaLinea, ['date', 'reference', 'lot_id', 'location_id', 'location_dest_id', 'qty_done', 'quantity', 'state']),
      1000,
    );
    const porLote = new Map<number, Array<{ odooId: number; fecha: string; referencia: string; desde: string; hacia: string; cantidad: number; estado: string }>>();
    for (const linea of lineas) {
      const loteId = idRelacion(linea.lot_id);
      if (!loteId) continue;
      const lista = porLote.get(loteId) ?? [];
      lista.push({
        odooId: Number(linea.id),
        fecha: String(linea.date ?? ''),
        referencia: String(linea.reference ?? ''),
        desde: textoRelacion(linea.location_id),
        hacia: textoRelacion(linea.location_dest_id),
        cantidad: Number(linea.qty_done ?? linea.quantity ?? 0),
        estado: String(linea.state ?? ''),
      });
      porLote.set(loteId, lista);
    }
    const ordenes = [...new Set(lineas.map((linea) => String(linea.reference ?? '')).filter((referencia) => referencia.includes('/MO/')))];
    const chipPorOrden: Record<string, string> = {};
    if (ordenes.length) {
      const fabricaciones = await buscar(config, uid, 'mrp.production', [['name', 'in', ordenes]], ['name', 'lot_producing_id'], 200);
      for (const fabricacion of fabricaciones) chipPorOrden[String(fabricacion.name ?? '')] = textoRelacion(fabricacion.lot_producing_id);
    }
    return {
      producto: String(producto.name ?? '').replace(/\s+/g, ' ').trim(),
      codigo: String(producto.default_code ?? 'INDND7509'),
      existencia: Number(producto.qty_available ?? 0),
      equipos: lotes.map((lote) => ({
        odooId: Number(lote.id),
        serie: String(lote.name ?? ''),
        cantidad: Number(lote.product_qty ?? 0),
        movimientos: porLote.get(Number(lote.id)) ?? [],
      })),
      chipPorOrden,
      aviso: lotes.length >= 1000 || lineas.length >= 1000 ? 'La lectura llegó al tope de 1000. Puede faltar una parte.' : '',
    };
  }

  private async nombresDeLote(config: LecturaOdoo, uid: number, ids: number[]): Promise<Map<number, string>> {
    const nombres = new Map<number, string>();
    const unicos = [...new Set(ids)];
    for (const grupo of trozos(unicos, 80)) {
      const filas = await buscar(config, uid, 'stock.lot', [['id', 'in', grupo]], ['name'], 80);
      for (const fila of filas) nombres.set(Number(fila.id), String(fila.name ?? ''));
    }
    return nombres;
  }

  private async imagenesDe(config: LecturaOdoo, uid: number, notas: Record<string, unknown>[]): Promise<Map<number, { nombre: string; mime: string; datos: Buffer }>> {
    const ids = notas.flatMap((nota) => (Array.isArray(nota.attachment_ids) ? nota.attachment_ids.map(Number) : [])).filter((id) => id > 0);
    const mapa = new Map<number, { nombre: string; mime: string; datos: Buffer }>();
    for (const grupo of trozos(ids, 1)) {
      const filas = await buscar(config, uid, 'ir.attachment', [['id', 'in', grupo]], ['name', 'mimetype', 'datas', 'file_size'], 1, 60_000);
      for (const fila of filas) {
        const mime = String(fila.mimetype ?? '');
        const peso = Number(fila.file_size ?? 0);
        const datos = typeof fila.datas === 'string' ? fila.datas : '';
        if (!mime.startsWith('image/') || !datos || peso > 3_500_000) continue;
        mapa.set(Number(fila.id), { nombre: String(fila.name ?? 'imagen'), mime, datos: Buffer.from(datos, 'base64') });
      }
    }
    return mapa;
  }

  private async habilitada(tareaId: string): Promise<boolean> {
    const resultado = await this.conexiones.pg.query(`SELECT 1 FROM habilitado WHERE clase = 'tarea' AND clave = $1`, [tareaId]);
    return (resultado.rowCount ?? 0) > 0;
  }

  private async estaVieja(tareaId: string): Promise<boolean> {
    const resultado = await this.conexiones.pg.query<{ leido_en: Date; fallo_en: Date | null }>(
      `SELECT leido_en, fallo_en FROM lectura_odoo WHERE tarea_id = $1 AND clase = 'venta'`,
      [tareaId],
    );
    const fila = resultado.rows[0];
    if (!fila) return true;
    const marca = fila.fallo_en ?? fila.leido_en;
    return Date.now() - new Date(marca).getTime() > FRESCURA_MS;
  }

  private async elegido(tareaId: string, clase: 'venta' | 'ticket'): Promise<number | null> {
    const resultado = await this.conexiones.pg.query<{ odoo_id: number }>(`SELECT odoo_id FROM vinculo_odoo WHERE tarea_id = $1 AND clase = $2`, [tareaId, clase]);
    return resultado.rows[0]?.odoo_id ?? null;
  }

  private async copiaGuardada(tareaId: string, clase: 'venta' | 'ticket'): Promise<CopiaOdoo | null> {
    const resultado = await this.conexiones.pg.query<{ copia: CopiaOdoo | null }>(`SELECT copia FROM lectura_odoo WHERE tarea_id = $1 AND clase = $2`, [tareaId, clase]);
    return resultado.rows[0]?.copia ?? null;
  }

  private async guardado(tareaId: string): Promise<LecturaTarea | null> {
    const filas = await this.conexiones.pg.query<VistaOdoo & { clase: string }>(
      `SELECT clase, vinculo, odoo_id, estado, candidatos, copia, aviso, leido_en FROM lectura_odoo WHERE tarea_id = $1`,
      [tareaId],
    );
    const venta = filas.rows.find((fila) => fila.clase === 'venta') ?? null;
    const ticket = filas.rows.find((fila) => fila.clase === 'ticket') ?? null;
    if (!venta && !ticket) return null;
    const vacia = (): VistaOdoo => ({ vinculo: 'sin_vinculo', odoo_id: null, estado: null, candidatos: [], copia: null, aviso: null, leido_en: null });
    const lectura = { venta: normalizar(venta) ?? vacia(), ticket: normalizar(ticket) ?? vacia() };
    await this.asegurarDetectadas(tareaId, 'venta', lectura.venta.copia);
    await this.asegurarDetectadas(tareaId, 'ticket', lectura.ticket.copia);
    return { ...lectura, cambios: await this.cambios(tareaId) };
  }

  private async recordar(tareaId: string, clase: 'venta' | 'ticket', previa: CopiaOdoo | null, copia: CopiaOdoo): Promise<void> {
    const diferencias = diferenciasDe(previa, copia);
    if (previa) {
      if (diferencias.length === 0) return;
      await this.insertarCambio(tareaId, clase, cambiosDe(previa, copia), diferencias);
      return;
    }
    const fechas = fechasDe(copia);
    if (fechas.length === 0) return;
    await this.insertarCambio(tareaId, clase, 'Fechas detectadas en Odoo.', fechas.map((fecha) => ({ campo: fecha.campo, antes: '', despues: fecha.valor })));
  }

  private async asegurarDetectadas(tareaId: string, clase: 'venta' | 'ticket', copia: CopiaOdoo | null): Promise<void> {
    const fechas = fechasDe(copia);
    if (fechas.length === 0) return;
    const ya = await this.conexiones.pg.query(`SELECT 1 FROM cambio_odoo WHERE tarea_id = $1 AND clase = $2 LIMIT 1`, [tareaId, clase]);
    if (ya.rows[0]) return;
    await this.insertarCambio(tareaId, clase, 'Fechas detectadas en Odoo.', fechas.map((fecha) => ({ campo: fecha.campo, antes: '', despues: fecha.valor })));
  }

  private async insertarCambio(tareaId: string, clase: 'venta' | 'ticket', texto: string, detalle: DiferenciaOdoo[]): Promise<void> {
    if (!texto) return;
    await this.conexiones.pg.query(
      `INSERT INTO cambio_odoo (id, tarea_id, clase, texto, detalle) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), tareaId, clase, texto, JSON.stringify(detalle)],
    );
  }

  private async cambios(tareaId: string): Promise<CambioOdoo[]> {
    const filas = await this.conexiones.pg.query<CambioOdoo>(
      `SELECT clase, texto, detalle, creado_en FROM cambio_odoo WHERE tarea_id = $1 ORDER BY creado_en`,
      [tareaId],
    );
    return filas.rows.map((fila) => ({ ...fila, detalle: Array.isArray(fila.detalle) ? fila.detalle : [] }));
  }

  private async exito(
    tareaId: string,
    clase: 'venta' | 'ticket',
    vinculo: VinculoOdoo,
    odooId: number | null,
    estado: string | null,
    candidatos: DocumentoOdoo[],
    copia: CopiaOdoo | null,
    aviso: string | null,
  ): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO lectura_odoo (tarea_id, clase, vinculo, odoo_id, estado, candidatos, copia, aviso, leido_en, fallo_en)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now(), NULL)
       ON CONFLICT (tarea_id, clase) DO UPDATE
         SET vinculo = EXCLUDED.vinculo, odoo_id = EXCLUDED.odoo_id, estado = EXCLUDED.estado,
             candidatos = EXCLUDED.candidatos, copia = EXCLUDED.copia, aviso = EXCLUDED.aviso, leido_en = now(), fallo_en = NULL`,
      [tareaId, clase, vinculo, odooId, estado, JSON.stringify(candidatos), copia ? JSON.stringify(copia) : null, aviso],
    );
  }

  private async fallo(tareaId: string, clase: 'venta' | 'ticket', aviso: string): Promise<void> {
    await this.conexiones.pg.query(
      `INSERT INTO lectura_odoo (tarea_id, clase, vinculo, aviso, fallo_en)
       VALUES ($1, $2, 'sin_vinculo', $3, now())
       ON CONFLICT (tarea_id, clase) DO UPDATE SET aviso = EXCLUDED.aviso, fallo_en = now()`,
      [tareaId, clase, aviso.slice(0, 400)],
    );
  }
}

function textoRelacion(valor: unknown): string {
  return Array.isArray(valor) ? String(valor[1] ?? '') : '';
}

function idRelacion(valor: unknown): number {
  const id = Array.isArray(valor) ? Number(valor[0]) : 0;
  return Number.isInteger(id) ? id : 0;
}

function trozos<T>(lista: T[], tamano: number): T[][] {
  const grupos: T[][] = [];
  for (let indice = 0; indice < lista.length; indice += tamano) grupos.push(lista.slice(indice, indice + tamano));
  return grupos;
}

export function armar(entrada: {
  url?: string;
  db?: string;
  usuario?: string;
  clave?: string;
  modeloVenta?: string;
  campoCot?: string;
  modeloTarea?: string;
  modelo_venta?: string;
  campo_cot?: string;
  modelo_tarea?: string;
  sesionUsuario?: string;
  sesionClave?: string;
  sesion_usuario?: string;
  sesion_clave?: string;
}): LecturaOdoo | null {
  const url = (entrada.url ?? '').trim().replace(/\/$/, '');
  const db = (entrada.db ?? '').trim();
  const usuario = (entrada.usuario ?? '').trim();
  const clave = (entrada.clave ?? '').trim();
  if (!url || !db || !usuario || !clave) return null;
  const sesionUsuario = (entrada.sesionUsuario ?? entrada.sesion_usuario ?? '').trim();
  const sesionClave = (entrada.sesionClave ?? entrada.sesion_clave ?? '').trim();
  return {
    url,
    db,
    usuario,
    clave,
    venta: {
      modelo: modeloValido(entrada.modeloVenta ?? entrada.modelo_venta) || 'sale.order',
      campo: campoValido(entrada.campoCot ?? entrada.campo_cot) || 'name',
    },
    tarea: { modelo: modeloValido(entrada.modeloTarea ?? entrada.modelo_tarea) || 'project.task' },
    ...(sesionUsuario && sesionClave ? { sesion: { usuario: sesionUsuario, clave: sesionClave } } : {}),
  };
}

function publicaDe(config: LecturaOdoo | FilaConfig, origen: 'pantalla' | 'entorno'): PublicaOdoo {
  const leida = 'venta' in config ? config : armar(config);
  return {
    url: leida?.url ?? '',
    db: leida?.db ?? '',
    usuario: leida?.usuario ?? '',
    clavePuesta: Boolean(leida?.clave),
    sesionUsuario: leida?.sesion?.usuario ?? ('sesion_usuario' in config ? config.sesion_usuario : ''),
    sesionClavePuesta: Boolean(leida?.sesion?.clave || ('sesion_clave' in config && config.sesion_clave)),
    modeloVenta: leida?.venta.modelo ?? 'sale.order',
    campoCot: leida?.venta.campo ?? 'name',
    modeloTarea: leida?.tarea.modelo ?? 'project.task',
    origen,
  };
}

function documentoDe(fila: Record<string, unknown>, meta: Record<string, MetaCampo>, campoEstado: string): DocumentoOdoo {
  return {
    id: Number(fila.id),
    estado: etiquetaCampo(meta[campoEstado], fila[campoEstado]),
    nombre: fila.name == null || fila.name === false ? '' : String(fila.name),
  };
}

function seleccionesDe(meta: Record<string, MetaCampo>): string[] {
  return Object.entries(meta)
    .filter(([, dato]) => dato.type === 'selection' && /estado|factura|entrega|renov/i.test(dato.string ?? ''))
    .map(([campo]) => campo)
    .slice(0, 4);
}

function normalizar(fila: (VistaOdoo & { clase: string }) | null): VistaOdoo | null {
  if (!fila) return null;
  return {
    vinculo: fila.vinculo,
    odoo_id: fila.odoo_id,
    estado: fila.estado,
    candidatos: Array.isArray(fila.candidatos) ? fila.candidatos : [],
    copia: fila.copia ?? null,
    aviso: fila.aviso,
    leido_en: fila.leido_en,
  };
}

function avisoDe(error: unknown, clave: string): string {
  const texto = error instanceof Error ? error.message : 'Odoo no respondió.';
  return (clave ? texto.split(clave).join('clave') : texto).slice(0, 400);
}

export class PulsoOdoo {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ocupado = false;

  constructor(private readonly conexiones: Conexiones) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.correr();
    }, 180_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async correr(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      await new OdooServicio(this.conexiones).pulsar();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'falló la lectura de Odoo';
      console.error(`Odoo: ${mensaje}`);
    } finally {
      this.ocupado = false;
    }
  }
}
