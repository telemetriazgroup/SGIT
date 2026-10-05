import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { TareasController } from './tareas.controller';
import { TareasService } from './tareas.service';

@Module({
  imports: [IdentidadModule],
  controllers: [TareasController],
  providers: [
    {
      provide: TareasService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new TareasService(conexiones),
    },
  ],
  exports: [TareasService],
})
export class TareasModule {}
