import { FormEvent, useState } from 'react';
import { enlaceDeQr, medidaQr, modulosDe, pintarQr } from './qr';

export function PanelQr() {
  const [enlace, setEnlace] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function generar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setListo(false);
    if (!logo) {
      setAviso('Elige un logo.');
      return;
    }
    setOcupado(true);
    try {
      const destino = enlaceDeQr(enlace);
      const modulos = modulosDe(destino);
      const imagen = await leerLogo(logo);
      const lienzo = document.getElementById('lienzo-qr');
      if (!(lienzo instanceof HTMLCanvasElement)) throw new Error('No se pudo preparar la imagen.');
      const lado = medidaQr(modulos.length);
      lienzo.width = lado;
      lienzo.height = lado;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('No se pudo preparar la imagen.');
      pintarQr(ctx, modulos, { imagen, ancho: imagen.naturalWidth, alto: imagen.naturalHeight });
      setListo(true);
    } catch (error: unknown) {
      setAviso(error instanceof Error ? error.message : 'No se pudo armar el código QR.');
    } finally {
      setOcupado(false);
    }
  }

  function descargar() {
    const lienzo = document.getElementById('lienzo-qr');
    if (!(lienzo instanceof HTMLCanvasElement) || !listo) return;
    lienzo.toBlob((blob) => {
      if (!blob) {
        setAviso('No se pudo preparar la descarga.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const ancla = document.createElement('a');
      ancla.href = url;
      ancla.download = 'codigo-qr.png';
      ancla.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <section>
      <h2>Código QR</h2>
      <p>Escribe el enlace y elige el logo. El código se arma aquí mismo, sin un servicio externo. Al escanearlo se abre ese enlace. El logo queda al centro.</p>
      <form className="qr-form" onSubmit={(evento) => void generar(evento)}>
        <label htmlFor="enlace-qr">Enlace</label>
        <input id="enlace-qr" type="text" inputMode="url" required value={enlace} placeholder="https://ztrack.app/SGIT" onChange={(evento) => { setEnlace(evento.target.value); setListo(false); }} />
        <label htmlFor="logo-qr">Logo</label>
        <input
          id="logo-qr"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(evento) => {
            setLogo(evento.target.files?.[0] ?? null);
            setListo(false);
          }}
        />
        <div className="qr-acciones">
          <button type="submit" className="primario" disabled={ocupado}>{ocupado ? 'Armando…' : 'Generar'}</button>
          <button type="button" disabled={!listo} onClick={descargar}>Descargar</button>
        </div>
      </form>
      {aviso ? <p className="error" role="alert">{aviso}</p> : null}
      <canvas id="lienzo-qr" className={listo ? 'qr-lienzo' : 'qr-lienzo oculto'} aria-label="Código QR generado" />
    </section>
  );
}

function leerLogo(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      if (imagen.naturalWidth < 1 || imagen.naturalHeight < 1) {
        reject(new Error('No se pudo leer el logo.'));
        return;
      }
      resolve(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer el logo.'));
    };
    imagen.src = url;
  });
}
