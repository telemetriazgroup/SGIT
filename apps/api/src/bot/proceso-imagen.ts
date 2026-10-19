export type ClaseCodigo = 'contenedor' | 'serie' | 'otro';

export type PropuestaImagen = {
  imagenId: string;
  codigo: string | null;
  tipo: string;
  confianza: number;
};

export function claseDe(tipo: string, codigo: string): ClaseCodigo {
  const clase = tipo.trim().toUpperCase();
  const limpio = codigo.replace(/[\s\-_]+/g, '').toUpperCase();
  if (clase === 'ZGRU' || limpio.startsWith('ZGRU')) return 'contenedor';
  if (clase === 'SERIAL' || /^(E0|CIM|MMAU|MNBU|SC)/.test(limpio)) return 'serie';
  return 'otro';
}

export function asumirZgru(codigo: string | null, clase: ClaseCodigo): { codigo: string | null; asumido: boolean } {
  const limpio = codigo?.replace(/[\s\-_]+/g, '').toUpperCase() || null;
  if (!limpio || clase !== 'contenedor') return { codigo: limpio, asumido: false };
  if (limpio.startsWith('ZGRU')) return { codigo: limpio, asumido: false };
  if (/^\d{5,12}$/.test(limpio)) return { codigo: `ZGRU${limpio}`, asumido: true };
  return { codigo: limpio, asumido: false };
}

export function codigoContado(ocr: string | null, aprendido: string | null): { codigo: string | null; corregido: boolean } {
  const leido = ocr?.trim() || null;
  const firme = aprendido?.trim() || null;
  if (!firme || !leido || firme.toUpperCase() === leido.toUpperCase()) return { codigo: leido, corregido: false };
  return { codigo: firme, corregido: true };
}

export function presentarLectura(orden: number, tipo: string, crudo: string | null, firme: string | null): string {
  const contado = codigoContado(crudo, firme);
  const clase = claseDe(tipo, contado.codigo ?? crudo ?? '');
  const puesto = asumirZgru(contado.codigo, clase);
  const crudoLimpio = crudo?.replace(/[\s\-_]+/g, '').toUpperCase() || null;
  const asumido = puesto.asumido && !contado.corregido;
  const mismaCifra = Boolean(crudoLimpio && puesto.codigo === `ZGRU${crudoLimpio}`);
  return lineaLectura(orden, clase, puesto.codigo, crudo, contado.corregido && !mismaCifra, asumido || mismaCifra);
}

export function lineaLectura(orden: number, clase: ClaseCodigo, codigo: string | null, crudo: string | null, corregido: boolean, asumido = false): string {
  const nombre = clase === 'contenedor' ? 'Contenedor' : clase === 'serie' ? 'Serie de máquina' : 'Código';
  if (!codigo) return `${orden}. Sin código legible.`;
  if (asumido && crudo && crudo.replace(/[\s\-_]+/g, '').toUpperCase() !== codigo.toUpperCase()) {
    return `${orden}. ${nombre} ${codigo}. El lector vio ${crudo.trim()} y se asumió ZGRU.`;
  }
  if (corregido && crudo && crudo.toUpperCase() !== codigo.toUpperCase()) {
    return `${orden}. ${nombre} ${codigo}. El lector dijo ${crudo} y ya se había corregido.`;
  }
  return `${orden}. ${nombre} ${codigo}.`;
}

export async function proponerImagen(archivo: { nombre: string; mime: string; contenido: Buffer }): Promise<PropuestaImagen | null> {
  const base = (process.env.PROCESO_IMAGEN_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const cuerpo = new FormData();
  cuerpo.append('file', new Blob([new Uint8Array(archivo.contenido)], { type: archivo.mime }), archivo.nombre || 'foto.jpg');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 25_000);
  try {
    const respuesta = await fetch(`${base}/api/imagenes`, { method: 'POST', body: cuerpo, signal: control.signal });
    if (!respuesta.ok) return null;
    const dato = (await respuesta.json()) as {
      imagen_id?: string;
      codigo_propuesto?: string | null;
      tipo?: string;
      confianza?: number;
      sin_deteccion?: boolean;
    };
    if (!dato.imagen_id) return null;
    const codigo = dato.sin_deteccion ? null : dato.codigo_propuesto?.trim() || null;
    return { imagenId: dato.imagen_id, codigo, tipo: dato.tipo || 'MANUAL', confianza: Number(dato.confianza ?? 0) };
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

export async function textoDeImagen(archivo: { nombre: string; mime: string; contenido: Buffer }): Promise<string | null> {
  const base = (process.env.PROCESO_IMAGEN_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const oficial = await enviarImagen(base, '/api/ocr?caso=chip', archivo, 45_000);
  const leido = oficial ? textoLectorChip(oficial) : '';
  if (leido.trim()) return leido;
  const piloto = await enviarImagen(base, '/api/piloto/analizar', archivo, 40_000);
  const respaldo = piloto ? textoPiloto(piloto) : '';
  if (respaldo.trim()) return respaldo;
  return null;
}

async function enviarImagen(base: string, ruta: string, archivo: { nombre: string; mime: string; contenido: Buffer }, espera: number): Promise<unknown> {
  const cuerpo = new FormData();
  cuerpo.append('file', new Blob([new Uint8Array(archivo.contenido)], { type: archivo.mime }), archivo.nombre || 'chip.jpg');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const respuesta = await fetch(`${base}${ruta}`, { method: 'POST', body: cuerpo, signal: control.signal });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

function textoLectorChip(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const fila = dato as { codigo?: unknown; numeros?: unknown; fragmentos?: unknown; bloques?: unknown; tipo?: unknown };
  const numeros = Array.isArray(fila.numeros) ? fila.numeros.map(String) : [];
  const fragmentos = Array.isArray(fila.fragmentos) ? fila.fragmentos.map(String) : [];
  const bloques = Array.isArray(fila.bloques)
    ? fila.bloques.flatMap((bloque) => (bloque && typeof bloque === 'object' && 'texto' in bloque ? [String(bloque.texto ?? '')] : []))
    : [];
  return [String(fila.tipo ?? ''), String(fila.codigo ?? ''), ...numeros, ...fragmentos, ...bloques].filter((parte) => parte && parte !== 'null').join('\n');
}

function textoPiloto(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const fila = dato as { numeros_detectados?: unknown; texto_completo?: unknown; bloques?: unknown };
  const numeros = Array.isArray(fila.numeros_detectados) ? fila.numeros_detectados.map(String) : [];
  const bloques = Array.isArray(fila.bloques)
    ? fila.bloques.flatMap((bloque) => (bloque && typeof bloque === 'object' && 'texto' in bloque ? [String(bloque.texto ?? '')] : []))
    : [];
  return [String(fila.texto_completo ?? ''), ...numeros, ...bloques].filter(Boolean).join('\n');
}

function textosDe(valor: unknown): string[] {
  if (typeof valor === 'string' || typeof valor === 'number') return [String(valor)];
  if (Array.isArray(valor)) return valor.flatMap((item) => textosDe(item));
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap((item) => textosDe(item));
  return [];
}

export async function confirmarImagen(imagenId: string, codigo: string, tipo: string): Promise<boolean> {
  const base = (process.env.PROCESO_IMAGEN_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 15_000);
  try {
    const respuesta = await fetch(`${base}/api/registros`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imagen_id: imagenId, codigo, tipo }),
      signal: control.signal,
    });
    return respuesta.ok || respuesta.status === 409;
  } catch {
    return false;
  } finally {
    clearTimeout(reloj);
  }
}
