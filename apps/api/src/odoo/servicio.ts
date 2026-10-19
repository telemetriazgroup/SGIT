import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { leerConfiguracion, type LecturaOdoo } from '../configuracion';
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
  modeloVenta: string;
  campoCot: string;
  modeloTarea: string;
  origen: 'pantalla' | 'entorno' | 'sin_conexion';
};

type FilaConfig = { url: string; db: string; usuario: string; clave: string; modelo_venta: string; campo_cot: string; modelo_tarea: string };
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
      modeloVenta: 'sale.order',
      campoCot: 'name',
      modeloTarea: 'project.task',
      origen: 'sin_conexion',
    };
  }

  async guardar(entrada: { url?: string; db?: string; usuario?: string; clave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string }): Promise<PublicaOdoo> {
    const previa = await this.fila();
    const entorno = leerConfiguracion().odoo;
    const clave = (entrada.clave ?? '').trim() || previa?.clave || entorno?.clave || '';
    const config = armar({
      url: entrada.url,
      db: entrada.db,
      usuario: entrada.usuario,
      clave,
      modeloVenta: entrada.modeloVenta,
      campoCot: entrada.campoCot,
      modeloTarea: entrada.modeloTarea,
    });
    if (!config) throw new BadRequestException('Faltan la dirección, la base, el usuario o la clave de API.');
    await this.conexiones.pg.query(
      `INSERT INTO configuracion_odoo (id, url, db, usuario, clave, modelo_venta, campo_cot, modelo_tarea, actualizado_en)
       VALUES (true, $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE
         SET url = EXCLUDED.url, db = EXCLUDED.db, usuario = EXCLUDED.usuario, clave = EXCLUDED.clave,
             modelo_venta = EXCLUDED.modelo_venta, campo_cot = EXCLUDED.campo_cot, modelo_tarea = EXCLUDED.modelo_tarea,
             actualizado_en = now()`,
      [config.url, config.db, config.usuario, config.clave, config.venta.modelo, config.venta.campo, config.tarea.modelo],
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
      `SELECT url, db, usuario, clave, modelo_venta, campo_cot, modelo_tarea FROM configuracion_odoo WHERE id = true`,
    );
    return resultado.rows[0] ?? null;
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
}): LecturaOdoo | null {
  const url = (entrada.url ?? '').trim().replace(/\/$/, '');
  const db = (entrada.db ?? '').trim();
  const usuario = (entrada.usuario ?? '').trim();
  const clave = (entrada.clave ?? '').trim();
  if (!url || !db || !usuario || !clave) return null;
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
  };
}

function publicaDe(config: LecturaOdoo | FilaConfig, origen: 'pantalla' | 'entorno'): PublicaOdoo {
  const leida = 'venta' in config ? config : armar(config);
  return {
    url: leida?.url ?? '',
    db: leida?.db ?? '',
    usuario: leida?.usuario ?? '',
    clavePuesta: Boolean(leida?.clave),
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
