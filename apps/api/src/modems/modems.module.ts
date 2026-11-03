import { Module } from '@nestjs/common';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { ModemsController } from './modems.controller';
import { ModemsService, PulsoModems } from './modems.service';

@Module({
  imports: [IdentidadModule],
  controllers: [ModemsController],
  providers: [
    {
      provide: ModemsService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new ModemsService(conexiones),
    },
    {
      provide: PulsoModems,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new PulsoModems(conexiones),
    },
  ],
})
export class ModemsModule {}
