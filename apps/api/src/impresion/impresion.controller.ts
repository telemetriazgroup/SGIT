import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadService } from '../identidad/identidad.service';
import { esPdf } from './reglas';
import { ImpresionServicio } from './servicio';

@Controller('impresion')
export class ImpresionController {
  constructor(
    @Inject(Conexiones) private readonly conexiones: Conexiones,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('configuracion')
  async configuracion(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return new ImpresionServicio(this.conexiones).publica();
  }

  @Post('configuracion')
  async guardar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { baseUrl?: string; clave?: string }) {
    await this.exigir(autorizacion);
    return new ImpresionServicio(this.conexiones).guardar(cuerpo?.baseUrl ?? '', cuerpo?.clave ?? '');
  }

  @Post('probar')
  async probar(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return { texto: await new ImpresionServicio(this.conexiones).probar() };
  }

  @Post('enviar')
  async enviar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { nombre?: string; contenido?: string }) {
    await this.exigir(autorizacion);
    const pdf = Buffer.from(cuerpo?.contenido ?? '', 'base64');
    if (!esPdf(pdf)) throw new BadRequestException('El archivo no es un PDF.');
    if (pdf.length > 5 * 1024 * 1024) throw new BadRequestException('El PDF supera 5 MB.');
    const texto = await new ImpresionServicio(this.conexiones).enviar(pdf, cuerpo?.nombre ?? 'prueba.pdf', `sgit-prueba-${Date.now()}`);
    return { texto };
  }

  private async exigir(autorizacion?: string) {
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (usuario.rol !== 'superusuario' && usuario.rol !== 'administrador') throw new ForbiddenException('Solo el superusuario y el administrador configuran la impresión.');
    return usuario;
  }
}
