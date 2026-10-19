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
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeHilo(usuario.correo, id);
    return this.tareas.resumenDeMensaje(id);
  }

  @Post('hilos/:id/notas')
  async notaHilo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { tipo?: string; texto?: string; archivo?: { nombre?: string; mime?: string; contenido?: string } },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.anotarEnHilo(id, usuario, cuerpo?.tipo ?? '', cuerpo?.texto ?? '', archivoDe(cuerpo?.archivo));
    return this.tareas.resumenDeMensaje(id);
  }

  @Post('hilos/:id/cerrar')
  async cerrarHilo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { texto?: string; archivo?: { nombre?: string; mime?: string; contenido?: string } },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.cerrarHilo(id, usuario, cuerpo?.texto ?? '', archivoDe(cuerpo?.archivo));
    return { resuelto: true };
  }

  @Get('hilos/:id/cierre')
  async cierre(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeHilo(usuario.correo, id);
    const archivo = await this.tareas.leerCierre(id);
    return new StreamableFile(archivo.bytes, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
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
    const usuario = await this.exigirEdicion(autorizacion);
    if (sector !== 'pendiente' && sector !== 'otros' && sector !== 'internos') {
      throw new BadRequestException('El sector es pendiente, otros o internos.');
    }
    const cola = atencion === 'por_atender' || atencion === 'atendido' || atencion === 'resuelto' ? atencion : null;
    return this.tareas.sector(sector, numero(pagina), area?.trim() || null, busqueda ?? '', sector === 'internos' ? cola : null, usuario.rol === 'superusuario');
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
    @Query('vista') vista?: string,
  ) {
    const usuario = await this.exigir(autorizacion);
    return this.tareas.listar(numero(pagina), busqueda ?? '', vista === 'resueltas', usuario.rol === 'superusuario');
  }

  @Post('habilitados')
  async habilitar(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { clase?: string; id?: string; visible?: boolean },
  ) {
    const usuario = await this.exigir(autorizacion);
    if (usuario.rol !== 'superusuario') throw new ForbiddenException('Solo el superusuario habilita lo que ve el equipo.');
    if (cuerpo?.clase !== 'tarea' && cuerpo?.clase !== 'interno' && cuerpo?.clase !== 'decision') {
      throw new BadRequestException('La clase es tarea, interno o decisión.');
    }
    if (!cuerpo.id?.trim() || typeof cuerpo.visible !== 'boolean') throw new BadRequestException('Indica el elemento y si queda visible.');
    const visible = await this.tareas.fijarVisible(cuerpo.clase, cuerpo.id, cuerpo.visible);
    return { visible };
  }

  @Post('tareas/:id/cerrar')
  async cerrar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { texto?: string; archivo?: { nombre?: string; mime?: string; contenido?: string } },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.cerrarTarea(id, usuario, cuerpo?.texto ?? '', archivoDe(cuerpo?.archivo));
    return this.fichaDe(id);
  }

  @Post('tareas/:id/odoo/vincular')
  async vincularOdoo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { clase?: string; odooId?: number },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.vincularOdoo(id, cuerpo?.clase ?? '', Number(cuerpo?.odooId));
    return this.fichaDe(id);
  }

  @Get('odoo/configuracion')
  async configuracionOdoo(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigirSuperusuario(autorizacion);
    return this.tareas.configuracionOdoo();
  }

  @Post('odoo/configuracion')
  async guardarOdoo(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { url?: string; db?: string; usuario?: string; clave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string },
  ) {
    await this.exigirSuperusuario(autorizacion);
    return this.tareas.guardarOdoo(cuerpo ?? {});
  }

  @Post('odoo/probar')
  async probarOdoo(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { url?: string; db?: string; usuario?: string; clave?: string; modeloVenta?: string; campoCot?: string; modeloTarea?: string },
  ) {
    await this.exigirSuperusuario(autorizacion);
    return this.tareas.probarOdoo(cuerpo ?? {});
  }

  @Post('tareas/:id/odoo/actualizar')
  async actualizarOdoo(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const tarea = await this.tareas.actualizarOdoo(id);
    if (!tarea) throw new NotFoundException('No está esa tarea.');
    return tarea;
  }

  @Get('tareas/tecnicos')
  async tecnicos(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigirEdicion(autorizacion);
    return this.tareas.tecnicos();
  }

  @Get('tareas/:id')
  async ficha(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigir(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const tarea = await this.tareas.ficha(id);
    if (!tarea) throw new NotFoundException('No está esa tarea.');
    if (!puedeEditarTarea(usuario.rol) && Array.isArray(tarea.notas)) {
      tarea.notas = tarea.notas.filter((nota) => !nota.archivado);
    }
    return tarea;
  }

  @Post('tareas/:id/hilos')
  async fijarHilos(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { cantidad?: number },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.fijarHilos(id, Number(cuerpo?.cantidad));
    return this.fichaDe(id);
  }

  @Post('tareas/:id/hilos/:hiloId')
  async corregirHilo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('hiloId') hiloId: string,
    @Body() cuerpo: { contenedor?: string; maquina?: string; imei?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.corregirHilo(id, hiloId, cuerpo ?? {}, usuario);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/hilos/:hiloId/foto')
  async regularizarFoto(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('hiloId') hiloId: string,
    @Body() cuerpo: { clase?: string; nombre?: string; mime?: string; contenido?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.regularizarFoto(id, hiloId, usuario, cuerpo ?? {});
    return this.fichaDe(id);
  }

  @Post('tareas/:id/transferir')
  async transferir(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { correo?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.transferir(id, usuario, cuerpo?.correo ?? '');
    return this.fichaDe(id);
  }

  @Post('tareas/:id/notas/:notaId/archivar')
  async archivarNota(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
    @Body() cuerpo: { archivado?: boolean },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    if (typeof cuerpo?.archivado !== 'boolean') throw new BadRequestException('Indica si la nota queda archivada.');
    await this.tareas.archivarNota(id, notaId, cuerpo.archivado);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/notas/:notaId/editar')
  async editarNota(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
    @Body() cuerpo: { texto?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.editarNota(id, notaId, cuerpo?.texto ?? '');
    return this.fichaDe(id);
  }

  @Post('tareas/:id/campana')
  async campana(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.marcarCampana(id);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/tiendas/:tiendaId/atender')
  async atenderTienda(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('tiendaId') tiendaId: string,
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.atenderTienda(id, tiendaId);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/tiendas/:tiendaId/realizar')
  async realizarTienda(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('tiendaId') tiendaId: string,
    @Body() cuerpo: { codigo?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.realizarTienda(id, tiendaId, cuerpo?.codigo ?? '');
    return this.fichaDe(id);
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
    @Body() cuerpo: { tipo?: string; texto?: string; tiendaId?: string; archivo?: { nombre?: string; mime?: string; contenido?: string }; archivos?: Array<{ nombre?: string; mime?: string; contenido?: string }> },
  ) {
    const usuario = await this.exigir(autorizacion);
    const lista = listaDe(cuerpo?.archivos, cuerpo?.archivo);
    await this.tareas.anotar(id, usuario, cuerpo?.tipo ?? '', cuerpo?.texto ?? '', lista[0] ?? null, 'web', lista.slice(1), cuerpo?.tiendaId ?? null);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/validar')
  async validar(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { horas?: number },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.validar(id, Number(cuerpo?.horas), new Date(), usuario.correo);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/borrador/confirmar')
  async confirmarBorrador(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.confirmarBorrador(id, usuario);
    return this.fichaDe(id);
  }

  @Post('tareas/:id/borrador/descartar')
  async descartarBorrador(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.descartarBorrador(id, usuario);
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

  @Get('tareas/:id/asignacion/:archivoId')
  async asignacion(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('archivoId') archivoId: string,
  ) {
    const usuario = await this.exigir(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const archivo = await this.tareas.leerAsignacion(id, archivoId);
    return new StreamableFile(archivo.bytes, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
  }

  @Get('tareas/:id/notas/:notaId/archivos/:archivoId')
  async archivoNota(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
    @Param('archivoId') archivoId: string,
  ): Promise<StreamableFile> {
    const usuario = await this.exigir(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const archivo = await this.tareas.leerArchivoNota(id, notaId, archivoId);
    return new StreamableFile(archivo.bytes, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
  }

  @Get('tareas/:id/notas/:notaId/archivo')
  async archivo(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('notaId') notaId: string,
  ) {
    const usuario = await this.exigir(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const archivo = await this.tareas.leerArchivo(id, notaId);
    return new StreamableFile(archivo.bytes, { type: archivo.mime, disposition: `inline; filename="${archivo.nombre.replace(/"/g, '')}"` });
  }

  @Post('tareas/:id/correccion')
  async corregir(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { campo?: string; valor?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    await this.tareas.corregir(id, cuerpo?.campo ?? '', cuerpo?.valor ?? '');
    return this.fichaDe(id);
  }

  @Post('tareas/:id/releer')
  async releer(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { campo?: string },
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
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

  private async exigirSuperusuario(autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    if (usuario.rol !== 'superusuario') throw new ForbiddenException('No tienes permiso para la conexión con Odoo.');
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

function listaDe(
  archivos?: Array<{ nombre?: string; mime?: string; contenido?: string }>,
  archivo?: { nombre?: string; mime?: string; contenido?: string },
): Array<{ nombre: string; mime: string; contenido: Buffer }> {
  const lista = (archivos ?? []).map((item) => archivoDe(item)).filter((item) => item !== null);
  if (lista.length > 0) return lista;
  const uno = archivoDe(archivo);
  return uno ? [uno] : [];
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
