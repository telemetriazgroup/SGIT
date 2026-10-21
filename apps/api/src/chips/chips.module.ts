import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { ChipsController } from './chips.controller';
import { ChipsService, PulsoChips } from './chips.service';

@Module({
  imports: [IdentidadModule],
  controllers: [ChipsController],
  providers: [
    {
      provide: ChipsService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new ChipsService(conexiones),
    },
    {
      provide: PulsoChips,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new PulsoChips(conexiones),
    },
  ],
})
export class ChipsModule {}
