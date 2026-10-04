import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Configuracion } from '../configuracion';
import { IdentidadService } from '../identidad/identidad.service';
import { BuzonService } from './buzon.service';
import { estadoVigente } from './cifrado';

type Rango = { desde?: string; hasta?: string };

@Controller()
export class BuzonController {
  constructor(
    @Inject(BuzonService) private readonly buzon: BuzonService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
    @Inject('CONFIG') private readonly config: Configuracion,
  ) {}

  @Get('buzon')
  async resumen(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.buzon.resumen();
  }

  @Get('buzon/oauth/url')
  async url(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return { url: this.buzon.enlaceOAuth() };
  }

  @Get('buzon/oauth/callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Res() respuesta: Response) {
    const destino = this.config.webOrigin;
    if (!code || !state || !estadoVigente(state, this.config.sesionSecreto)) {
      respuesta.redirect(`${destino}/?gmail=error`);
      return;
    }
    try {
      await this.buzon.cambiarCodigo(code);
      respuesta.redirect(`${destino}/?gmail=conectado`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo conectar el buzón.';
      respuesta.redirect(`${destino}/?gmail=error&motivo=${encodeURIComponent(mensaje)}`);
    }
  }

  @Post('buzon/sync')
  async sync(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { activa?: boolean }) {
    await this.exigir(autorizacion);
    if (typeof cuerpo?.activa !== 'boolean') {
      throw new BadRequestException('Indica si la sincronización queda activa.');
    }
    return this.buzon.fijarSyncAutomatica(cuerpo.activa);
  }

  @Post('buzon/importar')
  async importar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: Rango) {
    await this.exigir(autorizacion);
    const rango = interpretarRango(cuerpo?.desde, cuerpo?.hasta);
    return this.buzon.importarRango(rango.desde, rango.hasta);
  }

  @Get('buzon/mensajes')
  async mensajes(
    @Headers('authorization') autorizacion?: string,
    @Query('q') busqueda?: string,
    @Query('pagina') pagina?: string,
  ) {
    await this.exigir(autorizacion);
    const numero = Number(pagina);
    return this.buzon.listarMensajes(Number.isFinite(numero) ? numero : 1, 25, busqueda ?? '');
  }

  @Get('buzon/mensajes/:id/hilo')
  async hilo(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    const conversacion = await this.buzon.hilo(id);
    if (!conversacion) throw new NotFoundException('No está ese correo.');
    return conversacion;
  }

  @Get('buzon/mensajes/:id')
  async mensaje(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    const detalle = await this.buzon.detalle(id);
    if (!detalle) throw new NotFoundException('No está ese correo.');
    return detalle;
  }

  @Get('buzon/adjuntos/:id')
  async adjunto(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    await this.exigir(autorizacion);
    const archivo = await this.buzon.leerAdjunto(id);
    if (!archivo) throw new NotFoundException('El archivo no está disponible.');
    return new StreamableFile(archivo.bytes, {
      type: archivo.mime,
      disposition: `attachment; filename="${archivo.nombre.replace(/"/g, '')}"`,
    });
  }

  private async exigir(autorizacion?: string) {
    const token = bearer(autorizacion);
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    return this.identidad.actual(token);
  }
}

function bearer(autorizacion?: string): string | null {
  if (!autorizacion?.startsWith('Bearer ')) return null;
  const token = autorizacion.slice('Bearer '.length).trim();
  return token || null;
}

export function interpretarRango(desde?: string, hasta?: string): { desde: Date; hasta: Date } {
  if (!desde) throw new BadRequestException('Indica la fecha inicial.');
  const inicio = limiteLima(desde, false);
  const fin = limiteLima(hasta || fechaHoyLima(), true);
  if (!inicio || !fin) throw new BadRequestException('Las fechas no tienen la forma aaaa-mm-dd.');
  return { desde: inicio, hasta: fin };
}

function limiteLima(fecha: string, finDeDia: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const hora = finDeDia ? '23:59:59' : '00:00:00';
  const valor = new Date(`${fecha}T${hora}-05:00`);
  return Number.isNaN(valor.getTime()) ? null : valor;
}

function fechaHoyLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}
