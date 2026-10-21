export type HiloAtencion = {
  id: string;
  tarea_id: string;
  orden: number;
  estado: 'abierto' | 'listo';
  lleva_telemetria: boolean | null;
  contenedor: string | null;
  maquina: string | null;
  despacho_texto: string | null;
  chip_imei: string | null;
  chip_celular: string | null;
  chip_estado: 'disponible' | 'ocupado' | null;
  despacho_validado: boolean;
  modem_serie?: string | null;
  modem_imei?: string | null;
};

type Consulta = {
  query<T>(sql: string, valores?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export function textoEquipo(total: number | null, equipo: number): string {
  const cantidad = total && total > 1 ? total : 1;
  if (cantidad === 1) return 'Escribe el contenedor y la máquina, o manda las fotos. Pueden ser varias juntas.';
  const puesto = equipo <= 1 ? 'primer equipo' : `equipo ${equipo}`;
  return `Tengo ${cantidad} solicitudes de telemetría. Envíame las fotos de la máquina y del contenedor del ${puesto}. Pueden ser varias juntas.`;
}

export function hiloListo(hilo: Pick<HiloAtencion, 'despacho_validado' | 'lleva_telemetria' | 'chip_celular' | 'chip_estado'>): { listo: boolean; falta: string[] } {
  const falta: string[] = [];
  if (!hilo.despacho_validado) falta.push('falta validar lo que envió despacho');
  if (hilo.lleva_telemetria === true && hilo.chip_estado === 'ocupado') falta.push('el chip está ocupado; pide otro o regulariza la foto');
  else if (hilo.lleva_telemetria === true && !hilo.chip_celular) falta.push('falta el chip de almacén');
  const decidido = hilo.lleva_telemetria === false || (hilo.lleva_telemetria === true && Boolean(hilo.chip_celular) && hilo.chip_estado !== 'ocupado');
  return { listo: falta.length === 0 && decidido, falta };
}

function realce(valor: string): string {
  return `*${valor.replace(/\*/g, '')}*`;
}

export function lineaHilo(hilo: HiloAtencion): string {
  const juicio = hiloListo(hilo);
  const equipo = [hilo.contenedor ? `contenedor ${realce(hilo.contenedor)}` : '', hilo.maquina ? `máquina ${realce(hilo.maquina)}` : ''].filter(Boolean).join(' · ');
  const chip = hilo.lleva_telemetria === false
    ? 'sin instalación'
    : hilo.chip_estado === 'ocupado'
      ? `chip ocupado ${hilo.chip_celular ? realce(hilo.chip_celular) : ''}`.trim()
      : hilo.chip_celular
        ? `chip ${realce(hilo.chip_celular)}`
        : 'chip pendiente';
  const estado = juicio.listo ? 'listo para la orden de fabricación' : juicio.falta.join('; ');
  const serie = hilo.modem_serie?.trim() ?? '';
  const imei = hilo.modem_imei?.trim() ?? '';
  const modem = serie ? `módulo ${realce(serie)}${imei ? ` · IMEI ${realce(imei)}` : ''}` : '';
  return [`Hilo ${hilo.orden}`, equipo || 'sin datos de despacho', chip, modem, estado].filter(Boolean).join(' · ');
}

export async function listarHilos(pg: Consulta, tareaId: string): Promise<HiloAtencion[]> {
  const filas = await pg.query<HiloAtencion>(
    `SELECT id, tarea_id, orden, estado, lleva_telemetria, contenedor, maquina, despacho_texto, chip_imei, chip_celular, chip_estado, despacho_validado, modem_serie, modem_imei
     FROM hilo_atencion WHERE tarea_id = $1 ORDER BY orden`,
    [tareaId],
  );
  return filas.rows;
}

export async function crearHilos(pg: Consulta, tareaId: string, cantidad: number): Promise<HiloAtencion[]> {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) throw new Error('La cantidad es un número entre 1 y 20.');
  const actuales = await listarHilos(pg, tareaId);
  if (actuales.length > 0) throw new Error('Esta cotización ya tiene sus hilos.');
  const equipos = await pg.query<{ orden: number; texto: string }>(
    `SELECT e.orden, e.texto
     FROM equipo_despacho e
     JOIN asignacion_despacho a ON a.id = e.asignacion_id
     WHERE a.tarea_id = $1 AND a.estado = 'confirmada'
     ORDER BY a.confirmada_en DESC NULLS LAST, e.orden`,
    [tareaId],
  );
  const tarea = await pg.query<{ codigo_equipo: string | null; maquina_equipo: string | null }>(
    `SELECT codigo_equipo, maquina_equipo FROM tarea WHERE id = $1`,
    [tareaId],
  );
  const porOrden = new Map<number, string>();
  for (const equipo of equipos.rows) if (!porOrden.has(equipo.orden) && equipo.texto.trim()) porOrden.set(equipo.orden, equipo.texto.trim());
  for (let orden = 1; orden <= cantidad; orden += 1) {
    const texto = porOrden.get(orden) ?? null;
    const contenedor = orden === 1 ? tarea.rows[0]?.codigo_equipo ?? null : null;
    const maquina = orden === 1 ? tarea.rows[0]?.maquina_equipo ?? null : null;
    await pg.query(
      `INSERT INTO hilo_atencion (id, tarea_id, orden, despacho_texto, contenedor, maquina)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [tareaId, orden, texto, contenedor, maquina],
    );
  }
  await pg.query(`UPDATE tarea SET cantidad = $2 WHERE id = $1`, [tareaId, cantidad]);
  return listarHilos(pg, tareaId);
}

export async function ajustarHilos(pg: Consulta, tareaId: string, cantidad: number): Promise<HiloAtencion[]> {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) throw new Error('La cantidad es un número entre 1 y 20.');
  const actuales = await listarHilos(pg, tareaId);
  if (actuales.length === 0) return crearHilos(pg, tareaId, cantidad);
  if (cantidad > actuales.length) {
    const desde = actuales.length + 1;
    const equipos = await pg.query<{ orden: number; texto: string }>(
      `SELECT e.orden, e.texto FROM equipo_despacho e
       JOIN asignacion_despacho a ON a.id = e.asignacion_id
       WHERE a.tarea_id = $1 AND a.estado = 'confirmada'
       ORDER BY a.confirmada_en DESC NULLS LAST, e.orden`,
      [tareaId],
    );
    const porOrden = new Map<number, string>();
    for (const equipo of equipos.rows) if (!porOrden.has(equipo.orden) && equipo.texto.trim()) porOrden.set(equipo.orden, equipo.texto.trim());
    for (let orden = desde; orden <= cantidad; orden += 1) {
      await pg.query(
        `INSERT INTO hilo_atencion (id, tarea_id, orden, despacho_texto) VALUES (gen_random_uuid(), $1, $2, $3)`,
        [tareaId, orden, porOrden.get(orden) ?? null],
      );
    }
  }
  if (cantidad < actuales.length) {
    const bloqueado = actuales.find((hilo) => hilo.orden > cantidad && (hilo.estado === 'listo' || hilo.chip_celular));
    if (bloqueado) throw new Error(`No quito el hilo ${bloqueado.orden} porque ya tiene chip o está listo.`);
    await pg.query(`DELETE FROM hilo_atencion WHERE tarea_id = $1 AND orden > $2`, [tareaId, cantidad]);
  }
  await pg.query(`UPDATE tarea SET cantidad = $2 WHERE id = $1`, [tareaId, cantidad]);
  return listarHilos(pg, tareaId);
}

export async function corregirEquipo(pg: Consulta, hiloId: string, datos: { contenedor?: string | null; maquina?: string | null }): Promise<HiloAtencion> {
  const hilo = await uno(pg, hiloId);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  const contenedor = datos.contenedor?.trim() || null;
  const maquina = datos.maquina?.trim() || null;
  if (!contenedor && !maquina) throw new Error('Escribe el contenedor o la máquina.');
  await pg.query(
    `UPDATE hilo_atencion
     SET contenedor = COALESCE($2, contenedor), maquina = COALESCE($3, maquina), despacho_validado = true
     WHERE id = $1`,
    [hiloId, contenedor, maquina],
  );
  return refrescar(pg, hiloId);
}

export async function validarDespacho(pg: Consulta, hiloId: string): Promise<HiloAtencion> {
  const hilo = await uno(pg, hiloId);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  const equipo = await pg.query<{ texto: string }>(
    `SELECT e.texto
     FROM equipo_despacho e
     JOIN asignacion_despacho a ON a.id = e.asignacion_id
     WHERE a.tarea_id = $1 AND a.estado = 'confirmada' AND e.orden = $2
     ORDER BY a.confirmada_en DESC NULLS LAST LIMIT 1`,
    [hilo.tarea_id, hilo.orden],
  );
  const tarea = await pg.query<{ codigo_equipo: string | null; maquina_equipo: string | null }>(
    `SELECT codigo_equipo, maquina_equipo FROM tarea WHERE id = $1`,
    [hilo.tarea_id],
  );
  const texto = equipo.rows[0]?.texto?.trim() || hilo.despacho_texto;
  const contenedor = hilo.orden === 1 ? tarea.rows[0]?.codigo_equipo ?? hilo.contenedor : hilo.contenedor;
  const maquina = hilo.orden === 1 ? tarea.rows[0]?.maquina_equipo ?? hilo.maquina : hilo.maquina;
  if (!texto && !contenedor && !maquina) throw new Error('Despacho todavía no envió contenedor ni máquina para este hilo.');
  await pg.query(
    `UPDATE hilo_atencion
     SET despacho_validado = true, despacho_texto = COALESCE($2, despacho_texto), contenedor = COALESCE($3, contenedor), maquina = COALESCE($4, maquina)
     WHERE id = $1`,
    [hiloId, texto, contenedor, maquina],
  );
  return refrescar(pg, hiloId);
}

export async function anotarSinInstalacion(pg: Consulta, hiloId: string): Promise<HiloAtencion> {
  const hilo = await uno(pg, hiloId);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  await pg.query(`UPDATE hilo_atencion SET lleva_telemetria = false WHERE id = $1`, [hiloId]);
  return refrescar(pg, hiloId);
}

export async function marcarInstalada(pg: Consulta, hiloId: string): Promise<HiloAtencion> {
  const hilo = await uno(pg, hiloId);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  await pg.query(`UPDATE hilo_atencion SET lleva_telemetria = true WHERE id = $1`, [hiloId]);
  return refrescar(pg, hiloId);
}

export async function marcarInstalacion(pg: Consulta, hiloId: string, instala: boolean): Promise<HiloAtencion> {
  const hilo = await uno(pg, hiloId);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  if (!hilo.despacho_validado) throw new Error('Primero valida lo que envió despacho, o pídele el código si todavía no llegó.');
  await pg.query(`UPDATE hilo_atencion SET lleva_telemetria = $2 WHERE id = $1`, [hiloId, instala]);
  return refrescar(pg, hiloId);
}

export async function guardarChip(pg: Consulta, hiloId: string, imei: string, celular: string, estado = 'disponible'): Promise<HiloAtencion> {
  const chipEstado = estado === 'ocupado' ? 'ocupado' : 'disponible';
  await pg.query(
    `UPDATE hilo_atencion SET chip_imei = $2, chip_celular = $3, chip_estado = $4, lleva_telemetria = true WHERE id = $1`,
    [hiloId, imei, celular, chipEstado],
  );
  return refrescar(pg, hiloId);
}

export async function guardarModem(pg: Consulta, hiloId: string, serie: string, imei: string): Promise<HiloAtencion> {
  const sn = serie.trim();
  const senal = imei.replace(/\D/g, '');
  if (!sn && !senal) throw new Error('Escribe el SN o el IMEI del módulo 4G.');
  await pg.query(
    `UPDATE hilo_atencion
     SET modem_serie = CASE WHEN $2 <> '' THEN $2 ELSE modem_serie END,
         modem_imei = CASE WHEN $3 <> '' THEN $3 ELSE modem_imei END
     WHERE id = $1`,
    [hiloId, sn, senal],
  );
  return refrescar(pg, hiloId);
}

async function uno(pg: Consulta, id: string): Promise<HiloAtencion | null> {
  const filas = await pg.query<HiloAtencion>(
    `SELECT id, tarea_id, orden, estado, lleva_telemetria, contenedor, maquina, despacho_texto, chip_imei, chip_celular, chip_estado, despacho_validado, modem_serie, modem_imei
     FROM hilo_atencion WHERE id = $1`,
    [id],
  );
  return filas.rows[0] ?? null;
}

async function refrescar(pg: Consulta, id: string): Promise<HiloAtencion> {
  const hilo = await uno(pg, id);
  if (!hilo) throw new Error('Ese hilo ya no está.');
  const estado = hiloListo(hilo).listo ? 'listo' : 'abierto';
  if (estado !== hilo.estado) await pg.query(`UPDATE hilo_atencion SET estado = $2 WHERE id = $1`, [id, estado]);
  return { ...hilo, estado };
}
