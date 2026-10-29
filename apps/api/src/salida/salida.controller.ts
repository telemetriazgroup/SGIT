import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { leerConfiguracion } from '../configuracion';
import { IdentidadService } from '../identidad/identidad.service';
import { SalidaService, type PiezaCorreo, type PiezaWhatsapp } from './salida.service';

@Controller()
export class SalidaController {
  constructor(
    @Inject(SalidaService) private readonly salida: SalidaService,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
  ) {}

  @Get('salida/registros')
  async registros(@Headers('authorization') autorizacion: string | undefined, @Query('q') busqueda?: string) {
    await this.exigir(autorizacion);
    return this.salida.registros(busqueda ?? '');
  }

  @Post('salida/whatsapp/:id/contacto')
  async contacto(
    @Headers('authorization') autorizacion: string | undefined,
    @Param('id') id: string,
    @Body() cuerpo: { contacto?: string },
  ) {
    await this.exigir(autorizacion);
    await this.salida.cambiarContacto(id, cuerpo?.contacto ?? '');
    return this.salida.registros();
  }

  @Post('salida/whatsapp/:id/quitar')
  async quitar(@Headers('authorization') autorizacion: string | undefined, @Param('id') id: string) {
    await this.exigir(autorizacion);
    await this.salida.quitarWhatsapp(id);
    return this.salida.registros();
  }

  @Post('salida')
  async cargar(
    @Headers('authorization') autorizacion: string | undefined,
    @Headers('x-salida-clave') clave: string | undefined,
    @Body() cuerpo: { whatsapp?: PiezaWhatsapp | PiezaWhatsapp[]; correo?: PiezaCorreo | PiezaCorreo[]; correos?: PiezaCorreo | PiezaCorreo[] },
  ) {
    await this.exigir(autorizacion, clave);
    return this.salida.recibir(cuerpo ?? {});
  }

  private async exigir(autorizacion?: string, clave?: string): Promise<void> {
    if (claveValida(leerConfiguracion().salidaClave, clave)) return;
    const token = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : '';
    if (!token) throw new UnauthorizedException('Falta la clave de salida.');
    const usuario = await this.identidad.actual(token);
    if (usuario.rol !== 'superusuario' && usuario.rol !== 'administrador' && usuario.rol !== 'operador') {
      throw new UnauthorizedException('Falta la clave de salida.');
    }
  }
}

function claveValida(esperada: string, recibida?: string): boolean {
  if (!esperada || !recibida) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida);
  return a.length === b.length && timingSafeEqual(a, b);
}
