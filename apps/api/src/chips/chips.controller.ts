import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { puedeEditarTarea } from '../identidad/permisos';
import { ChipsService } from './chips.service';

@Controller()
export class ChipsController {
  constructor(
    @Inject(ChipsService) private readonly chips: ChipsService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('chips')
  async listar(
    @Headers('authorization') autorizacion: string | undefined,
    @Query('pagina') pagina?: string,
    @Query('q') busqueda?: string,
    @Query('archivados') archivados?: string,
    @Query('estado') estado?: string,
    @Query('mes') mes?: string,
    @Query('dia') dia?: string,
  ) {
    await this.exigir(autorizacion);
    const numero = Number(pagina ?? '1');
    const filtro = estado === 'disponible' || estado === 'ocupado' || estado === 'sin_dato' ? estado : '';
    return this.chips.listar(Number.isInteger(numero) && numero > 0 ? numero : 1, busqueda ?? '', archivados === 'si', filtro, mes ?? '', dia ?? '');
  }

  @Post('chips/odoo')
  async odoo(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigir(autorizacion);
    return this.chips.consultarOdoo();
  }

  @Post('chips')
  async crear(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { producto?: string; marca?: string; imei?: string; celular?: string; reemplazar?: boolean },
  ) {
    await this.exigir(autorizacion);
    return this.chips.crear(cuerpo ?? {}, Boolean(cuerpo?.reemplazar));
  }

  @Post('chips/excel')
  async excel(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { nombre?: string; contenido?: string; reemplazar?: boolean },
  ) {
    await this.exigir(autorizacion);
    if (!cuerpo?.contenido) throw new BadRequestException('Falta el Excel.');
    const nombre = (cuerpo.nombre ?? '').toLowerCase();
    if (nombre && !nombre.endsWith('.xlsx') && !nombre.endsWith('.csv')) throw new BadRequestException('El archivo tiene que ser Excel .xlsx o CSV.');
    return this.chips.importar(Buffer.from(cuerpo.contenido, 'base64'), Boolean(cuerpo?.reemplazar));
  }

  @Get('chips/:id/orden/imagenes')
  async imagenes(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.chips.imagenesDeOrden(id);
  }

  @Get('chips/:id/orden')
  async orden(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.chips.verOrden(id, false);
  }

  @Post('chips/:id/orden')
  async refrescarOrden(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.chips.verOrden(id, true);
  }

  @Post('chips/:id')
  async editar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { producto?: string; marca?: string; imei?: string; celular?: string; reemplazar?: boolean },
  ) {
    await this.exigir(autorizacion);
    return this.chips.editar(id, cuerpo ?? {}, Boolean(cuerpo?.reemplazar));
  }

  @Post('chips/:id/archivar')
  async archivar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { archivado?: boolean },
  ) {
    await this.exigir(autorizacion);
    if (typeof cuerpo?.archivado !== 'boolean') throw new BadRequestException('Indica si el chip queda archivado.');
    return this.chips.archivar(id, cuerpo.archivado);
  }

  private async exigir(autorizacion?: string) {
    if (!autorizacion?.startsWith('Bearer ')) throw new UnauthorizedException('Sesión no válida.');
    const token = autorizacion.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (!puedeEditarTarea(usuario.rol)) throw new ForbiddenException('No tienes permiso para los chips.');
    return usuario;
  }
}
