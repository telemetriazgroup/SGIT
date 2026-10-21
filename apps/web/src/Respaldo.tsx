import { useEffect, useRef, useState } from 'react';

type Resumen = {
  mensajes: number;
  partesMensajes: number;
  bytesMensajes: number;
  adjuntos: number;
  partesAdjuntos: number;
  bytesAdjuntos: number;
  tareas: number;
  internos: number;
  diccionario: number;
};

type Partida = {
  presente: boolean;
  ruta: string;
  nombre: string;
  texto: string;
};

type AdjuntoParte = {
  gmailMensajeId?: string;
  gmailAdjuntoId?: string;
  contentId?: string | null;
  nombre?: string;
  mime?: string;
  tipo?: string;
  archivo?: string;
};

export function PanelRespaldo({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [partida, setPartida] = useState<Partida | null>(null);
  const [parteCorreo, setParteCorreo] = useState('1');
  const [parteAdjunto, setParteAdjunto] = useState('1');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const parar = useRef(false);

  useEffect(() => {
    void pedir<Resumen>(apiUrl, token, '/respaldo')
      .then(setResumen)
      .catch((error: unknown) => setAviso(texto(error)));
    void pedir<Partida>(apiUrl, token, '/respaldo/partida')
      .then(setPartida)
      .catch(() => setPartida(null));
  }, [apiUrl, token]);

  async function crearPartida() {
    setOcupado(true);
    setAviso('Estoy armando la partida. Puede tardar.');
    try {
      const creada = await pedir<Partida>(apiUrl, token, '/respaldo/partida', { method: 'POST', body: '{}' });
      setPartida(creada);
      setAviso(creada.texto);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function revisarPartida() {
    try {
      setPartida(await pedir<Partida>(apiUrl, token, '/respaldo/partida'));
      setAviso(null);
    } catch (error: unknown) {
      setAviso(texto(error));
    }
  }

  async function asimilarPartida() {
    setOcupado(true);
    setAviso('Estoy asimilando la partida.');
    try {
      const resultado = await pedir<{ texto: string }>(apiUrl, token, '/respaldo/partida/asimilar', { method: 'POST', body: '{}' });
      setAviso(resultado.texto);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function bajarUna(ruta: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await descargar(apiUrl, token, ruta, `sgit-${ruta.replace(/^\//, '').replaceAll('/', '-')}.json`);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function bajarSerie(total: number, rutaDe: (parte: number) => string, conArchivo = false) {
    setOcupado(true);
    parar.current = false;
    setAviso(null);
    try {
      for (let parte = 1; parte <= total; parte += 1) {
        if (parar.current) break;
        setAviso(`Parte ${parte} de ${total}.`);
        const respuesta = await descargar(apiUrl, token, rutaDe(parte), `sgit-${rutaDe(parte).replace(/^\//, '').replaceAll('/', '-')}.json`);
        if (conArchivo && respuesta.archivo) await descargar(apiUrl, token, `${rutaDe(parte)}/archivo`, `sgit-${rutaDe(parte).replace(/^\//, '').replaceAll('/', '-')}.bin`);
        await esperar(200);
      }
      setAviso(parar.current ? 'La descarga se detuvo.' : `Quedaron ${total} partes.`);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function subir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setOcupado(true);
    setAviso(null);
    try {
      const archivos = [...lista];
      const porNombre = new Map(archivos.map((archivo) => [archivo.name, archivo]));
      const notas: string[] = [];
      for (const archivo of archivos) {
        if (!archivo.name.endsWith('.json')) continue;
        const dato = JSON.parse(await archivo.text()) as { tipo?: string; adjuntos?: AdjuntoParte[] };
        const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/respaldo/importar', { method: 'POST', body: JSON.stringify(dato) });
        notas.push(respuesta.texto);
        for (const adjunto of dato.adjuntos ?? []) {
          const binario = adjunto.archivo ? porNombre.get(adjunto.archivo) : undefined;
          if (!binario || !adjunto.gmailMensajeId || !adjunto.gmailAdjuntoId) continue;
          const subido = await pedir<{ texto: string }>(apiUrl, token, '/respaldo/archivo', {
            method: 'POST',
            body: await binario.arrayBuffer(),
            headers: {
              'content-type': 'application/octet-stream',
              'x-sgit-mensaje': adjunto.gmailMensajeId,
              'x-sgit-adjunto': adjunto.gmailAdjuntoId,
              'x-sgit-nombre': encodeURIComponent(adjunto.nombre || binario.name),
              'x-sgit-mime': adjunto.mime || binario.type || 'application/octet-stream',
              'x-sgit-tipo': adjunto.tipo || 'archivo',
              'x-sgit-content-id': adjunto.contentId || '',
            },
          });
          notas.push(subido.texto);
        }
      }
      setAviso(notas.join(' ') || 'No había archivos de respaldo.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ficha">
      <h2>Respaldo</h2>
      <p>La partida es un solo archivo comprimido para copiar por SSH. Lleva los correos, su rango de fechas, las tareas procesadas, el diccionario, la clasificación entre tarea, asunto interno y otros, los chips y el M2M. No lleva archivos de Odoo, seguimientos ni mensajes de prueba. Pausa la sincronización de correo mientras se crea, para que el rango quede cerrado.</p>
      <div className="bitacora-acciones">
        <button type="button" className="primario" disabled={ocupado} onClick={() => void crearPartida()}>
          Crear partida
        </button>
        <button type="button" disabled={ocupado} onClick={() => void revisarPartida()}>
          Revisar partida
        </button>
        <button type="button" disabled={ocupado || !partida?.presente} onClick={() => void bajarUna('/respaldo/partida/archivo')}>
          Descargar partida
        </button>
        <button type="button" disabled={ocupado} onClick={() => void asimilarPartida()}>
          Asimilar partida
        </button>
      </div>
      <p className="bajada" style={{ whiteSpace: 'pre-line' }}>{partida?.presente ? partida.texto : `En producción, deja ${partida?.nombre ?? 'sgit-partida.tar.gz'} en la carpeta de datos del servidor y pulsa Asimilar. El programa abre el archivo y toma ese rango como punto de partida de la sincronización.`}</p>
      {partida?.ruta ? <p>Archivo del servidor: {partida.ruta}</p> : null}
      <p>También se pueden bajar por partes. Pausa la sincronización mientras se descargan, y en el otro servidor súbelos antes de la clasificación.</p>
      {aviso ? <p className={avisoCalmo(aviso) ? 'bajada' : 'error'} style={{ whiteSpace: 'pre-line' }}>{aviso}</p> : null}
      {resumen ? (
        <>
          <h3>Correos</h3>
          <p>{resumen.mensajes} correos, {megabytes(resumen.bytesMensajes)}, en {resumen.partesMensajes} partes.</p>
          <div className="bitacora-acciones">
            <label htmlFor="parte-correo">
              Parte
              <input id="parte-correo" value={parteCorreo} onChange={(evento) => setParteCorreo(evento.target.value)} inputMode="numeric" />
            </label>
            <button type="button" disabled={ocupado} onClick={() => void bajarUna(`/respaldo/mensajes/${numero(parteCorreo)}`)}>
              Descargar esta parte
            </button>
            <button type="button" disabled={ocupado || resumen.partesMensajes === 0} onClick={() => void bajarSerie(resumen.partesMensajes, (parte) => `/respaldo/mensajes/${parte}`)}>
              Descargar todas
            </button>
          </div>
          <h3>Adjuntos</h3>
          <p>{resumen.adjuntos} archivos, {megabytes(resumen.bytesAdjuntos)}, en {resumen.partesAdjuntos} partes. Si un archivo es grande, va solo y se baja junto con su parte.</p>
          <div className="bitacora-acciones">
            <label htmlFor="parte-adjunto">
              Parte
              <input id="parte-adjunto" value={parteAdjunto} onChange={(evento) => setParteAdjunto(evento.target.value)} inputMode="numeric" />
            </label>
            <button type="button" disabled={ocupado} onClick={() => void bajarUna(`/respaldo/adjuntos/${numero(parteAdjunto)}`)}>
              Descargar esta parte
            </button>
            <button type="button" disabled={ocupado || resumen.partesAdjuntos === 0} onClick={() => void bajarSerie(resumen.partesAdjuntos, (parte) => `/respaldo/adjuntos/${parte}`, true)}>
              Descargar todas
            </button>
          </div>
          <h3>Tareas y asuntos internos</h3>
          <p>{resumen.tareas} tareas, {resumen.internos} asuntos internos y {resumen.diccionario} términos del diccionario. Entra la clasificación y lo que ya se definió como tarea o asunto interno. Los chips y el M2M van en la partida. Este archivo no lleva las fotos de prueba del lector.</p>
          <div className="bitacora-acciones">
            <button type="button" className="primario" disabled={ocupado} onClick={() => void bajarUna('/respaldo/clasificacion')}>
              Descargar configuración
            </button>
          </div>
        </>
      ) : null}
      <form className="cuenta-alta" onSubmit={(evento) => evento.preventDefault()}>
        <label className="ancho" htmlFor="respaldo-archivos">
          Subir partes en el otro servidor
          <input id="respaldo-archivos" type="file" multiple accept=".json,.bin,application/json" disabled={ocupado} onChange={(evento) => void subir(evento.target.files)} />
        </label>
        {ocupado ? (
          <button type="button" onClick={() => { parar.current = true; }}>
            Detener
          </button>
        ) : null}
      </form>
    </section>
  );
}

function numero(valor: string): number {
  const parte = Number(valor);
  return Number.isInteger(parte) && parte > 0 ? parte : 1;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function descargar(apiUrl: string, token: string, ruta: string, reserva: string): Promise<{ archivo: boolean }> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, { headers: { authorization: `Bearer ${token}` } });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new Error(cuerpo?.message ?? 'No se pudo descargar.');
  }
  const blob = await respuesta.blob();
  const dispuesto = respuesta.headers.get('content-disposition') ?? '';
  const nombre = /filename="([^"]+)"/.exec(dispuesto)?.[1] ?? reserva;
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
  if (respuesta.headers.get('content-type')?.includes('json')) {
    const texto = await blob.text();
    const dato = JSON.parse(texto) as { adjuntos?: AdjuntoParte[] };
    return { archivo: Boolean(dato.adjuntos?.some((adjunto) => adjunto.archivo)) };
  }
  return { archivo: false };
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init?.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const respuesta = await fetch(`${apiUrl}${ruta}`, { ...init, headers });
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

function avisoCalmo(aviso: string): boolean {
  return aviso.startsWith('Parte ') || aviso.startsWith('Qued') || aviso.startsWith('El archivo') || aviso.startsWith('Partida') || aviso.startsWith('Estoy') || aviso.startsWith('Correos');
}
