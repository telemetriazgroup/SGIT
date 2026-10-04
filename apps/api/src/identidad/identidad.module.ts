import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadController } from './identidad.controller';
import { IdentidadService } from './identidad.service';

@Module({
  controllers: [IdentidadController],
  providers: [
    {
      provide: IdentidadService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new IdentidadService(conexiones),
    },
  ],
  exports: [IdentidadService],
})
export class IdentidadModule {}
