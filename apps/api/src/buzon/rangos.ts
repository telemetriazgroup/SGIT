export type Intervalo = { desde: Date; hasta: Date };

export function huecos(pedido: Intervalo, cubiertos: Intervalo[]): Intervalo[] {
  const ordenados = [...cubiertos].sort((a, b) => a.desde.getTime() - b.desde.getTime());
  let libres: Intervalo[] = [pedido];
  for (const cubierto of ordenados) {
    libres = libres.flatMap((libre) => restar(libre, cubierto));
  }
  return libres;
}

export function fusionar(intervalos: Intervalo[]): Intervalo[] {
  const ordenados = [...intervalos].sort((a, b) => a.desde.getTime() - b.desde.getTime());
  const salida: Intervalo[] = [];
  for (const actual of ordenados) {
    const ultimo = salida.at(-1);
    if (!ultimo || actual.desde.getTime() > ultimo.hasta.getTime() + 1000) {
      salida.push({ desde: actual.desde, hasta: actual.hasta });
      continue;
    }
    if (actual.hasta.getTime() > ultimo.hasta.getTime()) ultimo.hasta = actual.hasta;
  }
  return salida;
}

function restar(libre: Intervalo, cubierto: Intervalo): Intervalo[] {
  const inicio = libre.desde.getTime();
  const fin = libre.hasta.getTime();
  const cubreDesde = cubierto.desde.getTime();
  const cubreHasta = cubierto.hasta.getTime();
  if (cubreHasta < inicio || cubreDesde > fin) return [libre];
  const partes: Intervalo[] = [];
  if (cubreDesde > inicio) partes.push({ desde: libre.desde, hasta: new Date(cubreDesde - 1) });
  if (cubreHasta < fin) partes.push({ desde: new Date(cubreHasta + 1), hasta: libre.hasta });
  return partes;
}
