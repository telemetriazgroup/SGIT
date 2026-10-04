export function plano(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cotsDe(asunto: string): string[] {
  const vistos: string[] = [];
  for (const coincidencia of asunto.matchAll(/cot\s*(\d+)/gi)) {
    const cot = coincidencia[1];
    if (cot && !vistos.includes(cot)) vistos.push(cot);
  }
  return vistos;
}

export function normalizarSeccion(linea: string): string | null {
  const titulo = plano(linea);
  if (titulo === 'ztrack') return 'ztrack';
  if (titulo === 'area tecnica') return 'area tecnica';
  if (titulo === 'despacho' || titulo === 'ssoma' || titulo === 'almacen' || titulo === 'transporte') return titulo;
  if (titulo === 'fecha y hora de entrega cliente') return 'entrega';
  return null;
}

export function normalizarHora(fragmento: string): string | null {
  const ampm = fragmento.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\b/i);
  if (ampm) {
    let hora = Number(ampm[1]);
    const minuto = Number(ampm[2] ?? '0');
    if (hora < 1 || hora > 12 || minuto > 59) return null;
    const meridiano = ampm[3].toLowerCase();
    if (meridiano === 'p' && hora < 12) hora += 12;
    if (meridiano === 'a' && hora === 12) hora = 0;
    return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
  }
  const reloj = fragmento.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!reloj) return null;
  const hora = Number(reloj[1]);
  const minuto = Number(reloj[2]);
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

export function normalizarFecha(fragmento: string): { valor: string | null; iso: string | null } {
  const coincidencia = fragmento.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!coincidencia) return { valor: null, iso: null };
  const dia = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const anio = Number(coincidencia[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return { valor: null, iso: null };
  const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const prueba = new Date(`${iso}T12:00:00-05:00`);
  if (Number.isNaN(prueba.getTime())) return { valor: null, iso: null };
  const leida = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(prueba);
  if (leida !== iso) return { valor: null, iso: null };
  return { valor: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`, iso };
}

export function contieneTermino(texto: string, termino: string): boolean {
  const aguja = plano(termino);
  if (!aguja) return false;
  return ` ${plano(texto)} `.includes(` ${aguja} `);
}
