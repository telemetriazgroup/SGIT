import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import type { EstadoBot, SumideroEstado } from './estado';

export function crearSumideroArchivo(directorio: string): SumideroEstado {
  return {
    async actualizar(estado: EstadoBot, qr?: string) {
      await mkdir(directorio, { recursive: true });
      await writeFile(
        path.join(directorio, 'estado.json'),
        JSON.stringify({ estado, actualizadoEn: new Date().toISOString() }),
      );
      const imagen = path.join(directorio, 'qr.png');
      if (estado === 'esperando_qr' && qr) {
        await QRCode.toFile(imagen, qr);
        return;
      }
      if (estado === 'listo') {
        await rm(imagen, { force: true });
      }
    },
  };
}
