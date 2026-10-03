import {
  BadRequestException,
  Body,
  Controller,
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
}

function bearer(autorizacion?: string): string | null {
  if (!autorizacion?.startsWith('Bearer ')) return null;
  const token = autorizacion.slice('Bearer '.length).trim();
  return token || null;
}
