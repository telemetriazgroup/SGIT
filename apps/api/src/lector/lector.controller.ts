import { Body, Controller, ForbiddenException, Get, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { LectorServicio } from './servicio';

@Controller('lector')
export class LectorController {
  constructor(
    @Inject(LectorServicio) private readonly lector: LectorServicio,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('configuracion')
  async configuracion(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.lector.publica();
  }

  @Post('configuracion')
  async guardar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { url?: string }) {
    await this.exigir(autorizacion);
    return this.lector.guardar(cuerpo?.url ?? '');
  }

  @Post('probar')
  async probar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { url?: string }) {
    await this.exigir(autorizacion);
    return { texto: await this.lector.probar(cuerpo?.url ?? '') };
  }

  @Post('leer')
  async leer(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { url?: string; caso?: string; nombre?: string; mime?: string; contenido?: string },
  ) {
    await this.exigir(autorizacion);
    return this.lector.leer(cuerpo ?? {});
  }

  private async exigir(autorizacion?: string) {
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (usuario.rol !== 'superusuario') throw new ForbiddenException('Solo el superusuario configura el lector.');
    return usuario;
  }
}
