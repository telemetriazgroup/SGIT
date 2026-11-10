import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { GensetController } from './genset.controller';
import { GensetService, PulsoGenset } from './genset.service';

@Module({
  imports: [IdentidadModule],
  controllers: [GensetController],
  providers: [
    {
      provide: GensetService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new GensetService(conexiones),
    },
    {
      provide: PulsoGenset,
      inject: [GensetService],
      useFactory: (servicio: GensetService) => new PulsoGenset(servicio),
    },
  ],
})
export class GensetModule {}
