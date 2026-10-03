import { config } from 'dotenv';
import path from 'path';
import qrcodeTerminal from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { enlazarEstado } from './estado';
import { directorioDeEstado, rutaDeSesion } from './rutas';
import { crearSumideroArchivo } from './sumidero';

config({ path: path.resolve(__dirname, '../../../.env') });

const dataPath = rutaDeSesion();
const cliente = new Client({
  authStrategy: new LocalAuth({ clientId: 'sgit-lab', dataPath }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

const archivos = crearSumideroArchivo(directorioDeEstado());

enlazarEstado(cliente, {
  async actualizar(estado, qr) {
    await archivos.actualizar(estado, qr);
    if (estado === 'esperando_qr' && qr) {
      console.log('SGIT bot: esperando QR. Imagen en sessions/qr.png');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (estado === 'listo') {
      console.log('SGIT bot: listo');
    }
    if (estado === 'desconectado') {
      console.log('SGIT bot: desconectado');
    }
  },
});

void cliente.initialize();
