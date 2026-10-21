import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { LectorController } from './lector.controller';
import { LectorServicio } from './servicio';

@Module({
  imports: [IdentidadModule],
  controllers: [LectorController],
  providers: [
    {
      provide: LectorServicio,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new LectorServicio(conexiones),
    },
  ],
})
export class LectorModule {}