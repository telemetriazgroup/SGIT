import { Module } from '@nestjs/common';
import { leerConfiguracion } from '../configuracion';
import { Conexiones } from '../conexiones';
import { IdentidadModule } from '../identidad/identidad.module';
import { refreshGuardado } from '../buzon/buzon.service';
import { crearClienteGmail } from '../buzon/registro-cliente';
import { CorreoSalida } from './correo-salida';
import { SalidaController } from './salida.controller';
import { SalidaService } from './salida.service';

@Module({
  imports: [IdentidadModule],
  controllers: [SalidaController],
  providers: [
    {
      provide: SalidaService,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => new SalidaService(conexiones),
    },
    {
      provide: CorreoSalida,
      inject: [Conexiones],
      useFactory: (conexiones: Conexiones) => {
        const config = leerConfiguracion();
        const cliente = crearClienteGmail(config, () => refreshGuardado(conexiones, config.claveCifrado));
        return new CorreoSalida(conexiones, cliente, config);
      },
    },
  ],
})
export class SalidaModule {}
