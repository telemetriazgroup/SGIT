import { Body, Controller, Delete, ForbiddenException, Get, Headers, Inject, Param, Post, Query, StreamableFile, UnauthorizedException } from '@nestjs/common';
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

  @Post('genset/:imei/ficha')
  async ficha(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('imei') imei: string,
    @Body() cuerpo: { carreta?: string; serie_maquina?: string; codigo_genset?: string; observaciones?: string },
  ) {
    await this.exigir(autorizacion);
    return this.genset.guardarFicha(imei, cuerpo ?? {});
  }

  @Post('genset/:imei/fotos')
  async fotos(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('imei') imei: string,
    @Body() cuerpo: { fotos?: Array<{ nombre?: string; mime?: string; contenido?: string }> },
  ) {
    const usuario = await this.exigir(autorizacion);
    return this.genset.agregarFotos(imei, usuario.correo, cuerpo?.fotos ?? []);
  }

  @Get('genset/:imei/fotos/:fotoId')
  async foto(@Headers('authorization') autorizacion: string | undefined, @Param('imei') imei: string, @Param('fotoId') fotoId: string) {
    await this.exigir(autorizacion);
    const archivo = await this.genset.leerFoto(imei, fotoId);
    return new StreamableFile(archivo.contenido, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
  }

  @Delete('genset/:imei/fotos/:fotoId')
  async quitarFoto(@Headers('authorization') autorizacion: string | undefined, @Param('imei') imei: string, @Param('fotoId') fotoId: string) {
    await this.exigir(autorizacion);
    return this.genset.quitarFoto(imei, fotoId);
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
