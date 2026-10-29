import type { Configuracion } from '../configuracion';
import type { Conexiones } from '../conexiones';
import type { ClienteGmail } from '../buzon/cliente-gmail';
import { correoRaw, PAUSA_CORREO_MS } from './reglas';

export class CorreoSalida {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ocupado = false;

  constructor(
    private readonly conexiones: Conexiones,
    private readonly cliente: ClienteGmail,
    private readonly config: Configuracion,
  ) {}

  onModuleInit(): void {
    if (process.env.GMAIL_DOBLE === '1') return;
    this.timer = setInterval(() => {
      void this.correr();
    }, 5_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async correr(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      await this.conexiones.pg.query(
        `UPDATE salida_correo SET estado = 'pendiente'
         WHERE estado = 'enviando' AND no_enviar_antes < now() - interval '2 minutes'`,
      );
      const reciente = await this.conexiones.pg.query<{ enviado_en: Date }>(
        `SELECT enviado_en FROM salida_correo WHERE estado = 'enviado' AND enviado_en IS NOT NULL ORDER BY enviado_en DESC LIMIT 1`,
      );
      const ultimo = reciente.rows[0]?.enviado_en;
      if (ultimo && Date.now() - new Date(ultimo).getTime() < PAUSA_CORREO_MS) return;
      const fila = await this.tomarPendiente();
      if (!fila) return;
      try {
        const de = await this.remitente();
        if (!de) throw new Error('No hay una casilla de Gmail configurada.');
        await this.cliente.enviar(correoRaw(de, fila.direccion, fila.asunto, fila.cuerpo, fila.copia, fila.copiaOculta));
        await this.conexiones.pg.query(
          `UPDATE salida_correo SET estado = 'enviado', enviado_en = now(), error = NULL WHERE id = $1`,
          [fila.id],
        );
      } catch (error) {
        await this.conexiones.pg.query(
          `UPDATE salida_correo SET estado = 'fallo', error = $2 WHERE id = $1`,
          [fila.id, textoFallo(error)],
        );
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'falló la cola de correo';
      console.error(`Salida de correo: ${mensaje}`);
    } finally {
      this.ocupado = false;
    }
  }

  private async remitente(): Promise<string> {
    const filas = await this.conexiones.pg.query<{ correo: string }>(
      `SELECT correo FROM buzon WHERE refresh_token_cifrado IS NOT NULL ORDER BY creado_en LIMIT 1`,
    );
    return filas.rows[0]?.correo || this.config.gmail?.correo || '';
  }

  private async tomarPendiente(): Promise<{ id: string; direccion: string; copia: string; copiaOculta: string; asunto: string; cuerpo: string } | null> {
    const cliente = await this.conexiones.pg.connect();
    try {
      await cliente.query('BEGIN');
      const pendiente = await cliente.query<{ id: string; direccion: string; copia: string; copia_oculta: string; asunto: string; cuerpo: string }>(
        `SELECT id, direccion, copia, copia_oculta, asunto, cuerpo
         FROM salida_correo
         WHERE estado = 'pendiente' AND no_enviar_antes <= now()
         ORDER BY no_enviar_antes, creado_en
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const fila = pendiente.rows[0];
      if (!fila) {
        await cliente.query('COMMIT');
        return null;
      }
      await cliente.query(`UPDATE salida_correo SET estado = 'enviando' WHERE id = $1`, [fila.id]);
      await cliente.query('COMMIT');
      return {
        id: fila.id,
        direccion: fila.direccion,
        copia: fila.copia ?? '',
        copiaOculta: fila.copia_oculta ?? '',
        asunto: fila.asunto,
        cuerpo: fila.cuerpo,
      };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }
}

function textoFallo(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : 'No se pudo enviar el correo.';
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|gmail_sin_conectar/i.test(mensaje)) {
    return 'Gmail no tiene permiso de envío. Hay que volver a vincular la casilla.';
  }
  return mensaje.slice(0, 300);
}
