import { FormEvent, useEffect, useState } from 'react';

type Configuracion = { baseUrl: string; clavePuesta: boolean };

export function PanelImprimir({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [clave, setClave] = useState('');
  const [clavePuesta, setClavePuesta] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void pedir<Configuracion>(apiUrl, token, '/impresion/configuracion')
      .then((config) => {
        setBaseUrl(config.baseUrl);
        setClavePuesta(config.clavePuesta);
      })
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      const config = await pedir<Configuracion>(apiUrl, token, '/impresion/configuracion', {
        method: 'POST',
        body: JSON.stringify({ baseUrl, clave }),
      });
      setBaseUrl(config.baseUrl);
      setClave('');
      setClavePuesta(config.clavePuesta);
      setAviso('La impresión quedó guardada.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setAviso(null);
    try {
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/impresion/probar', { method: 'POST', body: '{}' });
      setAviso(respuesta.texto);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    if (!archivo) {
      setAviso('Elige un PDF.');
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setAviso('El PDF supera 5 MB.');
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      const contenido = await leerArchivo(archivo);
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/impresion/enviar', {
        method: 'POST',
        body: JSON.stringify({ nombre: archivo.name, contenido }),
      });
      setAviso(respuesta.texto);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  const bien = aviso?.startsWith('La impresión quedó') || aviso?.startsWith('La API está') || aviso?.startsWith('Quedó ');
  return (
    <section className="ficha">
      <h2>Imprimir</h2>
      <p>Aquí se guarda la API de la impresora. El envío sale de este servidor, no del navegador. La dirección es la que este servidor puede abrir, y puede ser otra distinta de 192.168.1.166:7101. La clave no se vuelve a mostrar.</p>
      {aviso ? <p className={bien ? 'bajada' : 'error'}>{aviso}</p> : null}
      <form className="cuenta-alta" onSubmit={(evento) => void guardar(evento)}>
        <label htmlFor="impresion-url">
          Dirección de la API
          <input
            id="impresion-url"
            value={baseUrl}
            placeholder="http://192.168.1.166:7101"
            onChange={(evento) => setBaseUrl(evento.target.value)}
            required
          />
        </label>
        <label htmlFor="impresion-clave">
          Clave de la API
          <input
            id="impresion-clave"
            type="password"
            value={clave}
            placeholder={clavePuesta ? 'Dejar en blanco para conservar' : ''}
            onChange={(evento) => setClave(evento.target.value)}
            autoComplete="new-password"
          />
        </label>
        <div className="bitacora-acciones">
          <button type="submit" className="primario" disabled={ocupado}>
            Guardar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void probar()}>
            Probar conexión
          </button>
        </div>
      </form>
      <form
        className="cuenta-alta"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar();
        }}
      >
        <label htmlFor="impresion-pdf">
          PDF de prueba
          <input
            id="impresion-pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
          />
        </label>
        <p className="bajada">Sale una copia en la impresora. Cada envío es un trabajo nuevo.</p>
        <button type="submit" className="primario" disabled={ocupado}>
          Enviar a imprimir
        </button>
      </form>
    </section>
  );
}

function leerArchivo(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result ?? '');
      const coma = texto.indexOf(',');
      resolver(coma >= 0 ? texto.slice(coma + 1) : texto);
    };
    lector.onerror = () => rechazar(new Error('No pude leer el PDF.'));
    lector.readAsDataURL(archivo);
  });
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string | string[] } | null;
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message[0] : cuerpo?.message;
    throw new Error(mensaje ?? 'No se pudo completar la operación.');
  }
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
