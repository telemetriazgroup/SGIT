import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Inject, Param, Post, Res, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { puedeOperarSistema } from '../identidad/permisos';
import { timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { IdentidadService } from '../identidad/identidad.service';
import { Conexiones } from '../conexiones';
import { TareasService } from '../tareas/tareas.service';
import { BotService } from './bot.service';

@Controller()
export class BotController {
  constructor(
    @Inject(BotService) private readonly bot: BotService,
    @Inject(TareasService) private readonly tareas: TareasService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
    @Inject(Conexiones) private readonly conexiones: Conexiones,
  ) {}

  @Get('bot')
  async ver(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.estado();
  }

  @Post('bot/reiniciar')
  async reiniciar(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.marcarReinicio();
  }

  @Post('bot/olvidar')
  async olvidar(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.marcarOlvido();
  }

  @Get('bot/bitacora')
  async bitacora(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.listarBitacora();
  }

  @Post('bot/bitacora')
  @HttpCode(204)
  async anotarBitacora(
    @Headers('x-bot-clave') clave: string | undefined,
    @Body() cuerpo: { nivel?: string; texto?: string },
  ) {
    this.exigirBot(clave);
    await this.bot.anotarBitacora('whatsapp', cuerpo?.nivel ?? '', cuerpo?.texto ?? '');
  }

  @Get('bot/reinicio')
  async reinicio(@Headers('x-bot-clave') clave: string | undefined) {
    this.exigirBot(clave);
    return this.bot.tomarPedido();
  }

  @Get('bot/qr')
  async qr(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigirSistema(autorizacion);
    const bytes = await this.bot.leerQr();
    return new StreamableFile(bytes, { type: 'image/png', disposition: 'inline' });
  }

  @Post('bot/prueba')
  async prueba(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { telefono?: string; texto?: string }) {
    await this.exigirSistema(autorizacion);
    await this.bot.probar(cuerpo?.telefono ?? '', cuerpo?.texto ?? '');
    return this.bot.estado();
  }

  @Post('bot/comprobar')
  async comprobar(@Headers('authorization') autorizacion: string | undefined) {
    await this.exigirSistema(autorizacion);
    return this.bot.comprobarLinea();
  }

  @Post('bot/fallo')
  @HttpCode(204)
  async fallo(@Headers('x-bot-clave') clave: string | undefined, @Body() cuerpo: { texto?: string }) {
    this.exigirBot(clave);
    await this.bot.anotarFallo(cuerpo?.texto ?? '');
  }

  @Get('bot/mensajes')
  async mensajes(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.mensajes();
  }

  @Get('bot/reporte-imagen')
  async reporteImagen(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.reporteImagen();
  }

  @Get('bot/mi-telefono')
  async miTelefono(@Headers('authorization') autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    const miembros = await this.bot.miembros();
    const propio = miembros.find((miembro) => miembro.correo === usuario.correo);
    return { telefono: propio?.telefono ?? null };
  }

  @Post('bot/mi-telefono')
  async guardarMiTelefono(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { telefono?: string }) {
    const usuario = await this.exigir(autorizacion);
    await this.bot.guardarTelefono(usuario.correo, cuerpo?.telefono ?? '');
    const miembros = await this.bot.miembros();
    const propio = miembros.find((miembro) => miembro.correo === usuario.correo);
    return { telefono: propio?.telefono ?? null };
  }

  @Get('bot/miembros')
  async miembros(@Headers('authorization') autorizacion?: string) {
    await this.exigirSistema(autorizacion);
    return this.bot.miembros();
  }

  @Post('bot/miembros')
  async telefono(@Headers('authorization') autorizacion: string | undefined, @Body() cuerpo: { correo?: string; telefono?: string }) {
    await this.exigirSistema(autorizacion);
    if (!cuerpo?.correo?.trim()) throw new BadRequestException('Indica el miembro.');
    await this.bot.guardarTelefono(cuerpo.correo, cuerpo.telefono ?? '');
    return this.bot.miembros();
  }

  @Post('bot/sesion')
  async sesion(@Headers('x-bot-clave') clave: string | undefined, @Body() cuerpo: { estado?: string }) {
    this.exigirBot(clave);
    if (!cuerpo?.estado) throw new BadRequestException('Indica el estado.');
    await this.bot.publicar(cuerpo.estado);
    return this.bot.estado();
  }

  @Post('bot/lider')
  async lider(@Headers('x-bot-clave') clave: string | undefined, @Body() cuerpo: { dueno?: string }) {
    this.exigirBot(clave);
    const dueno = cuerpo?.dueno?.trim();
    if (!dueno) throw new BadRequestException('Indica el dueño.');
    const tomado = await this.bot.reclamar(dueno);
    if (!tomado) throw new UnauthorizedException('Ya hay un líder.');
    return { lider: true };
  }

  @Post('bot/lider/soltar')
  async soltar(@Headers('x-bot-clave') clave: string | undefined, @Body() cuerpo: { dueno?: string }) {
    this.exigirBot(clave);
    if (cuerpo?.dueno) await this.bot.soltar(cuerpo.dueno);
    return { lider: false };
  }

  @Get('bot/salida')
  async salida(@Headers('x-bot-clave') clave: string | undefined, @Res({ passthrough: true }) respuesta: Response) {
    this.exigirBot(clave);
    const aviso = await this.bot.tomarAviso();
    if (!aviso) {
      respuesta.status(204);
      return;
    }
    return aviso;
  }

  @Post('bot/salida/:id/enviado')
  @HttpCode(204)
  async enviado(@Headers('x-bot-clave') clave: string | undefined, @Param('id') id: string) {
    this.exigirBot(clave);
    await this.bot.confirmarEnvio(id);
  }

  @Post('bot/salida/:id/soltar')
  @HttpCode(204)
  async soltarAviso(@Headers('x-bot-clave') clave: string | undefined, @Param('id') id: string) {
    this.exigirBot(clave);
    await this.bot.soltarAviso(id);
  }

  @Post('bot/entrar')
  async entrar(
    @Headers('x-bot-clave') clave: string | undefined,
    @Body() cuerpo: { telefono?: string; texto?: string; archivo?: { nombre?: string; mime?: string; contenido?: string }; archivos?: Array<{ nombre?: string; mime?: string; contenido?: string }> },
  ) {
    this.exigirBot(clave);
    if (!cuerpo?.telefono?.trim()) throw new BadRequestException('Indica el teléfono.');
    const archivo = cuerpo.archivo?.contenido
      ? { nombre: cuerpo.archivo.nombre ?? 'foto', mime: cuerpo.archivo.mime ?? '', contenido: Buffer.from(cuerpo.archivo.contenido, 'base64') }
      : null;
    const extras = (cuerpo.archivos ?? [])
      .filter((item) => item.contenido)
      .slice(0, 5)
      .map((item) => ({ nombre: item.nombre ?? 'foto', mime: item.mime ?? '', contenido: Buffer.from(item.contenido ?? '', 'base64') }));
    return this.bot.recibir(cuerpo.telefono, cuerpo.texto ?? '', archivo, this.tareas, extras);
  }

  private async exigir(autorizacion?: string) {
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    return this.identidad.actual(token);
  }

  private async exigirSistema(autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    if (!puedeOperarSistema(usuario.rol)) throw new ForbiddenException('No tienes permiso para el bot.');
    return usuario;
  }

  private exigirBot(clave?: string) {
    const esperada = Buffer.from(this.conexiones.sesionSecreto);
    const recibida = Buffer.from(clave ?? '');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      throw new UnauthorizedException('El bot no está autorizado.');
    }
  }
}
