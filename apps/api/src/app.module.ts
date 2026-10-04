import { Module } from '@nestjs/common';
import { Conexiones } from './conexiones';
import { ConexionesModule } from './conexiones.module';
import { BuzonModule } from './buzon/buzon.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PrepararBase } from './preparar-base';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [ConexionesModule, SaludModule, IdentidadModule, BuzonModule],
  providers: [
    {
      provide: PrepararBase,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new PrepararBase(conexiones),
    },
  ],
})
export class AppModule {}
