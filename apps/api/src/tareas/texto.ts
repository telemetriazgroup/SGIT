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
  const sumar = (cot?: string) => {
    if (cot && cot.length >= 6 && !vistos.includes(cot)) vistos.push(cot);
  };
  for (const coincidencia of asunto.matchAll(/cotizaci[oó]n\s*n[°ºo.]?\s*[:.]?\s*(\d{6,})/gi)) sumar(coincidencia[1]);
  for (const coincidencia of asunto.matchAll(/\bcot\s*[:.\-]*\s*(\d{6,})/gi)) sumar(coincidencia[1]);
  for (const coincidencia of asunto.matchAll(/(?<!\d)(1002\d{7})(?!\d)/g)) sumar(coincidencia[1]);
  return vistos;
}

export function sinCabeceras(texto: string): string {
  const lineas = texto.split(/\r?\n/);
  const salida: string[] = [];
  let modo: 'no' | 'direccion' | 'asunto' = 'no';
  for (const linea of lineas) {
    const visible = linea.replace(/^(?:>+\s*)+/, '').replace(/\*/g, '').trim();
    if (/^(de|from|para|to|cc|cco|bcc|enviado(?:\s+el)?|sent|date|asunto|subject)\s*:/i.test(visible)) {
      modo = /^(asunto|subject)\s*:/i.test(visible) ? 'asunto' : 'direccion';
      continue;
    }
    if (modo === 'direccion') {
      if (!visible) {
        modo = 'no';
        salida.push(linea);
        continue;
      }
      if (/@|[<>]/.test(visible) || /;\s*$/.test(visible)) continue;
      modo = 'no';
    } else if (modo === 'asunto') {
      if (!visible) {
        modo = 'no';
        salida.push(linea);
        continue;
      }
      if (/^(estimado|estimada|buenos|buenas|hola|saludos|favor|adjunto)\b/i.test(visible)) modo = 'no';
      else if (visible.length < 160) continue;
      else modo = 'no';
    }
    salida.push(linea);
  }
  return salida.join('\n');
}

export function textoParaDiccionario(asunto: string, cuerpo: string): string {
  const sinCorreo = sinCabeceras(`${asunto}\n${cuerpo}`)
    .replace(/<mailto:[^>]+>/gi, ' ')
    .replace(/[a-z0-9._+-]+@[a-z0-9.-]+/gi, ' ');
  return sinCorreo
    .split(/\r?\n/)
    .filter((linea) => {
      const visible = linea.replace(/^(?:>+\s*)+/, '').replace(/\*/g, '').trim();
      if (/^(de|from|para|to|cc|cco|bcc)\s*:/i.test(visible)) return false;
      const limpio = plano(linea);
      return limpio !== 'ztrack' && limpio !== 'ztrack telemetry' && limpio !== 'ztrack telemetria';
    })
    .join('\n');
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

const MESES_FECHA: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function normalizarFecha(fragmento: string): { valor: string | null; iso: string | null } {
  const numerica = fragmento.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (numerica) return fechaValida(Number(numerica[1]), Number(numerica[2]), Number(numerica[3]));
  const escrita = fragmento.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})\b/i);
  if (!escrita) return { valor: null, iso: null };
  const mes = MESES_FECHA[plano(escrita[2])];
  if (!mes) return { valor: null, iso: null };
  return fechaValida(Number(escrita[1]), mes, Number(escrita[3]));
}

function fechaValida(dia: number, mes: number, anio: number): { valor: string | null; iso: string | null } {
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

export function referenciasDe(texto: string, terminos: string[]): string[] {
  const halladas: string[] = [];
  const ordenados = [...terminos].sort((a, b) => plano(b).length - plano(a).length);
  for (const termino of ordenados) {
    const frase = buscarFlexible(texto, termino);
    if (!frase) continue;
    if (halladas.some((previa) => plano(previa) === plano(frase))) continue;
    halladas.push(frase);
  }
  return halladas;
}

export function buscarFlexible(texto: string, termino: string): string | null {
  const vocal: Record<string, string> = { a: '[aáà]', e: '[eéè]', i: '[iíì]', o: '[oóò]', u: '[uúùü]', n: '[nñ]' };
  const patron = plano(termino)
    .split(' ')
    .filter(Boolean)
    .map((palabra) => [...palabra].map((letra) => vocal[letra] ?? letra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''))
    .join('\\s+');
  if (!patron) return null;
  return texto.match(new RegExp(patron, 'i'))?.[0] ?? null;
}
