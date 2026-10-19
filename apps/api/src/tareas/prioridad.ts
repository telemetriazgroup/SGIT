export type MarcaFecha = 'pasada' | 'hoy' | 'proxima' | 'sin_fecha';

export function marcaFecha(fecha: string | null, hoy: string): MarcaFecha {
  if (!fecha) return 'sin_fecha';
  const dia = fecha.slice(0, 10);
  if (dia < hoy) return 'pasada';
  if (dia === hoy) return 'hoy';
  return 'proxima';
}

export function compararUrgencia(izquierda: string | null, derecha: string | null, hoy: string): number {
  const peso = { pasada: 0, hoy: 1, proxima: 2, sin_fecha: 3 };
  const a = marcaFecha(izquierda, hoy);
  const b = marcaFecha(derecha, hoy);
  if (peso[a] !== peso[b]) return peso[a] - peso[b];
  if (a === 'pasada') return derecha!.slice(0, 10).localeCompare(izquierda!.slice(0, 10));
  if (a === 'proxima' || a === 'hoy') return izquierda!.slice(0, 10).localeCompare(derecha!.slice(0, 10));
  return 0;
}

export function joinUrgente(alias: string): string {
  return `LEFT JOIN LATERAL (
    SELECT entrega_fecha, entrega_hora
    FROM tienda abierta
    WHERE abierta.tarea_id = ${alias}.id
      AND abierta.estado IN ('pendiente', 'en_seguimiento')
      AND abierta.entrega_fecha IS NOT NULL
    ORDER BY entrega_fecha ASC, orden NULLS LAST, nombre
    LIMIT 1
  ) urgente ON true`;
}

export function ordenUrgente(alias: string): string {
  const fecha = `COALESCE(urgente.entrega_fecha, ${alias}.cita_fecha)`;
  const hoy = `(timezone('America/Lima', now()))::date`;
  return `CASE
      WHEN ${fecha} IS NULL THEN 3
      WHEN ${fecha} < ${hoy} THEN 0
      WHEN ${fecha} = ${hoy} THEN 1
      ELSE 2
    END,
    CASE WHEN ${fecha} < ${hoy} THEN ${fecha} END DESC NULLS LAST,
    CASE WHEN ${fecha} >= ${hoy} THEN ${fecha} END ASC NULLS LAST,
    ${alias}.creado_en ASC`;
}

export function ordenFecha(columna: string, desempate: string): string {
  const hoy = `(timezone('America/Lima', now()))::date`;
  return `CASE
      WHEN ${columna} IS NULL THEN 3
      WHEN ${columna} < ${hoy} THEN 0
      WHEN ${columna} = ${hoy} THEN 1
      ELSE 2
    END,
    CASE WHEN ${columna} < ${hoy} THEN ${columna} END DESC NULLS LAST,
    CASE WHEN ${columna} >= ${hoy} THEN ${columna} END ASC NULLS LAST,
    ${desempate}`;
}
