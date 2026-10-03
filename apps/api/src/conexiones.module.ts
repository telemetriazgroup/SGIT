import { Global, Module } from '@nestjs/common';
import { Conexiones } from './conexiones';
import { leerConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [
    {
      provide: Conexiones,
      useFactory: () => new Conexiones(leerConfiguracion()),
    },
  ],
  exports: [Conexiones],
})
export class ConexionesModule {}
