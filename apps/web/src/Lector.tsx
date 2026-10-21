import { FormEvent, useEffect, useState } from 'react';

type Configuracion = {
  url: string;
  guardada: string;
  origen: 'pantalla' | 'entorno';
};

type Lectura = {
  codigo: string | null;
  tipo: string;
  confianza: number | null;
  mensaje: string;
  proceso: string;
  detalle: unknown;
};

export function PanelLector({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [url, setUrl] = useState('');
  const [origen, setOrigen] = useState<Configuracion['origen']>('entorno');
  const [caso, setCaso] = useState('equipo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void pedir<Configuracion>(apiUrl, token, '/lector/configuracion')
      .then((config) => {
        setUrl(config.url);
        setOrigen(config.origen);
      })
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      const config = await pedir<Configuracion>(apiUrl, token, '/lector/configuracion', { method: 'POST', body: JSON.stringify({ url }) });
      setUrl(config.url);
      setOrigen(config.origen);
      setAviso('La conexión quedó guardada.');
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
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/lector/probar', { method: 'POST', body: JSON.stringify({ url }) });
      setAviso(respuesta.texto);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function leer() {
    if (!archivo) {
      setAviso('Elige una imagen.');
      return;
    }
    setOcupado(true);
    setAviso(null);
    setLectura(null);
    try {
      const contenido = await base64(archivo);
      setLectura(await pedir<Lectura>(apiUrl, token, '/lector/leer', {
        method: 'POST',
        body: JSON.stringify({ url, caso, nombre: archivo.name, mime: archivo.type || 'image/jpeg', contenido }),
      }));
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  const bien = aviso?.startsWith('La conexión') || aviso?.startsWith('El lector en');

  return (
    <section className="ficha">
      <h2>Lector de imágenes</h2>
      <p>SGIT lee contenedores, series y chips en este servicio. La dirección la usa el servidor de SGIT. Si el lector se muda a otra máquina, cámbiala aquí y prueba con una foto. La prueba no guarda la imagen.</p>
      {origen === 'entorno' ? <p className="bajada">La dirección está en el entorno. Al guardar queda en esta pantalla.</p> : null}
      {aviso ? <p className={bien ? 'bajada' : 'error'}>{aviso}</p> : null}
      <form className="cuenta-alta" onSubmit={(evento) => void guardar(evento)}>
        <label className="ancho" htmlFor="lector-url">
          Dirección
          <input id="lector-url" value={url} onChange={(evento) => setUrl(evento.target.value)} placeholder="http://servidor:8000" />
        </label>
        <div className="bitacora-acciones">
          <button type="submit" className="primario" disabled={ocupado}>
            Guardar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void probar()}>
            Probar conexión
          </button>
        </div>
        <label htmlFor="lector-caso">
          Caso
          <select id="lector-caso" value={caso} onChange={(evento) => setCaso(evento.target.value)}>
            <option value="equipo">Contenedor o serie</option>
            <option value="chip">Chip</option>
          </select>
        </label>
        <label htmlFor="lector-archivo">
          Imagen
          <input id="lector-archivo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)} />
        </label>
        <button type="button" disabled={ocupado} onClick={() => void leer()}>
          Enviar imagen
        </button>
      </form>
      {lectura ? (
        <>
          <h3>Resultado</h3>
          <p>{lectura.mensaje}</p>
          <p>{lectura.codigo ? `Código ${lectura.codigo}` : 'Sin código'}{lectura.tipo ? ` · ${lectura.tipo}` : ''}{lectura.confianza != null ? ` · confianza ${lectura.confianza}` : ''}</p>
          <h3>Proceso</h3>
          <pre className="lectura-imagen">{lectura.proceso}</pre>
        </>
      ) : null}
    </section>
  );
}

function base64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result ?? '').split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error);
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
