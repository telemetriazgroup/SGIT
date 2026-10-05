import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { TareasModule } from '../tareas/tareas.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [IdentidadModule, TareasModule],
  controllers: [BotController],
  providers: [
    {
      provide: BotService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new BotService(conexiones),
    },
  ],
})
export class BotModule {}
