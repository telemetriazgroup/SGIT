import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { RespaldoController } from './respaldo.controller';
import { RespaldoServicio } from './servicio';

@Module({
  imports: [IdentidadModule],
  controllers: [RespaldoController],
  providers: [
    {
      provide: RespaldoServicio,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new RespaldoServicio(conexiones),
    },
  ],
})
export class RespaldoModule {}
