import { Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { puedeEditarTarea } from '../identidad/permisos';
import { ModemsService } from './modems.service';

@Controller()
export class ModemsController {
  constructor(
    @Inject(ModemsService) private readonly modems: ModemsService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('modems')
  async listar(
    @Headers('authorization') autorizacion: string | undefined,
    @Query('pagina') pagina?: string,
    @Query('q') busqueda?: string,
    @Query('estado') estado?: string,
  ) {
    await this.exigir(autorizacion);
    const numero = Number(pagina ?? '1');
    const filtro = estado === 'disponible' || estado === 'fabricado' || estado === 'salida' ? estado : '';
    return this.modems.listar(Number.isInteger(numero) && numero > 0 ? numero : 1, busqueda ?? '', filtro);
  }

  @Post('modems/odoo')
  async odoo(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigir(autorizacion);
    return this.modems.consultar();
  }

  @Get('modems/:id')
  async ver(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.modems.ver(id);
  }

  private async exigir(autorizacion?: string) {
    if (!autorizacion?.startsWith('Bearer ')) throw new UnauthorizedException('Sesión no válida.');
    const token = autorizacion.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (!puedeEditarTarea(usuario.rol)) throw new ForbiddenException('No tienes permiso para los módems.');
    return usuario;
  }
}
