import { Body, Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadService } from '../identidad/identidad.service';
import { puedeEditarTarea } from '../identidad/permisos';
import { ImpresionServicio } from '../impresion/servicio';
import { TareasService } from '../tareas/tareas.service';
import { FabricacionServicio } from './servicio';
import type { MaterialPedido } from './reglas';

@Controller()
export class FabricacionController {
  constructor(
    @Inject(FabricacionServicio) private readonly fabricacion: FabricacionServicio,
    @Inject(TareasService) private readonly tareas: TareasService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
    @Inject(Conexiones) private readonly conexiones: Conexiones,
  ) {}

  @Post('tareas/:id/hilos/:hiloId/insumos')
  async pedir(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('hiloId') hiloId: string,
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const pedido = await this.fabricacion.pedir(hiloId, '', usuario);
    const ficha = await this.tareas.ficha(id);
    if (!ficha) throw new NotFoundException('Esa tarea ya no está.');
    return { ...ficha, enlaceInsumos: pedido.enlace, ordenFabricacion: pedido.orden };
  }

  @Post('tareas/:id/hilos/:hiloId/reporte')
  async reporte(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('hiloId') hiloId: string,
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    return { texto: await this.fabricacion.pedirReporte(hiloId) };
  }

  @Post('tareas/:id/hilos/:hiloId/imprimir')
  async imprimir(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Param('hiloId') hiloId: string,
  ) {
    const usuario = await this.exigirEdicion(autorizacion);
    await this.tareas.exigeVisible(usuario.correo, 'tarea', id);
    const leido = await this.fabricacion.leerReporte(hiloId);
    if (!leido.ok) return { texto: leido.texto };
    const texto = await new ImpresionServicio(this.conexiones).enviar(leido.pdf, leido.nombre, `sgit-mo-${leido.id}-${Date.now()}`, { via: 'orden', autor: usuario.nombre });
    await this.fabricacion.anotarImpresion(hiloId, usuario, texto);
    return { texto };
  }

  @Get('fabricacion/:token')
  publica(@Param('token') token: string) {
    return this.fabricacion.publica(token);
  }

  @Post('fabricacion/:token')
  async proponer(@Param('token') token: string, @Body() cuerpo: { materiales?: MaterialPedido[]; modemSerie?: string }) {
    return { texto: await this.fabricacion.proponer(token, cuerpo ?? {}) };
  }

  private async exigirEdicion(autorizacion?: string) {
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    const usuario = await this.identidad.actual(token);
    if (!puedeEditarTarea(usuario.rol)) throw new ForbiddenException('No tienes permiso para editar la tarea.');
    return usuario;
  }
}
