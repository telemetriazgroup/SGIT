import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module';
import { ImpresionController } from './impresion.controller';

@Module({
  imports: [IdentidadModule],
  controllers: [ImpresionController],
})
export class ImpresionModule {}
