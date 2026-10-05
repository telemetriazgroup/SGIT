import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type EstadoBot = {
  estado: string;
  actualizadoEn: string | null;
  ultimoEnvioEn: string | null;
  qr: boolean;
};

type Miembro = {
  correo: string;
  nombre: string;
  rol: string;
  telefono: string | null;
  activo: boolean;
};

type MensajeWhatsapp = {
  id: string;
  direccion: string;
  telefono: string;
  texto: string;
  creadoEn: string;
};

type ReporteImagen = {
  en: string;
  id: string;
  tipo: string;
  mime: string;
  mimeObjeto: string;
  etapa: string;
  directPath: boolean;
  mediaKey: boolean;
  filehash: boolean;
  cache: boolean;
  blob: boolean;
  bytes: number;
  via: string;
  error: string;
  guardada: boolean;
};

export function PanelBot({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [estado, setEstado] = useState<EstadoBot | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [telefonos, setTelefonos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [destino, setDestino] = useState('');
  const [mensaje, setMensaje] = useState('Prueba de SGIT. Si lees esto, el bot de laboratorio está conectado.');
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeWhatsapp[]>([]);
  const [reportes, setReportes] = useState<ReporteImagen[]>([]);
  const [numeroActivo, setNumeroActivo] = useState<string | null>(null);
  const hiloRef = useRef<HTMLDivElement>(null);

  async function cargar() {
    const [sesion, lista, historial, lecturas] = await Promise.all([
      pedir<EstadoBot>(apiUrl, token, '/bot'),
      pedir<Miembro[]>(apiUrl, token, '/bot/miembros'),
      pedir<MensajeWhatsapp[]>(apiUrl, token, '/bot/mensajes'),
      pedir<ReporteImagen[]>(apiUrl, token, '/bot/reporte-imagen'),
    ]);
    setEstado(sesion);
    setMensajes(historial);
    setReportes(lecturas);
    setMiembros(lista.filter((miembro) => miembro.activo));
    setTelefonos(Object.fromEntries(lista.map((miembro) => [miembro.correo, miembro.telefono ?? ''])));
  }

  useEffect(() => {
    void cargar().catch((error: unknown) => setAviso(texto(error)));
    const reloj = window.setInterval(() => {
      void cargar().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(reloj);
  }, [apiUrl, token]);

  useEffect(() => {
    if (!estado?.qr) {
      setQrUrl(null);
      return;
    }
    let vigente = true;
    let objeto = '';
    void fetch(`${apiUrl}/bot/qr`, { headers: { authorization: `Bearer ${token}` } })
      .then((respuesta) => (respuesta.ok ? respuesta.blob() : null))
      .then((blob) => {
        if (!blob || !vigente) return;
        objeto = URL.createObjectURL(blob);
        setQrUrl(objeto);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [apiUrl, token, estado?.qr, estado?.actualizadoEn]);

  async function guardar(evento: FormEvent, correo: string) {
    evento.preventDefault();
    setAviso(null);
    const lista = await pedir<Miembro[]>(apiUrl, token, '/bot/miembros', {
      method: 'POST',
      body: JSON.stringify({ correo, telefono: telefonos[correo] ?? '' }),
    });
    setMiembros(lista.filter((miembro) => miembro.activo));
    setTelefonos(Object.fromEntries(lista.map((miembro) => [miembro.correo, miembro.telefono ?? ''])));
  }

  async function probar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const sesion = await pedir<EstadoBot>(apiUrl, token, '/bot/prueba', {
        method: 'POST',
        body: JSON.stringify({ telefono: destino, texto: mensaje }),
      });
      setEstado(sesion);
      setAviso(sesion.estado === 'listo' ? 'Quedó en la cola. Sale en unos segundos.' : 'Quedó en la cola. Sale cuando el bot esté listo.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setEnviando(false);
    }
  }

  const listo = estado?.estado === 'listo';
  const chats = useMemo(() => agrupar(mensajes, miembros), [mensajes, miembros]);
  const activo = chats.find((chat) => chat.telefono === numeroActivo) ?? chats[0] ?? null;

  useEffect(() => {
    if (!activo) return;
    setNumeroActivo((actual) => (actual && chats.some((chat) => chat.telefono === actual) ? actual : activo.telefono));
  }, [chats, activo]);

  useEffect(() => {
    const caja = hiloRef.current;
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [activo?.telefono, activo?.hilo.length, activo?.hilo.at(-1)?.id]);

  return (
    <section className="ficha ficha-bot">
      <div className="vinculo">
        <article className="vinculo-tarjeta">
          <div>
            <h2>{listo ? 'Sesión iniciada' : 'Escanea para iniciar sesión'}</h2>
            {listo ? (
              <p className="vinculo-detalle">El WhatsApp de laboratorio está vinculado. {estado?.ultimoEnvioEn ? `Último aviso: ${cuando(estado.ultimoEnvioEn)}.` : 'Todavía no se ha enviado un aviso.'}</p>
            ) : (
              <ol className="pasos-vinculo">
                <li>
                  <span>1</span>
                  <p>Abre WhatsApp en el teléfono de laboratorio.</p>
                </li>
                <li>
                  <span>2</span>
                  <p>Ve a Dispositivos vinculados y toca Vincular un dispositivo.</p>
                </li>
                <li>
                  <span>3</span>
                  <p>Apunta la cámara de WhatsApp a este código.</p>
                </li>
              </ol>
            )}
            <label className="sesion-fija">
              <input type="checkbox" checked disabled />
              Mantener la sesión iniciada en este equipo
            </label>
          </div>
          <div className="qr-marco">
            {qrUrl && !listo ? (
              <img className="qr-bot" src={qrUrl} alt="Código para vincular el WhatsApp de laboratorio" />
            ) : (
              <p className="qr-espera">{listo ? 'Vinculado' : estado?.estado === 'esperando_qr' ? 'Preparando el código…' : 'El código aparece cuando el bot está en marcha.'}</p>
            )}
          </div>
        </article>
      </div>
      <h3>Prueba de envío</h3>
      <form className="prueba-bot" onSubmit={(evento) => void probar(evento)}>
        <label htmlFor="prueba-telefono">Número</label>
        <input id="prueba-telefono" inputMode="tel" value={destino} placeholder="51900000000" onChange={(evento) => setDestino(evento.target.value)} required />
        <label htmlFor="prueba-texto">Mensaje</label>
        <textarea id="prueba-texto" value={mensaje} rows={3} onChange={(evento) => setMensaje(evento.target.value)} required />
        <button type="submit" className="primario" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar prueba'}
        </button>
      </form>
      {aviso ? <p className={aviso.startsWith('Quedó') ? 'meta' : 'error'}>{aviso}</p> : null}
      <h3>Números habilitados</h3>
      <p>El número queda atado a la cuenta. Solo ese WhatsApp puede anotar. Si la cuenta es de técnico, además recibe las tareas nuevas.</p>
      <ul className="habilitados">
        {miembros.map((miembro) => {
          const numero = (telefonos[miembro.correo] ?? '').replace(/\D/g, '');
          const habilitado = numero.length >= 8;
          return (
            <li key={miembro.correo}>
              <form className={habilitado ? 'habilitado-fila con-numero' : 'habilitado-fila'} onSubmit={(evento) => void guardar(evento, miembro.correo).catch((error: unknown) => setAviso(texto(error)))}>
                <span>
                  <strong>{miembro.nombre}</strong>
                  <small>{etiquetaRol(miembro.rol)} · {miembro.correo}</small>
                </span>
                <input
                  id={`tel-${miembro.correo}`}
                  inputMode="tel"
                  aria-label={`WhatsApp de ${miembro.nombre}`}
                  value={telefonos[miembro.correo] ?? ''}
                  placeholder="51900000000"
                  onChange={(evento) => setTelefonos((actual) => ({ ...actual, [miembro.correo]: evento.target.value }))}
                />
                <em>{habilitado ? (miembro.rol === 'tecnico' ? 'Habilitado · recibe tareas' : 'Habilitado') : 'Sin número'}</em>
                <button type="submit">Guardar</button>
              </form>
            </li>
          );
        })}
      </ul>
      <h3>Mensajes</h3>
      {chats.length === 0 ? (
        <p>Todavía no hay mensajes enviados ni recibidos.</p>
      ) : (
        <div className="chat-wa">
          <div className="chat-wa-lista" role="listbox" aria-label="Conversaciones">
            {chats.map((chat) => (
              <button
                type="button"
                key={chat.telefono}
                role="option"
                aria-selected={chat.telefono === activo?.telefono}
                className={chat.telefono === activo?.telefono ? 'activo' : ''}
                onClick={() => setNumeroActivo(chat.telefono)}
              >
                <strong>{chat.nombre}</strong>
                {chat.nombre === chat.telefono ? null : <small>{chat.telefono}</small>}
                <span>{chat.ultimo ? recorte(chat.ultimo.texto) : 'Sin mensajes'}</span>
                {chat.ultimo ? <time>{cuando(chat.ultimo.creadoEn)}</time> : null}
              </button>
            ))}
          </div>
          <div className="chat-wa-hilo" ref={hiloRef} aria-label={activo ? `Mensajes de ${activo.nombre}` : 'Mensajes'}>
            {activo && activo.hilo.length === 0 ? <p className="chat-wa-vacio">Todavía no hay mensajes con {activo.nombre}.</p> : null}
            {activo?.hilo.map((mensajeWa) => (
              <article key={mensajeWa.id} className={mensajeWa.direccion}>
                <p>{mensajeWa.texto}</p>
                <time>{cuando(mensajeWa.creadoEn)}</time>
              </article>
            ))}
          </div>
        </div>
      )}
      <h3>Lectura de imágenes</h3>
      <p>Cada foto que llega deja aquí la causa si no se pudo guardar: tipo, mime que mandó WhatsApp, etapa y el error.</p>
      {reportes.length === 0 ? (
        <p>Todavía no hay intentos de leer una imagen.</p>
      ) : (
        <ol className="reporte-imagen">
          {reportes.map((reporte) => (
            <li key={`${reporte.en}-${reporte.id}`} className={reporte.guardada ? 'ok' : 'fallo'}>
              <strong>{reporte.guardada ? 'Guardada' : 'No se guardó'}</strong>
              <time>{cuando(reporte.en)}</time>
              <span>{reporte.via || 'sin vía'} · {reporte.bytes ? `${reporte.bytes} bytes` : 'sin bytes'}</span>
              <p>
                tipo {reporte.tipo || '—'} · mime {reporte.mime || '—'}
                {reporte.mimeObjeto ? ` · objeto ${reporte.mimeObjeto}` : ''} · etapa {reporte.etapa || '—'}
                {reporte.directPath ? ' · con ruta' : ' · sin ruta'}
                {reporte.mediaKey ? ' · con clave' : ' · sin clave'}
                {reporte.cache ? ' · en caché' : ''}
                {reporte.blob ? ' · con blob' : ''}
              </p>
              {reporte.error ? <p className="error">{reporte.error}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function agrupar(mensajes: MensajeWhatsapp[], miembros: Miembro[]): Array<{ telefono: string; nombre: string; ultimo: MensajeWhatsapp | null; hilo: MensajeWhatsapp[] }> {
  const nombres = new Map(miembros.map((miembro) => [(miembro.telefono ?? '').replace(/\D/g, ''), miembro.nombre]));
  const porNumero = new Map<string, MensajeWhatsapp[]>();
  for (const mensaje of mensajes) {
    const hilo = porNumero.get(mensaje.telefono) ?? [];
    hilo.push(mensaje);
    porNumero.set(mensaje.telefono, hilo);
  }
  for (const miembro of miembros) {
    const telefono = (miembro.telefono ?? '').replace(/\D/g, '');
    if (telefono.length >= 8 && !porNumero.has(telefono)) porNumero.set(telefono, []);
  }
  return [...porNumero.entries()]
    .map(([telefono, hilo]) => {
      const ordenado = [...hilo].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
      return { telefono, nombre: nombres.get(telefono) || telefono, ultimo: ordenado.at(-1) ?? null, hilo: ordenado };
    })
    .sort((a, b) => {
      if (!a.ultimo && !b.ultimo) return a.nombre.localeCompare(b.nombre, 'es');
      if (!a.ultimo) return 1;
      if (!b.ultimo) return -1;
      return b.ultimo.creadoEn.localeCompare(a.ultimo.creadoEn);
    });
}

function recorte(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > 72 ? `${limpio.slice(0, 71)}…` : limpio;
}

function etiquetaRol(rol: string): string {
  if (rol === 'superusuario') return 'Superusuario';
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'tecnico') return 'Técnico';
  return 'Operador';
}

function cuando(fecha: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(fecha));
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new Error(cuerpo?.message ?? 'No se pudo completar la operación.');
  }
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
