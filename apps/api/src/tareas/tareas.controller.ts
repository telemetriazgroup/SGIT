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
  UnauthorizedException,
} from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { TareasService } from './tareas.service';

@Controller()
export class TareasController {
  constructor(
    @Inject(TareasService) private readonly tareas: TareasService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Post('tareas/procesar-buzon')
  async procesarBuzon(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { desde?: string }) {
    await this.exigir(autorizacion);
    const desde = cuerpo?.desde && /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.desde) ? cuerpo.desde : '2026-08-01';
    const inicio = new Date(`${desde}T00:00:00-05:00`);
    if (Number.isNaN(inicio.getTime())) throw new BadRequestException('La fecha no tiene la forma aaaa-mm-dd.');
    return this.tareas.procesarDesde(inicio);
  }

  @Get('hilos/:id/resumen')
  async resumen(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.tareas.resumenDeMensaje(id);
  }

  @Get('sectores')
  async sectores(
    @Headers('authorization') autorizacion: string | undefined,
    @Query('sector') sector?: string,
    @Query('pagina') pagina?: string,
    @Query('area') area?: string,
    @Query('q') busqueda?: string,
    @Query('atencion') atencion?: string,
  ) {
    await this.exigir(autorizacion);
    if (sector !== 'pendiente' && sector !== 'otros' && sector !== 'internos') {
      throw new BadRequestException('El sector es pendiente, otros o internos.');
    }
    const cola = atencion === 'por_atender' || atencion === 'atendido' ? atencion : null;
    return this.tareas.sector(sector, numero(pagina), area?.trim() || null, busqueda ?? '', sector === 'internos' ? cola : null);
  }

  @Post('hilos/:id/destino')
  async destino(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { destino?: string },
  ) {
    await this.exigir(autorizacion);
    if (cuerpo?.destino !== 'otros' && cuerpo?.destino !== 'interna' && cuerpo?.destino !== 'archivado') {
      throw new BadRequestException('El destino es otros, asuntos internos o archivado.');
    }
    return this.tareas.decidir(id, cuerpo.destino);
  }

  @Post('hilos/:id/atencion')
  async atencion(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { estado?: string; respuesta?: string },
  ) {
    await this.exigir(autorizacion);
    if (cuerpo?.estado !== 'por_atender' && cuerpo?.estado !== 'atendido') {
      throw new BadRequestException('El estado es por atender o atendido.');
    }
    return this.tareas.guardarAtencion(id, cuerpo.estado, cuerpo.respuesta ?? '');
  }

  @Get('tareas')
  async listar(
    @Headers('authorization') autorizacion: string | undefined,
    @Query('pagina') pagina?: string,
    @Query('q') busqueda?: string,
  ) {
    await this.exigir(autorizacion);
    return this.tareas.listar(numero(pagina), busqueda ?? '');
  }

  @Get('tareas/:id')
  async ficha(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    const tarea = await this.tareas.ficha(id);
    if (!tarea) throw new NotFoundException('No está esa tarea.');
    return tarea;
  }

  @Post('mensajes/:id/procesar')
  async procesar(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    return this.tareas.procesarHilo(id);
  }

  @Get('diccionario')
  async diccionario(@Headers('authorization') autorizacion?: string) {
    await this.exigir(autorizacion);
    return this.tareas.diccionario();
  }

  @Post('diccionario')
  async agregar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { termino?: string }) {
    await this.exigir(autorizacion);
    return this.tareas.agregarTermino(cuerpo?.termino ?? '');
  }

  @Post('diccionario/:id')
  async fijar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { activo?: boolean },
  ) {
    await this.exigir(autorizacion);
    if (typeof cuerpo?.activo !== 'boolean') throw new BadRequestException('Indica si el término queda activo.');
    await this.tareas.fijarTermino(id, cuerpo.activo);
    return { id, activo: cuerpo.activo };
  }

  private async exigir(autorizacion?: string) {
    const token = bearer(autorizacion);
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    return this.identidad.actual(token);
  }
}

function numero(valor?: string): number {
  const pagina = Number(valor ?? '1');
  return Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
}

function bearer(autorizacion?: string): string | null {
  if (!autorizacion?.startsWith('Bearer ')) return null;
  const token = autorizacion.slice('Bearer '.length).trim();
  return token || null;
}
