import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentidadService } from './identidad.service';

type CuerpoIngreso = {
  correo?: string;
  contrasena?: string;
};

@Controller()
export class IdentidadController {
  constructor(@Inject(IdentidadService) private readonly identidad: IdentidadService) {}

  @Post('sesion')
  entrar(@Body() cuerpo: CuerpoIngreso) {
    const correo = cuerpo?.correo?.trim();
    const contrasena = cuerpo?.contrasena;
    if (!correo || !contrasena) {
      throw new BadRequestException('Indica correo y contraseña.');
    }
    return this.identidad.entrar(correo, contrasena);
  }

  @Get('sesion')
  actual(@Headers('authorization') autorizacion?: string) {
    const token = bearer(autorizacion);
    if (!token) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    return this.identidad.actual(token);
  }

  @Get('cuenta')
  async cuenta(@Headers('authorization') autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    return this.identidad.perfil(usuario.correo);
  }

  @Post('cuenta')
  async guardarCuenta(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { nombre?: string; telefono?: string },
  ) {
    const usuario = await this.exigir(autorizacion);
    return this.identidad.guardarPerfil(usuario.correo, cuerpo?.nombre ?? '', cuerpo?.telefono ?? '');
  }

  @Post('cuenta/contrasena')
  async contrasenaPropia(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { actual?: string; nueva?: string },
  ) {
    const usuario = await this.exigir(autorizacion);
    await this.identidad.cambiarContrasena(usuario.correo, cuerpo?.actual ?? '', cuerpo?.nueva ?? '');
    return { lista: true };
  }

  @Post('usuarios/datos')
  async datos(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { correo?: string; nombre?: string; rol?: string; activo?: boolean; telefono?: string },
  ) {
    const actor = await this.exigirSuperusuario(autorizacion);
    if (!cuerpo?.correo?.trim()) throw new BadRequestException('Indica la cuenta.');
    if (typeof cuerpo.activo !== 'boolean') throw new BadRequestException('Indica si la cuenta queda activa.');
    return this.identidad.actualizar(actor.correo, cuerpo.correo, cuerpo.nombre ?? '', cuerpo.rol ?? '', cuerpo.activo, cuerpo.telefono ?? '');
  }

  @Post('usuarios/contrasena')
  async contrasenaAjena(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { correo?: string; contrasena?: string },
  ) {
    await this.exigirSuperusuario(autorizacion);
    if (!cuerpo?.correo?.trim()) throw new BadRequestException('Indica la cuenta.');
    await this.identidad.reiniciarContrasena(cuerpo.correo, cuerpo.contrasena ?? '');
    return { lista: true };
  }

  @Get('usuarios')
  async usuarios(@Headers('authorization') autorizacion?: string) {
    await this.exigirSuperusuario(autorizacion);
    return this.identidad.listar();
  }

  @Post('usuarios')
  async crear(
    @Headers('authorization') autorizacion: string | undefined,
    @Body() cuerpo: { nombre?: string; correo?: string; contrasena?: string; rol?: string },
  ) {
    await this.exigirSuperusuario(autorizacion);
    await this.identidad.crear(cuerpo?.nombre ?? '', cuerpo?.correo ?? '', cuerpo?.contrasena ?? '', cuerpo?.rol ?? '');
    return this.identidad.listar();
  }

  private async exigir(autorizacion?: string) {
    const token = bearer(autorizacion);
    if (!token) throw new UnauthorizedException('Sesión no válida.');
    return this.identidad.actual(token);
  }

  private async exigirSuperusuario(autorizacion?: string) {
    const usuario = await this.exigir(autorizacion);
    if (usuario.rol !== 'superusuario') throw new ForbiddenException('No tienes permiso para las cuentas.');
    return usuario;
  }
}

function bearer(autorizacion?: string): string | null {
  if (!autorizacion?.startsWith('Bearer ')) return null;
  const token = autorizacion.slice('Bearer '.length).trim();
  return token || null;
}
