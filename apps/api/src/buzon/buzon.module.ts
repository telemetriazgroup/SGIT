import { Module } from '@nestjs/common';
import { leerConfiguracion } from '../configuracion';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { BuzonController } from './buzon.controller';
import { BuzonService, refreshGuardado } from './buzon.service';
import { crearClienteGmail } from './registro-cliente';

@Module({
  imports: [IdentidadModule],
  controllers: [BuzonController],
  providers: [
    {
      provide: 'CONFIG',
      useFactory: () => leerConfiguracion(),
    },
    {
      provide: BuzonService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => {
        const config = leerConfiguracion();
        const cliente = crearClienteGmail(config, () => refreshGuardado(conexiones, config.claveCifrado));
        return new BuzonService(conexiones, cliente, config);
      },
    },
  ],
})
export class BuzonModule {}
