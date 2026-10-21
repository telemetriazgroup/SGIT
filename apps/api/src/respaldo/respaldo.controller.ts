import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, Post, Req, Res, StreamableFile, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IdentidadService } from '../identidad/identidad.service';
import { rutaPartida } from './paquete';
import { RespaldoServicio } from './servicio';

@Controller('respaldo')
export class RespaldoController {
  constructor(
    @Inject(RespaldoServicio) private readonly respaldo: RespaldoServicio,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get()
  async resumen(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.respaldo.resumen();
  }

  @Get('partida')
  async partida(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.respaldo.estadoPartida();
  }

  @Post('partida')
  async crearPartida(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.respaldo.crearPartida();
  }

  @Get('partida/archivo')
  async bajarPartida(@Headers('authorization') autorizacion: string | undefined, @Res({ passthrough: true }) respuesta: Response) {
    await this.exigir(autorizacion);
    const ruta = rutaPartida();
    try {
      await stat(ruta);
    } catch {
      throw new NotFoundException('Todavía no hay una partida. Créala primero.');
    }
    respuesta.setHeader('content-type', 'application/gzip');
    respuesta.setHeader('content-disposition', 'attachment; filename="sgit-partida.tar.gz"');
    return new StreamableFile(createReadStream(ruta));
  }

  @Post('partida/asimilar')
  async asimilarPartida(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return { texto: await this.respaldo.asimilarPartida() };
  }

  @Get('clasificacion')
  async clasificacion(@Headers('authorization') autorizacion: string | undefined, @Res({ passthrough: true }) respuesta: Response) {
    await this.exigir(autorizacion);
    const cuerpo = await this.respaldo.clasificacion();
    return archivoJson(respuesta, 'sgit-clasificacion.json', cuerpo);
  }

  @Get('mensajes/:parte')
  async mensajes(@Headers('authorization') autorizacion: string | undefined, @Param('parte') parte: string, @Res({ passthrough: true }) respuesta: Response) {
    await this.exigir(autorizacion);
    const archivo = await this.respaldo.mensajes(numero(parte));
    return archivoJson(respuesta, archivo.nombre, archivo.cuerpo);
  }

  @Get('adjuntos/:parte')
  async adjuntos(@Headers('authorization') autorizacion: string | undefined, @Param('parte') parte: string, @Res({ passthrough: true }) respuesta: Response) {
    await this.exigir(autorizacion);
    const archivo = await this.respaldo.adjuntos(numero(parte));
    return archivoJson(respuesta, archivo.nombre, archivo.cuerpo);
  }

  @Get('adjuntos/:parte/archivo')
  async archivo(@Headers('authorization') autorizacion: string | undefined, @Param('parte') parte: string, @Res({ passthrough: true }) respuesta: Response) {
    await this.exigir(autorizacion);
    const archivo = await this.respaldo.archivoAdjunto(numero(parte));
    respuesta.setHeader('content-type', archivo.mime);
    respuesta.setHeader('content-disposition', `attachment; filename="${archivo.nombre}"`);
    return new StreamableFile(archivo.bytes);
  }

  @Post('importar')
  async importar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: unknown) {
    await this.exigir(autorizacion);
    return { texto: await this.respaldo.importar(cuerpo) };
  }

  @Post('archivo')
  async archivoSubido(@Headers('authorization') autorizacion: string | undefined, @Req() peticion: Request) {
    await this.exigir(autorizacion);
    const bytes = await leerOctetos(peticion);
    const encabezado = peticion.headers;
    const texto = await this.respaldo.guardarArchivo({
      mensaje: cabecera(encabezado['x-sgit-mensaje']),
      adjunto: cabecera(encabezado['x-sgit-adjunto']),
      nombre: decodeURIComponent(cabecera(encabezado['x-sgit-nombre']) || 'archivo'),
      mime: cabecera(encabezado['x-sgit-mime']) || 'application/octet-stream',
      tipo: cabecera(encabezado['x-sgit-tipo']) || 'archivo',
      contentId: cabecera(encabezado['x-sgit-content-id']),
    }, bytes);
    return { texto };
  }

  private async exigir(autorizacion?: string) {
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (usuario.rol !== 'superusuario') throw new ForbiddenException('Solo el superusuario mueve el respaldo.');
    return usuario;
  }
}

function numero(parte: string): number {
  const valor = Number(parte);
  if (!Number.isInteger(valor) || valor < 1) throw new BadRequestException('La parte no es válida.');
  return valor;
}

function archivoJson(respuesta: Response, nombre: string, cuerpo: unknown): unknown {
  respuesta.setHeader('content-type', 'application/json; charset=utf-8');
  respuesta.setHeader('content-disposition', `attachment; filename="${nombre}"`);
  return cuerpo;
}

function cabecera(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? valor[0] ?? '' : valor ?? '';
}

function leerOctetos(peticion: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const trozos: Buffer[] = [];
    let total = 0;
    peticion.on('data', (trozo: Buffer) => {
      total += trozo.length;
      if (total > 26_000_000) {
        reject(new BadRequestException('Ese archivo pasa de 26 MB.'));
        peticion.destroy();
        return;
      }
      trozos.push(trozo);
    });
    peticion.on('end', () => resolve(Buffer.concat(trozos)));
    peticion.on('error', reject);
  });
}
