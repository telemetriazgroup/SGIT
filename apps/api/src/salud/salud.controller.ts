import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SaludService } from './salud.service';

@Controller()
export class SaludController {
  constructor(@Inject(SaludService) private readonly salud: SaludService) {}

  @Get('salud')
  @HttpCode(200)
  async ver(@Res({ passthrough: true }) respuesta: Response) {
    const cuerpo = await this.salud.consultar();
    const listo = Object.values(cuerpo).every((estado) => estado === 'listo');
    respuesta.status(listo ? 200 : 503);
    return cuerpo;
  }
}
