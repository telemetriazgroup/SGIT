import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { TareasModule } from '../tareas/tareas.module';
import { FabricacionController } from './fabricacion.controller';
import { FabricacionServicio } from './servicio';

@Module({
  imports: [IdentidadModule, TareasModule],
  controllers: [FabricacionController],
  providers: [
    {
      provide: FabricacionServicio,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new FabricacionServicio(conexiones),
    },
  ],
})
export class FabricacionModule {}
