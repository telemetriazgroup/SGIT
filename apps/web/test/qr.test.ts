import { describe, expect, test } from 'vitest';
import { cajaLogo, enlaceDeQr, modulosDe, tapaBuscador } from '../src/qr';

const BUSCADOR = [
  [true, true, true, true, true, true, true],
  [true, false, false, false, false, false, true],
  [true, false, true, true, true, false, true],
  [true, false, true, true, true, false, true],
  [true, false, true, true, true, false, true],
  [true, false, false, false, false, false, true],
  [true, true, true, true, true, true, true],
];

describe('código QR local', () => {
  test('normaliza el enlace y rechaza uno vacío', () => {
    expect(enlaceDeQr('ztrack.app/SGIT')).toBe('https://ztrack.app/SGIT');
    expect(enlaceDeQr('https://ztrack.app/SGIT')).toBe('https://ztrack.app/SGIT');
    expect(() => enlaceDeQr('   ')).toThrow(/Escribe el enlace/);
  });

  test('arma una matriz cuadrada con los tres buscadores y deja el centro libre para el logo', () => {
    const modulos = modulosDe('https://ztrack.app/SGIT');
    expect(modulos.length).toBeGreaterThanOrEqual(21);
    expect(modulos.every((fila) => fila.length === modulos.length)).toBe(true);
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        expect(modulos[y]?.[x]).toBe(BUSCADOR[y]?.[x]);
      }
    }
    const caja = cajaLogo(modulos.length);
    expect(tapaBuscador(modulos.length, caja)).toBe(false);
    expect(caja.lado / modulos.length).toBeLessThanOrEqual(0.24);
  });
});
