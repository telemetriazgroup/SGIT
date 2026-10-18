import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { TareasModule } from '../tareas/tareas.module';
import { TareasService } from '../tareas/tareas.service';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { PulsoDespacho } from './pulso-despacho';

@Module({
  imports: [IdentidadModule, TareasModule],
  controllers: [BotController],
  providers: [
    {
      provide: BotService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new BotService(conexiones),
    },
    {
      provide: PulsoDespacho,
      inject: [TareasService, Conexiones, BotService],
      useFactory: (tareas: TareasService, conexiones: Conexiones, bot: BotService) => new PulsoDespacho(tareas, conexiones, bot),
    },
  ],
})
export class BotModule {}
