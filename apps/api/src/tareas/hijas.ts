import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

type Padre = {
  id: string;
  cot: string;
  cots: string[] | null;
  ticket: string | null;
  descripcion: string | null;
  cliente: string | null;
  mensaje_id: string | null;
  creado_en: Date;
};

type Local = {
  id: string;
  clave: string;
  cadena: string;
  nombre: string;
  contacto: string;
  celular: string;
  entrega_fecha: string | null;
  entrega_hora: string;
  direccion: string;
  mapa: string;
};

export async function vincularHijas(pg: Pool, tareaId: string): Promise<void> {
  const padre = await pg.query<Padre>(
    `SELECT id, cot, cots, ticket, descripcion, cliente, mensaje_id, creado_en
     FROM tarea WHERE id = $1 AND campana`,
    [tareaId],
  );
  const base = padre.rows[0];
  if (!base) return;
  const tiendas = await pg.query<Local>(
    `SELECT id, clave, cadena, nombre, contacto, celular,
            to_char(entrega_fecha, 'YYYY-MM-DD') AS entrega_fecha,
            entrega_hora, direccion, mapa
     FROM tienda WHERE tarea_id = $1`,
    [tareaId],
  );
  const cots = base.cots && base.cots.length > 0 ? base.cots : [base.cot];
  for (const tienda of tiendas.rows) {
    const cot = `${base.cot}#${tienda.clave}`;
    const lugar = [tienda.cadena, tienda.nombre].filter(Boolean).join(' · ');
    await pg.query(
      `INSERT INTO tarea (
         id, cot, estado, ticket, descripcion, lugar, cliente, cantidad,
         comercial_nombre, comercial_telefono, cita_fecha, cita_hora, cita_direccion, cita_mapa,
         mensaje_id, cots, padre_id, campana, creado_en
       ) VALUES (
         $1,$2,'detectada',$3,$4,$5,$6,NULL,
         $7,$8,$9,$10,$11,$12,
         $13,$14::text[],$15,false,$16
       )
       ON CONFLICT (cot) DO UPDATE SET
         lugar = EXCLUDED.lugar,
         comercial_nombre = CASE WHEN EXCLUDED.comercial_nombre <> '' THEN EXCLUDED.comercial_nombre ELSE tarea.comercial_nombre END,
         comercial_telefono = CASE WHEN EXCLUDED.comercial_telefono <> '' THEN EXCLUDED.comercial_telefono ELSE tarea.comercial_telefono END,
         cita_fecha = COALESCE(EXCLUDED.cita_fecha, tarea.cita_fecha),
         cita_hora = CASE WHEN EXCLUDED.cita_hora <> '' THEN EXCLUDED.cita_hora ELSE tarea.cita_hora END,
         cita_direccion = CASE WHEN EXCLUDED.cita_direccion <> '' THEN EXCLUDED.cita_direccion ELSE tarea.cita_direccion END,
         cita_mapa = CASE WHEN EXCLUDED.cita_mapa <> '' THEN EXCLUDED.cita_mapa ELSE tarea.cita_mapa END,
         descripcion = COALESCE(tarea.descripcion, EXCLUDED.descripcion),
         cliente = COALESCE(tarea.cliente, EXCLUDED.cliente),
         ticket = COALESCE(tarea.ticket, EXCLUDED.ticket)`,
      [
        randomUUID(),
        cot,
        base.ticket,
        base.descripcion,
        lugar,
        base.cliente,
        tienda.contacto,
        tienda.celular,
        tienda.entrega_fecha,
        tienda.entrega_hora,
        tienda.direccion,
        tienda.mapa,
        base.mensaje_id,
        cots,
        base.id,
        base.creado_en,
      ],
    );
    await pg.query(`UPDATE tienda SET tarea_hija_id = (SELECT id FROM tarea WHERE cot = $2) WHERE id = $1`, [tienda.id, cot]);
  }
  await pg.query(
    `INSERT INTO habilitado (clase, clave)
     SELECT 'tarea', h.id::text
     FROM tarea h
     WHERE h.padre_id = $1
       AND EXISTS (SELECT 1 FROM habilitado pub WHERE pub.clase = 'tarea' AND pub.clave = $1::text)
     ON CONFLICT (clase, clave) DO NOTHING`,
    [tareaId],
  );
  await pg.query(
    `UPDATE turno_despacho SET estado = 'cerrada' WHERE tarea_id = $1 AND estado IN ('en_cola', 'reconsulta')`,
    [tareaId],
  );
}
