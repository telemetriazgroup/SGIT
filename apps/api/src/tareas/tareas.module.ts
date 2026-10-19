import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { PulsoOdoo } from '../odoo/servicio';
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
    {
      provide: PulsoOdoo,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new PulsoOdoo(conexiones),
    },
  ],
  exports: [TareasService],
})
export class TareasModule {}
