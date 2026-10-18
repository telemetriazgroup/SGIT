import { randomUUID } from 'crypto';
import type { Conexiones } from '../conexiones';
import { TareasService } from '../tareas/tareas.service';
import { textoSnooze, citaVisible, PAUSA_MS } from './avisos';
import { BotService } from './bot.service';
import { TurnoDespacho } from './turno-despacho';

export class PulsoDespacho {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lote: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tareas: TareasService,
    private readonly conexiones: Conexiones,
    private readonly bot: BotService,
  ) {
    this.turno = new TurnoDespacho(conexiones);
  }

  private readonly turno: TurnoDespacho;

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.correr();
    }, 60_000);
    this.lote = setInterval(() => {
      void this.bot.preguntarLotes().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'falló la pregunta del lote';
        console.error(`Pulso lote: ${mensaje}`);
      });
    }, 5_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.lote) clearInterval(this.lote);
  }

  private async correr(): Promise<void> {
    try {
      const resultado = await this.tareas.barrido();
      await this.recordatorios(resultado.vencidos);
      await this.turno.pulsar(new Date());
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'falló el pulso de despacho';
      console.error(`Pulso despacho: ${mensaje}`);
    }
  }

  private async recordatorios(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const filas = await this.conexiones.pg.query<{ tarea_id: string; telefono: string }>(
      `SELECT DISTINCT ON (r.tarea_id) r.tarea_id, u.telefono
       FROM recordatorio r
       JOIN usuario u ON u.correo = r.autor_correo AND u.activo AND u.telefono IS NOT NULL AND u.telefono <> ''
       WHERE r.tipo = 'snooze' AND r.estado = 'enviado' AND r.tarea_id = ANY($1::uuid[])
       ORDER BY r.tarea_id, r.recordar_en DESC`,
      [ids],
    );
    let cuando = await this.siguiente();
    for (const fila of filas.rows) {
      const tarea = await this.datos(fila.tarea_id);
      if (!tarea) continue;
      const cuerpo = textoSnooze({
        cot: tarea.cot,
        cliente: tarea.cliente,
        lugar: tarea.lugar,
        cita: citaVisible(tarea.cita_fecha, tarea.cita_hora),
        cantidad: null,
      });
      await this.conexiones.pg.query(
        `INSERT INTO aviso (id, tipo, tarea_id, destino, cuerpo, estado, no_enviar_antes)
         VALUES ($1, 'aviso_snooze', $2, $3, $4, 'pendiente', $5)`,
        [randomUUID(), fila.tarea_id, fila.telefono, cuerpo, cuando.toISOString()],
      );
      cuando = new Date(cuando.getTime() + PAUSA_MS);
    }
  }

  private async siguiente(): Promise<Date> {
    const ahora = new Date();
    const previo = await this.conexiones.pg.query<{ no_enviar_antes: Date }>(
      `SELECT no_enviar_antes FROM aviso WHERE estado = 'pendiente' ORDER BY no_enviar_antes DESC LIMIT 1`,
    );
    const ultimo = previo.rows[0]?.no_enviar_antes ? new Date(previo.rows[0].no_enviar_antes) : null;
    return ultimo && ultimo >= ahora ? new Date(ultimo.getTime() + PAUSA_MS) : ahora;
  }

  private async datos(tareaId: string): Promise<{ cot: string; cliente: string | null; lugar: string | null; cita_fecha: string | null; cita_hora: string | null } | null> {
    const fila = await this.conexiones.pg.query<{ cot: string; cliente: string | null; lugar: string | null; cita_fecha: string | null; cita_hora: string | null }>(
      `SELECT cot, cliente, lugar, to_char(cita_fecha, 'YYYY-MM-DD') AS cita_fecha, cita_hora
       FROM tarea WHERE id = $1`,
      [tareaId],
    );
    return fila.rows[0] ?? null;
  }
}
