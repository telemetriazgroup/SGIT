import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

@Module({
  controllers: [SaludController],
  providers: [
    {
      provide: SaludService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new SaludService(conexiones),
    },
  ],
})
export class SaludModule {}
