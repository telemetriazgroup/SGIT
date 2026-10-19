export type DocumentoOdoo = { id: number; estado: string; nombre: string };

export type VinculoOdoo = 'unico' | 'sin_vinculo' | 'ambiguo';

export type MetaCampo = { string?: string; type?: string; selection?: Array<[string, string]> };

export type LineaOdoo = {
  nombre: string;
  producto: string;
  tipo: string;
  equipo: string;
  cantidad: number | null;
  entregada: number | null;
  facturada: number | null;
  precio: string;
  descuento: string;
  importe: string;
};

export type FichaCampo = { nombre: string; valor: string; lado: 'izq' | 'der' };

export type NotaOdoo = { fecha: string; autor: string; texto: string };

export type CopiaOdoo = {
  nombre: string;
  cliente: string;
  estado: string;
  factura: string;
  entrega: string;
  total: string;
  nota: string;
  lineas: LineaOdoo[];
  notas: NotaOdoo[];
  ficha: FichaCampo[];
  pasos: string[];
  paso: string;
  cinta: string;
};

export function resolverBusqueda(filas: DocumentoOdoo[]): { vinculo: VinculoOdoo; documento: DocumentoOdoo | null; candidatos: DocumentoOdoo[] } {
  const lista = unicos(filas);
  if (lista.length === 0) return { vinculo: 'sin_vinculo', documento: null, candidatos: [] };
  if (lista.length === 1) return { vinculo: 'unico', documento: lista[0], candidatos: [] };
  return { vinculo: 'ambiguo', documento: null, candidatos: lista };
}

export function elegirServicio(
  filas: DocumentoOdoo[],
  cots: string[],
  tickets: string[],
): { vinculo: VinculoOdoo; documento: DocumentoOdoo | null; candidatos: DocumentoOdoo[] } {
  const lista = unicos(filas);
  const conCot = lista.filter((fila) => cots.some((cot) => incluyeNumero(fila.nombre, cot)));
  const conAmbos = conCot.filter((fila) => tickets.some((ticket) => incluyeNumero(fila.nombre, ticket)));
  if (conAmbos.length === 1) return { vinculo: 'unico', documento: conAmbos[0], candidatos: [] };
  if (conCot.length === 1) return { vinculo: 'unico', documento: conCot[0], candidatos: [] };
  return resolverBusqueda(lista);
}

export function numerosDe(texto: string | null | undefined): string[] {
  const hallados = String(texto ?? '').match(/\d{4,}/g) ?? [];
  return [...new Set(hallados)];
}

export function cotsDe(texto: string | null | undefined): string[] {
  return numerosDe(texto).filter((numero) => numero.length >= 8);
}

export function incluyeNumero(texto: string, numero: string): boolean {
  if (!numero) return false;
  return new RegExp(`(^|\\D)${numero}(\\D|$)`).test(texto);
}

export function modeloValido(valor: string | undefined): string {
  const texto = (valor ?? '').trim();
  if (!/^[a-z][a-z0-9_.]{0,63}$/.test(texto) || !texto.includes('.')) return '';
  return texto;
}

export function campoValido(valor: string | undefined): string {
  const texto = (valor ?? '').trim();
  if (!/^[a-z_][a-z0-9_]{0,63}$/.test(texto)) return '';
  return texto;
}

export function dominioO(clausulas: unknown[][]): unknown[] {
  const utiles = clausulas.filter((clausula) => clausula.length > 0);
  if (utiles.length === 0) return [];
  if (utiles.length === 1) return [utiles[0]];
  const dominio: unknown[] = [];
  for (let i = 0; i < utiles.length - 1; i += 1) dominio.push('|');
  return dominio.concat(utiles);
}

export function textoPlano(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCharCode(Number(codigo)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function etiquetaCampo(meta: MetaCampo | undefined, valor: unknown): string {
  if (valor == null || valor === false) return '';
  if (Array.isArray(valor)) return valor.length >= 2 ? String(valor[1] ?? '') : '';
  const texto = String(valor);
  const opcion = meta?.selection?.find((par) => par[0] === texto);
  return opcion ? String(opcion[1]) : texto;
}

export function armarVenta(
  meta: Record<string, MetaCampo>,
  orden: Record<string, unknown>,
  lineas: Record<string, unknown>[],
  mensajes: Record<string, unknown>[],
  partner?: Record<string, unknown> | null,
): CopiaOdoo {
  const filas = lineas.map(lineaDe);
  const entregaCampo = etiquetaConocida('delivery_status', orden.delivery_status, meta.delivery_status);
  const estado = etiquetaConocida('state', orden.state, meta.state);
  const pasos = pasosDe(meta.state);
  const clave = texto(orden.state);
  return {
    nombre: texto(orden.name),
    cliente: etiquetaCampo(meta.partner_id, orden.partner_id),
    estado,
    factura: etiquetaConocida('invoice_status', orden.invoice_status, meta.invoice_status),
    entrega: entregaCampo || entregaDeLineas(filas),
    total: totalDe(orden),
    nota: textoPlano(texto(orden.note)),
    lineas: filas,
    notas: notasDe(mensajes),
    ficha: fichaVenta(meta, orden, partner ?? null),
    pasos,
    paso: estado,
    cinta: clave === 'cancel' || clave === 'done' ? estado : '',
  };
}

export function armarTarea(meta: Record<string, MetaCampo>, tarea: Record<string, unknown>, mensajes: Record<string, unknown>[]): CopiaOdoo {
  const etapa = etiquetaCampo(meta.stage_id, tarea.stage_id);
  const inicio = texto(tarea.planned_date_begin);
  const fin = texto(tarea.date_deadline);
  const cuando = [inicio, fin].filter(Boolean).join(' – ');
  return {
    nombre: texto(tarea.name),
    cliente: etiquetaCampo(meta.partner_id, tarea.partner_id),
    estado: etapa,
    factura: '',
    entrega: cuando,
    total: '',
    nota: textoPlano(texto(tarea.description)),
    lineas: [],
    notas: notasDe(mensajes),
    ficha: fichaTarea(meta, tarea),
    pasos: [],
    paso: etapa,
    cinta: '',
  };
}

export function entregaDeLineas(lineas: LineaOdoo[]): string {
  const conCantidad = lineas.filter((linea) => linea.cantidad != null && linea.cantidad > 0);
  if (conCantidad.length === 0) return '';
  const entregadas = conCantidad.filter((linea) => (linea.entregada ?? 0) > 0);
  if (entregadas.length === 0) return 'Sin entrega';
  const completa = conCantidad.every((linea) => (linea.entregada ?? 0) >= (linea.cantidad ?? 0));
  return completa ? 'Entregado' : 'Entrega parcial';
}

export type DiferenciaOdoo = { campo: string; antes: string; despues: string };

const CAMPOS_FECHA = ['Fecha de la orden', 'Validez', 'Tiempo de entrega', 'Lugar de entrega', 'Inicio planeado', 'Fin planeado'];

export function fechasDe(copia: CopiaOdoo | null): Array<{ campo: string; valor: string }> {
  if (!copia) return [];
  return copia.ficha.filter((campo) => CAMPOS_FECHA.includes(campo.nombre)).map((campo) => ({ campo: campo.nombre, valor: campo.valor }));
}

export function diferenciasDe(antes: CopiaOdoo | null, despues: CopiaOdoo): DiferenciaOdoo[] {
  if (!antes) return [];
  const lista: DiferenciaOdoo[] = [];
  const poner = (campo: string, anterior: string, siguiente: string) => {
    const viejo = anterior.trim();
    const nuevo = siguiente.trim();
    if (viejo === nuevo || lista.some((fila) => fila.campo === campo)) return;
    lista.push({ campo, antes: viejo || '—', despues: nuevo || '—' });
  };
  poner('Estado', antes.estado, despues.estado);
  poner('Facturación', antes.factura, despues.factura);
  poner('Entrega', antes.entrega, despues.entrega);
  if (antes.notas.length !== despues.notas.length) poner('Notas', String(antes.notas.length), String(despues.notas.length));
  const facturaLinea = antes.lineas.map((linea) => linea.facturada ?? '').join(',') !== despues.lineas.map((linea) => linea.facturada ?? '').join(',');
  const entregaLinea = antes.lineas.map((linea) => linea.entregada ?? '').join(',') !== despues.lineas.map((linea) => linea.entregada ?? '').join(',');
  if (facturaLinea && !lista.some((fila) => fila.campo === 'Facturación')) {
    lista.push({ campo: 'Facturación', antes: antes.factura || '—', despues: 'Cambiaron las cantidades facturadas.' });
  }
  if (entregaLinea && !lista.some((fila) => fila.campo === 'Entrega')) {
    lista.push({ campo: 'Entrega', antes: antes.entrega || '—', despues: 'Cambiaron las cantidades entregadas.' });
  }
  const vieja = new Map(antes.ficha.map((campo) => [campo.nombre, campo.valor]));
  const nueva = new Map(despues.ficha.map((campo) => [campo.nombre, campo.valor]));
  for (const nombre of new Set([...vieja.keys(), ...nueva.keys()])) {
    if (nombre === 'Facturación' || nombre === 'Entrega') continue;
    poner(nombre, vieja.get(nombre) ?? '', nueva.get(nombre) ?? '');
  }
  return lista;
}

export function cambiosDe(antes: CopiaOdoo | null, despues: CopiaOdoo): string {
  const partes = diferenciasDe(antes, despues).map((fila) => etiquetaCambio(fila.campo));
  return partes.length > 0 ? `Cambió ${partes.join(', ')}.` : '';
}

function etiquetaCambio(campo: string): string {
  if (campo === 'Facturación') return 'la facturación';
  if (campo === 'Entrega') return 'la entrega';
  if (campo === 'Estado') return 'el estado';
  if (campo === 'Notas') return 'las notas';
  return campo.toLowerCase();
}

export function resumenDe(copia: CopiaOdoo): string {
  return [copia.estado, copia.factura, copia.entrega, copia.total].filter(Boolean).join(' · ');
}

function unicos(filas: DocumentoOdoo[]): DocumentoOdoo[] {
  const mapa = new Map<number, DocumentoOdoo>();
  for (const fila of filas) {
    if (!Number.isInteger(fila.id)) continue;
    mapa.set(fila.id, { id: fila.id, estado: String(fila.estado ?? ''), nombre: String(fila.nombre ?? '') });
  }
  return [...mapa.values()];
}

function lineaDe(fila: Record<string, unknown>): LineaOdoo {
  const producto = fila.product_id;
  const descuento = numero(fila.discount);
  return {
    nombre: texto(fila.name),
    producto: Array.isArray(producto) ? String(producto[1] ?? '') : '',
    tipo: texto(fila.tipo),
    equipo: texto(fila.equipo),
    cantidad: numero(fila.product_uom_qty),
    entregada: numero(fila.qty_delivered),
    facturada: numero(fila.qty_invoiced),
    precio: dinero(fila.price_unit),
    descuento: descuento != null && descuento !== 0 ? `${descuento}%` : '',
    importe: dinero(fila.price_subtotal),
  };
}

function fichaVenta(meta: Record<string, MetaCampo>, orden: Record<string, unknown>, partner: Record<string, unknown> | null): FichaCampo[] {
  const valores: Record<string, string> = {
    direccion: direccionDe(partner),
    vat: texto(partner?.vat),
  };
  const campos: Array<[string, string, 'izq' | 'der']> = [
    ['partner_id', 'Cliente', 'izq'],
    ['direccion', 'Dirección', 'izq'],
    ['vat', 'RUC', 'izq'],
    ['x_studio_contacto', 'Contacto', 'izq'],
    ['x_studio_correo', 'Correo', 'izq'],
    ['x_studio_celular', 'Celular', 'izq'],
    ['x_studio_telefono', 'Teléfono', 'izq'],
    ['x_studio_asunto_cotizacion', 'Asunto', 'izq'],
    ['x_studio_tiempo_de_entrega', 'Tiempo de entrega', 'izq'],
    ['x_studio_lugar_de_entrega', 'Lugar de entrega', 'izq'],
    ['partner_invoice_id', 'Dirección de factura', 'izq'],
    ['partner_shipping_id', 'Dirección de entrega', 'izq'],
    ['date_order', 'Fecha de la orden', 'der'],
    ['validity_date', 'Validez', 'der'],
    ['user_id', 'Vendedor', 'der'],
    ['pricelist_id', 'Lista de precios', 'der'],
    ['payment_term_id', 'Términos de pago', 'der'],
    ['client_order_ref', 'Orden de compra', 'der'],
    ['x_studio_estado_de_alquiler', 'Estado de alquiler', 'der'],
    ['invoice_status', 'Facturación', 'der'],
    ['delivery_status', 'Entrega', 'der'],
    ['x_studio_leasing', 'Leasing', 'der'],
    ['x_studio_cliente_leasing', 'Cliente leasing', 'der'],
    ['x_studio_aplica_parte_de_horas', 'Parte de horas', 'der'],
    ['x_studio_cantidad_de_horas', 'Horas mínimas', 'der'],
    ['x_studio_libre_costo_de_manipuleo', 'Libre costo de manipuleo', 'der'],
    ['x_studio_imagen_garantia', 'Garantía', 'der'],
    ['amount_untaxed', 'Base imponible', 'der'],
    ['amount_total', 'Total', 'der'],
  ];
  return campos.flatMap(([campo, nombre, lado]) => {
    const valor = campo in valores ? valores[campo] : presentar(meta[campo], orden[campo], campo === 'amount_total' || campo === 'amount_untaxed' ? monedaDe(orden) : '', campo);
    return valor ? [{ nombre, valor, lado }] : [];
  });
}

function fichaTarea(meta: Record<string, MetaCampo>, tarea: Record<string, unknown>): FichaCampo[] {
  const campos: Array<[string, string, 'izq' | 'der']> = [
    ['partner_id', 'Cliente', 'izq'],
    ['partner_phone', 'Teléfono', 'izq'],
    ['project_id', 'Proyecto', 'izq'],
    ['stage_id', 'Etapa', 'izq'],
    ['x_sale_order_id', 'Orden de venta', 'izq'],
    ['sale_order_id', 'Orden de venta', 'izq'],
    ['x_sale_order_line_id', 'Línea de orden', 'der'],
    ['sale_line_id', 'Línea de orden', 'der'],
    ['x_studio_many2one_field_808_1jg8aj8u7', 'Producto', 'der'],
    ['x_equipo', 'Serie / lote', 'der'],
    ['allocated_hours', 'Tiempo asignado', 'der'],
    ['user_names', 'Asignados', 'der'],
    ['planned_date_begin', 'Inicio planeado', 'der'],
    ['date_deadline', 'Fin planeado', 'der'],
  ];
  const vistos = new Set<string>();
  return campos.flatMap(([campo, nombre, lado]) => {
    if (vistos.has(nombre)) return [];
    const valor = presentar(meta[campo], tarea[campo], '');
    if (!valor) return [];
    vistos.add(nombre);
    return [{ nombre, valor, lado }];
  });
}

function presentar(meta: MetaCampo | undefined, valor: unknown, moneda: string, campo = ''): string {
  if (typeof valor === 'boolean') return valor ? 'Sí' : '';
  if (typeof valor === 'number') return moneda ? dinero(valor, moneda) : String(valor);
  return etiquetaConocida(campo, valor, meta);
}

const ETIQUETAS: Record<string, Record<string, string>> = {
  state: { draft: 'Cotización', sent: 'Cotización enviada', sale: 'Orden de venta', done: 'Bloqueado', cancel: 'Cancelado' },
  invoice_status: { no: 'Nada que facturar', 'to invoice': 'Por facturar', invoiced: 'Facturado', upselling: 'Oportunidad de venta adicional' },
  delivery_status: { pending: 'Sin entrega', started: 'Entrega iniciada', partial: 'Entrega parcial', full: 'Entregado' },
};

function etiquetaConocida(campo: string, valor: unknown, meta: MetaCampo | undefined): string {
  const clave = typeof valor === 'string' ? valor : '';
  return ETIQUETAS[campo]?.[clave] || etiquetaCampo(meta, valor);
}

function direccionDe(partner: Record<string, unknown> | null): string {
  if (!partner) return '';
  const estado = Array.isArray(partner.state_id) ? String(partner.state_id[1] ?? '') : '';
  const pais = Array.isArray(partner.country_id) ? String(partner.country_id[1] ?? '') : '';
  return [partner.street, partner.street2, partner.city, estado, partner.zip, pais].map((parte) => texto(parte)).filter(Boolean).join(', ');
}

function pasosDe(estado: MetaCampo | undefined): string[] {
  const conocidos = (estado?.selection ?? []).map((par) => ETIQUETAS.state[par[0]]).filter((etiqueta) => etiqueta && etiqueta !== 'Cancelado' && etiqueta !== 'Bloqueado');
  return conocidos.length > 0 ? conocidos : ['Cotización', 'Cotización enviada', 'Orden de venta'];
}

function monedaDe(orden: Record<string, unknown>): string {
  return Array.isArray(orden.currency_id) ? String(orden.currency_id[1] ?? '') : '';
}

function dinero(valor: unknown, moneda = ''): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '';
  return [valor.toFixed(2), moneda].filter(Boolean).join(' ');
}

function notasDe(mensajes: Record<string, unknown>[]): NotaOdoo[] {
  return mensajes.flatMap((mensaje) => {
    const textoNota = textoPlano(texto(mensaje.body) || texto(mensaje.subject)).slice(0, 500);
    if (!textoNota) return [];
    const autor = mensaje.author_id;
    return [{ fecha: texto(mensaje.date), autor: Array.isArray(autor) ? String(autor[1] ?? '') : '', texto: textoNota }];
  });
}

function totalDe(orden: Record<string, unknown>): string {
  const monto = numero(orden.amount_total);
  if (monto == null) return '';
  const moneda = orden.currency_id;
  const nombre = Array.isArray(moneda) ? String(moneda[1] ?? '') : '';
  return [monto.toFixed(2), nombre].filter(Boolean).join(' ');
}

function numero(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return valor;
}

function texto(valor: unknown): string {
  if (valor == null || valor === false) return '';
  return String(valor);
}
