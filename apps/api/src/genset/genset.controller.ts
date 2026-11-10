import { Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { puedeValidarGenset } from '../identidad/permisos';
import { GensetService } from './genset.service';

@Controller()
export class GensetController {
  constructor(
    @Inject(GensetService) private readonly genset: GensetService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('genset')
  async listar(@Headers('authorization') autorizacion: string | undefined, @Query('q') busqueda?: string) {
    await this.exigir(autorizacion);
    return this.genset.listar(busqueda ?? '');
  }

  @Post('genset/sincronizar')
  async sincronizar(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigir(autorizacion);
    return this.genset.sincronizar();
  }

  @Get('genset/:imei')
  async ver(@Headers('authorization') autorizacion: string | undefined, @Param('imei') imei: string) {
    await this.exigir(autorizacion);
    return this.genset.historial(imei);
  }

  @Post('genset/:imei/consultar')
  async consultar(@Headers('authorization') autorizacion: string | undefined, @Param('imei') imei: string) {
    const usuario = await this.exigir(autorizacion);
    return this.genset.consultar(imei, usuario.correo);
  }

  private async exigir(autorizacion?: string) {
    if (!autorizacion?.startsWith('Bearer ')) throw new UnauthorizedException('Sesión no válida.');
    const token = autorizacion.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (!puedeValidarGenset(usuario.rol)) throw new ForbiddenException('No tienes permiso para validar generadores.');
    return usuario;
  }
}
