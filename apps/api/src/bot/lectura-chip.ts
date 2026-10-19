export type ChipLeido = { imei: string; celular: string; estado: string; telemetria: string };
export type ChipHallado = { imei: string; celular: string; estado: string; telemetria: string; por: 'completo' | 'ultimos6' | 'fragmento'; pista: string };

export function imeisDeTexto(texto: string): string[] {
  const tramos = texto.match(/\d+/g) ?? [];
  const vistos = new Set<string>();
  const candidatos: string[] = [];
  const anotar = (valor: string) => {
    if (valor.length < 14 || valor.length > 22 || vistos.has(valor)) return;
    vistos.add(valor);
    candidatos.push(valor);
  };
  for (let indice = 0; indice < tramos.length; indice += 1) {
    if (!tramos[indice].startsWith('8951')) continue;
    if (tramos[indice].length >= 14) anotar(tramos[indice].slice(0, 22));
    let junto = tramos[indice];
    for (let siguiente = indice + 1; siguiente < tramos.length && junto.length < 19; siguiente += 1) {
      if (junto.length + tramos[siguiente].length > 22) break;
      junto += tramos[siguiente];
      if (junto.length >= 14) anotar(junto);
    }
  }
  return candidatos.sort((a, b) => preferencia(b) - preferencia(a) || b.length - a.length);
}

export function fragmentosDeTexto(texto: string): string[] {
  const tramos = texto.match(/\d+/g) ?? [];
  const vistos = new Set<string>();
  const fragmentos: string[] = [];
  const anotar = (valor: string) => {
    if (valor.length < 8 || valor.length > 13 || vistos.has(valor)) return;
    vistos.add(valor);
    fragmentos.push(valor);
  };
  for (let indice = 0; indice < tramos.length; indice += 1) {
    if (tramos[indice].startsWith('8951')) continue;
    anotar(tramos[indice]);
    const junto = `${tramos[indice]}${tramos[indice + 1] ?? ''}`;
    anotar(junto);
  }
  return fragmentos;
}

export function identificarChips(candidatos: string[], catalogo: ChipLeido[], fragmentos: string[] = []): { hallados: ChipHallado[]; desconocidos: string[] } {
  const hallados: ChipHallado[] = [];
  const desconocidos: string[] = [];
  const usados = new Set<string>();
  const anotar = (chip: ChipLeido, por: ChipHallado['por'], pista: string) => {
    if (usados.has(chip.imei)) return;
    usados.add(chip.imei);
    hallados.push({ ...chip, por, pista });
  };
  for (const candidato of candidatos) {
    const exacto = catalogo.find((chip) => chip.imei === candidato);
    if (exacto) {
      anotar(exacto, 'completo', candidato);
      continue;
    }
    const sufijo = candidato.slice(-6);
    const parecidos = catalogo.filter((chip) => chip.imei.endsWith(sufijo));
    if (parecidos.length === 1) {
      anotar(parecidos[0], 'ultimos6', sufijo);
      continue;
    }
    if (!desconocidos.includes(candidato)) desconocidos.push(candidato);
  }
  for (const fragmento of fragmentos) {
    const parecidos = catalogo.filter((chip) => chip.imei.includes(fragmento));
    if (parecidos.length === 1) anotar(parecidos[0], 'fragmento', fragmento);
    else if (parecidos.length > 1 && !desconocidos.includes(fragmento)) desconocidos.push(fragmento);
  }
  return { hallados, desconocidos };
}

export function textoChip(hallados: ChipHallado[], desconocidos: string[], ocultarResto = false): string {
  const lineas = hallados.map((chip) => {
    const via = chip.por === 'ultimos6' ? ' Lo reconocí por los últimos 6 dígitos del IMEI.' : chip.por === 'fragmento' ? ` Lo reconocí por ${chip.pista}, el número del recuadro.` : '';
    const ocupado = chip.estado === 'ocupado' ? ` Ese chip ya está ocupado${chip.telemetria ? ` en ${chip.telemetria}` : ''}.` : '';
    return `IMEI ${chip.imei}. Celular ${chip.celular}.${via}${ocupado}`;
  });
  if (desconocidos.length && !(ocultarResto && hallados.length > 0)) lineas.push(`Leí ${desconocidos.join(', ')} y no está en los chips cargados.`);
  return lineas.join('\n') || 'No pude identificar el chip.';
}

export function cierreFabricacion(hallados: ChipHallado[]): string {
  const usable = hallados.find((chip) => chip.estado !== 'ocupado');
  if (usable) return 'Queda listo para la orden de fabricación.';
  if (hallados.some((chip) => chip.estado === 'ocupado')) return 'Quedó registrado. No se envía a una orden de fabricación con un chip ocupado. Pide otro chip con 3, o regulariza la foto con 6.';
  return '';
}

function preferencia(imei: string): number {
  if (imei.startsWith('8951') && imei.length === 19) return 2;
  if (imei.startsWith('8951')) return 1;
  return 0;
}
