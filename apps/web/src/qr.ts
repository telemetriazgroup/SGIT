import QRCode from 'qrcode';

export const MARGEN_QR = 4;
export const FRACCION_LOGO = 0.22;

type Simbolo = {
  modules: { size: number; get(x: number, y: number): boolean };
};

const crear = (QRCode as unknown as { create: (texto: string, opciones?: { errorCorrectionLevel?: 'H' }) => Simbolo }).create;

export function enlaceDeQr(valor: string): string {
  const limpio = valor.trim();
  if (!limpio) throw new Error('Escribe el enlace.');
  if (limpio.length > 2000) throw new Error('El enlace es demasiado largo para un código QR.');
  const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    throw new Error('El enlace no es válido.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('El enlace tiene que empezar por http o https.');
  if (!url.hostname) throw new Error('El enlace no es válido.');
  return url.toString();
}

export function modulosDe(enlace: string): boolean[][] {
  let simbolo: Simbolo;
  try {
    simbolo = crear(enlace, { errorCorrectionLevel: 'H' });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : '';
    if (/too big|too long/i.test(mensaje)) throw new Error('El enlace es demasiado largo para un código QR.');
    throw new Error('No se pudo armar el código QR.');
  }
  const n = simbolo.modules.size;
  const filas: boolean[][] = [];
  for (let y = 0; y < n; y += 1) {
    const fila: boolean[] = [];
    for (let x = 0; x < n; x += 1) fila.push(Boolean(simbolo.modules.get(x, y)));
    filas.push(fila);
  }
  return filas;
}

export function cajaLogo(modulos: number): { x: number; y: number; lado: number } {
  const hueco = Math.max(3, modulos - 16);
  const lado = Math.min(hueco, Math.max(3, Math.round(modulos * FRACCION_LOGO)));
  const x = Math.floor((modulos - lado) / 2);
  return { x, y: x, lado };
}

export function tapaBuscador(modulos: number, caja: { x: number; y: number; lado: number }): boolean {
  const zonas = [
    { x: 0, y: 0 },
    { x: modulos - 7, y: 0 },
    { x: 0, y: modulos - 7 },
  ];
  return zonas.some((zona) => seCruzan(caja, { x: zona.x, y: zona.y, lado: 7 }));
}

export function recorteLogo(ancho: number, alto: number, caja: number): { x: number; y: number; ancho: number; alto: number } {
  const escala = Math.min(caja / ancho, caja / alto);
  const puestoAncho = ancho * escala;
  const puestoAlto = alto * escala;
  return {
    x: (caja - puestoAncho) / 2,
    y: (caja - puestoAlto) / 2,
    ancho: puestoAncho,
    alto: puestoAlto,
  };
}

export function medidaQr(modulos: number, escala = 12): number {
  return (modulos + MARGEN_QR * 2) * escala;
}

type Lienzo = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, ancho: number, alto: number): void;
  drawImage(imagen: CanvasImageSource, x: number, y: number, ancho: number, alto: number): void;
};

export function pintarQr(
  ctx: Lienzo,
  modulos: boolean[][],
  logo: { imagen: CanvasImageSource; ancho: number; alto: number },
  escala = 12,
): void {
  const n = modulos.length;
  const lado = medidaQr(n, escala);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = '#1c1915';
  for (let y = 0; y < n; y += 1) {
    const fila = modulos[y] ?? [];
    for (let x = 0; x < n; x += 1) {
      if (fila[x]) ctx.fillRect((x + MARGEN_QR) * escala, (y + MARGEN_QR) * escala, escala, escala);
    }
  }
  const caja = cajaLogo(n);
  const origenPlaca = (caja.x + MARGEN_QR - 1) * escala;
  const placa = (caja.lado + 2) * escala;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(origenPlaca, origenPlaca, placa, placa);
  const hueco = caja.lado * escala;
  const puesto = recorteLogo(logo.ancho, logo.alto, hueco);
  const base = (caja.x + MARGEN_QR) * escala;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logo.imagen, base + puesto.x, base + puesto.y, puesto.ancho, puesto.alto);
}

function seCruzan(a: { x: number; y: number; lado: number }, b: { x: number; y: number; lado: number }): boolean {
  return a.x < b.x + b.lado && a.x + a.lado > b.x && a.y < b.y + b.lado && a.y + a.lado > b.y;
}
