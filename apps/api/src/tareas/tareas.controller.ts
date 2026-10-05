import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentidadService } from '../identidad/identidad.service';
import { puedeEditarTarea, puedeOperarSistema } from '../identidad/permisos';
import { TareasService } from './tareas.service';

@Controller()
export class TareasController {
  constructor(
    @Inject(TareasService) private readonly tareas: TareasService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Post('tareas/procesar-buzon')
  async procesarBuzon(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { desde?: string }) {
    await this.exigirSistema(autorizacion);
    const desde = cuerpo?.desde && /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.desde) ? cuerpo.desde : '2026-08-01';
    const inicio = new Date(`${desde}T00:00:00-05:00`);
    if (Number.isNaN(inicio.getTime())) throw new BadRequestException('La fecha no tiene la forma aaaa-mm-dd.');
    return this.tareas.procesarDesde(inicio);
  }

  @Get('hilos/:id/resumen')
  async resumen(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigirSistema(autorizacion);
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
    await this.exigirSistema(autorizacion);
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
    await this.exigirSistema(autorizacion);
    if (cuerpo?.destino !== 'otros' && cuerpo?.destino !== 'interna' && cuerpo?.destino !== 'archivado' && cuerpo?.destino !== 'evento') {
      throw new BadRequestException('El destino es otros, asuntos internos, archivado o telemetría.');
    }
    return this.tareas.decidir(id, cuerpo.destino);
  }

  @Post('hilos/:id/atencion')
  async atencion(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { estado?: string; respuesta?: string },
  ) {
    await this.exigirSistema(autorizacion);
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

  @Post('tareas/:id/tomar')
  async tomar(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.tomar(id, usuario);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/notas')
  async nota(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { tipo?: string; texto?: string; archivo?: { nombre?: string; mime?: string; contenido?: string } },
  ) {
    const usuario = await this.exigir(autorizacion);
    await this.tareas.anotar(id, usuario, cuerpo?.tipo ?? '', cuerpo?.texto ?? '', archivoDe(cuerpo?.archivo));
    return this.fichaDe(id);
  }

  @Post('tareas/:id/validar')
  async validar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { horas?: number },
  ) {
    await this.exigirEdicion(autorizacion);
    await this.tareas.validar(id, Number(cuerpo?.horas));
    return this.fichaDe(id);
  }

  @Post('tareas/:id/notas/:notaId/anular')
  async anular(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
    @Body() cuerpo: { texto?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.anular(id, notaId, usuario, cuerpo?.texto ?? '');
    return this.fichaDe(id);
  }

  @Get('tareas/:id/notas/:notaId/archivo')
  async archivo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
  ) {
    await this.exigir(autorizacion);
    const archivo = await this.tareas.leerArchivo(id, notaId);
    return new StreamableFile(archivo.bytes, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
  }

  @Post('tareas/:id/correccion')
  async corregir(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { campo?: string; valor?: string },
  ) {
    await this.exigirEdicion(autorizacion);
    await this.tareas.corregir(id, cuerpo?.campo ?? '', cuerpo?.valor ?? '');
    return this.fichaDe(id);
  }

  @Post('tareas/:id/releer')
  async releer(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { campo?: string },
  ) {
    await this.exigirEdicion(autorizacion);
    await this.tareas.releer(id, cuerpo?.campo ?? '');
    return this.fichaDe(id);
  }

  private async fichaDe(id: string) {
    const tarea = await this.tareas.ficha(id);
    if (!tarea) throw new NotFoundException('No está esa tarea.');
    return tarea;
  }

  @Post('mensajes/:id/procesar')
  async procesar(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigirSistema(autorizacion);
    return this.tareas.procesarHilo(id);
  }

  @Get('diccionario')
  async diccionario(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.tareas.diccionario();
  }

  @Post('diccionario')
  async agregar(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { termino?: string }) {
    await this.exigirSistema(autorizacion);
    return this.tareas.agregarTermino(cuerpo?.termino ?? '');
  }

  @Post('diccionario/:id')
  async fijar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { activo?: boolean },
  ) {
    await this.exigirSistema(autorizacion);
    if (typeof cuerpo?.activo !== 'boolean') throw new BadRequestException('Indica si el término queda activo.');
    await this.tareas.fijarTermino(id, cuerpo.activo);
    return { id, activo: cuerpo.activo };
  }

  private async exigir(autorizacion?: string) {
    const token = bearer(autorizacion);
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    return this.identidad.actual(token);
  }

  private async exigirEdicion(autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    if (!puedeEditarTarea(usuario.rol)) throw new ForbiddenException('No tienes permiso para editar la tarea.');
    return usuario;
  }

  private async exigirSistema(autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    if (!puedeOperarSistema(usuario.rol)) throw new ForbiddenException('No tienes permiso para esta operación.');
    return usuario;
  }
}

function archivoDe(archivo?: { nombre?: string; mime?: string; contenido?: string }): { nombre: string; mime: string; contenido: Buffer } | null {
  if (!archivo?.contenido) return null;
  return {
    nombre: archivo.nombre ?? 'foto',
    mime: archivo.mime ?? '',
    contenido: Buffer.from(archivo.contenido, 'base64'),
  };
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
