import { Module } from '@nestjs/common';
import { Conexiones } from './conexiones';
import { ConexionesModule } from './conexiones.module';
import { BuzonModule } from './buzon/buzon.module';
import { BotModule } from './bot/bot.module';
import { TareasModule } from './tareas/tareas.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PrepararBase } from './preparar-base';
import { SaludModule } from './salud/salud.module';
import { ChipsModule } from './chips/chips.module';
import { ModemsModule } from './modems/modems.module';
import { FabricacionModule } from './fabricacion/fabricacion.module';
import { LectorModule } from './lector/lector.module';
import { RespaldoModule } from './respaldo/respaldo.module';

@Module({
  imports: [ConexionesModule, SaludModule, IdentidadModule, BuzonModule, TareasModule, BotModule, ChipsModule, ModemsModule, FabricacionModule, RespaldoModule, LectorModule],
  providers: [
    {
      provide: PrepararBase,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new PrepararBase(conexiones),
    },
  ],
})
export class AppModule {}
