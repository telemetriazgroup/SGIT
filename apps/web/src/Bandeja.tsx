import { FormEvent, useEffect, useState } from 'react';
import type { SesionPublica } from '@sgit/shared';
import { Logo } from './Logo';

type Avance = {
  fase: 'ocioso' | 'listando' | 'importando' | 'listo' | 'error';
  total: number;
  yaTenidos: number;
  porBajar: number;
  hechos: number;
  nuevos: number;
  detalle: string;
};

type Resumen = {
  correo: string;
  conectado: boolean;
  clavesListas: boolean;
  estado: string;
  ultimaSync: string | null;
  guardados: number;
  conversaciones: number;
  completos: number;
  incompletos: number;
  syncAutomatica: boolean;
  intervaloMinutos: number;
  avance: Avance;
};

type PaginaMensajes = {
  mensajes: Mensaje[];
  total: number;
  pagina: number;
  paginas: number;
};

type Mensaje = {
  id: string;
  asunto: string;
  de: string;
  fecha: string | null;
  replica: string;
  mensajes: number;
  extracto: string;
};

type Adjunto = {
  id: string;
  nombre: string;
  mime: string;
  tipo: string;
  estado: string;
};

type Detalle = Mensaje & {
  htmlSeguro: string;
  texto: string;
  para: string;
  adjuntos: Adjunto[];
};

type Hilo = {
  asunto: string;
  mensajes: Detalle[];
};

type Props = {
  apiUrl: string;
  sesion: SesionPublica;
  onSalir: () => void;
};

export function Bandeja({ apiUrl, sesion, onSalir }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [hilo, setHilo] = useState<Hilo | null>(null);
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [htmls, setHtmls] = useState<Record<string, string>>({});
  const [enfocado, setEnfocado] = useState(0);
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalLista, setTotalLista] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [aviso, setAviso] = useState<string | null>(avisoInicial());
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<'recibidos' | 'enviados'>('recibidos');
  const [redactando, setRedactando] = useState(false);

  async function leerEstado() {
    const estado = await pedir<Resumen>(apiUrl, sesion.token, '/buzon');
    setResumen(estado);
    return estado;
  }

  async function cargar(paginaDestino = pagina, textoBusqueda = consulta) {
    const estado = await leerEstado();
    const parametros = new URLSearchParams({
      pagina: String(paginaDestino),
      q: textoBusqueda,
    });
    const lista = await pedir<PaginaMensajes>(apiUrl, sesion.token, `/buzon/mensajes?${parametros}`);
    setResumen(estado);
    setMensajes(lista.mensajes);
    setTotalLista(lista.total);
    setPagina(lista.pagina);
    setPaginas(lista.paginas);
  }

  useEffect(() => {
    void cargar().catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, sesion.token]);

  async function alternarSync() {
    if (!resumen) return;
    setAviso(null);
    try {
      const estado = await pedir<Resumen>(apiUrl, sesion.token, '/buzon/sync', {
        method: 'POST',
        body: JSON.stringify({ activa: !resumen.syncAutomatica }),
      });
      setResumen(estado);
    } catch (error) {
      setAviso(texto(error));
    }
  }

  async function conectar() {
    setAviso(null);
    try {
      const respuesta = await pedir<{ url: string }>(apiUrl, sesion.token, '/buzon/oauth/url');
      window.location.href = respuesta.url;
    } catch (error) {
      setAviso(texto(error));
    }
  }

  async function importar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setAviso(null);
    const pulso = window.setInterval(() => {
      void leerEstado().catch(() => undefined);
    }, 800);
    try {
      await pedir(apiUrl, sesion.token, '/buzon/importar', {
        method: 'POST',
        body: JSON.stringify({ desde, hasta }),
      });
      await cargar(1, consulta);
    } catch (error) {
      setAviso(texto(error));
      await leerEstado().catch(() => undefined);
    } finally {
      window.clearInterval(pulso);
      setOcupado(false);
    }
  }

  async function abrir(id: string) {
    const conversacion = await pedir<Hilo>(apiUrl, sesion.token, `/buzon/mensajes/${id}/hilo`);
    const indice = Math.max(0, conversacion.mensajes.length - 1);
    const ultimo = conversacion.mensajes[indice];
    setHilo(conversacion);
    setAbiertos(ultimo ? [ultimo.id] : []);
    setEnfocado(indice);
    setHtmls({});
    window.scrollTo({ top: 0 });
    if (ultimo) await mostrarHtml(ultimo);
  }

  async function mostrarHtml(mensaje: Detalle) {
    const cuerpo = await conImagenes(apiUrl, sesion.token, mensaje.htmlSeguro);
    setHtmls((actual) => ({ ...actual, [mensaje.id]: cuerpo }));
  }

  function volver() {
    setHilo(null);
    window.scrollTo({ top: 0 });
  }

  async function irAlMensaje(indice: number) {
    if (!hilo) return;
    const mensaje = hilo.mensajes[indice];
    if (!mensaje) return;
    setEnfocado(indice);
    setAbiertos((actual) => (actual.includes(mensaje.id) ? actual : [...actual, mensaje.id]));
    if (!htmls[mensaje.id]) await mostrarHtml(mensaje);
    document.getElementById(`mensaje-${mensaje.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function alternar(mensaje: Detalle, indice: number) {
    setEnfocado(indice);
    const yaAbierto = abiertos.includes(mensaje.id);
    setAbiertos((actual) => (yaAbierto ? actual.filter((id) => id !== mensaje.id) : [...actual, mensaje.id]));
    if (!yaAbierto && !htmls[mensaje.id]) await mostrarHtml(mensaje);
  }

  async function descargar(adjunto: Adjunto) {
    const respuesta = await fetch(`${apiUrl}/buzon/adjuntos/${adjunto.id}`, {
      headers: { authorization: `Bearer ${sesion.token}` },
    });
    if (!respuesta.ok) {
      setAviso('No se pudo descargar el archivo.');
      return;
    }
    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = adjunto.nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  const inicio = totalLista === 0 ? 0 : (pagina - 1) * 25 + 1;
  const fin = Math.min(pagina * 25, totalLista);

  return (
    <div className="correo-app">
      <p className="sr">Sesión iniciada</p>
      <header className="barra">
        <Logo />
        <form
          className="buscar"
          onSubmit={(evento) => {
            evento.preventDefault();
            setVista('recibidos');
            setHilo(null);
            setConsulta(busqueda);
            void cargar(1, busqueda).catch((error: unknown) => setAviso(texto(error)));
          }}
        >
          <label className="sr" htmlFor="buscar">
            Buscar
          </label>
          <input
            id="buscar"
            type="search"
            value={busqueda}
            placeholder="Buscar correo"
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <button type="submit">Buscar</button>
        </form>
        <div className="cuenta">
          <span>
            {sesion.usuario.nombre}
            <small>{sesion.usuario.rol}</small>
          </span>
          <button type="button" onClick={onSalir}>
            Salir
          </button>
        </div>
      </header>
      <div className="cuerpo-app">
        <nav className="nav-correo" aria-label="Carpetas">
          <button type="button" className="redactar" onClick={() => setRedactando(true)}>
            <Lapiz />
            Redactar
          </button>
          <button
            type="button"
            className={vista === 'recibidos' && !hilo ? 'activo' : ''}
            onClick={() => {
              setVista('recibidos');
              setHilo(null);
            }}
          >
            Recibidos
            {resumen ? <span>{resumen.conversaciones}</span> : null}
          </button>
          <button
            type="button"
            className={vista === 'enviados' ? 'activo' : ''}
            onClick={() => {
              setVista('enviados');
              setHilo(null);
            }}
          >
            Enviados
          </button>
        </nav>
        <section className="panel">
          <div className="herramientas">
            {hilo ? (
              <button type="button" onClick={volver}>
                Volver
              </button>
            ) : (
              <span className="estado-buzon">
                {resumen?.correo ?? 'telemetria@zgroup.com.pe'}
                {resumen ? ` · ${resumen.conectado ? 'conectado' : 'sin conectar'}` : ''}
                {resumen && resumen.incompletos > 0 ? ` · ${resumen.incompletos} a medias` : ''}
                {resumen?.ultimaSync ? ` · sync ${fechaCorta(resumen.ultimaSync)}` : ''}
              </span>
            )}
            {resumen ? (
              <button
                type="button"
                className={resumen.syncAutomatica ? 'sync-auto activa' : 'sync-auto'}
                aria-pressed={resumen.syncAutomatica}
                onClick={() => void alternarSync()}
              >
                {resumen.syncAutomatica
                  ? `Sync cada ${resumen.intervaloMinutos} min`
                  : `Sync en pausa`}
              </button>
            ) : null}
            {vista === 'recibidos' && !hilo ? (
              <div className="paginas">
                <span>
                  {inicio}–{fin} de {totalLista}
                </span>
                <button type="button" aria-label="Más recientes" disabled={pagina <= 1} onClick={() => void cargar(pagina - 1).catch((error: unknown) => setAviso(texto(error)))}>
                  ‹
                </button>
                <button type="button" aria-label="Más antiguos" disabled={pagina >= paginas} onClick={() => void cargar(pagina + 1).catch((error: unknown) => setAviso(texto(error)))}>
                  ›
                </button>
              </div>
            ) : null}
          </div>
          {resumen?.avance && resumen.avance.fase !== 'ocioso' ? (
            <p className={resumen.avance.fase === 'error' ? 'error' : 'bajada'} role="status">
              {resumen.avance.detalle}
            </p>
          ) : null}
          {resumen?.avance.fase === 'importando' && resumen.avance.porBajar > 0 ? (
            <progress value={resumen.avance.hechos} max={resumen.avance.porBajar} />
          ) : null}
          {aviso ? (
            <p className="error" role="alert">
              {aviso}
            </p>
          ) : null}
          {resumen && !resumen.conectado ? (
            <section className="vacio">
              <button type="button" className="primario" onClick={() => void conectar()}>
                Conectar buzón
              </button>
              {!resumen.clavesListas ? <p>El servidor todavía no tiene el cliente OAuth. El alta está en docs/configurar-gmail.md.</p> : null}
            </section>
          ) : null}
          {vista === 'enviados' ? (
            <VacioEnviados onRedactar={() => setRedactando(true)} />
          ) : hilo ? (
            <Lectura
              hilo={hilo}
              abiertos={abiertos}
              htmls={htmls}
              enfocado={enfocado}
              onIr={(indice) => void irAlMensaje(indice)}
              onAlternar={(mensaje, indice) => void alternar(mensaje, indice)}
              onDescargar={(adjunto) => void descargar(adjunto)}
            />
          ) : (
            <>
              {resumen?.conectado ? (
                <form className="rango" onSubmit={(evento) => void importar(evento)}>
                  <label htmlFor="desde">Desde</label>
                  <input id="desde" type="date" value={desde} onChange={(evento) => setDesde(evento.target.value)} required />
                  <label htmlFor="hasta">Hasta</label>
                  <input id="hasta" type="date" value={hasta} onChange={(evento) => setHasta(evento.target.value)} required />
                  <button type="submit" className="primario" disabled={ocupado}>
                    {ocupado ? 'Revisando…' : 'Sincronizar'}
                  </button>
                  <p>Solo entran los recibidos. Los enviados de Gmail no se guardan.</p>
                </form>
              ) : null}
              <ul className="lista">
                {mensajes.map((mensaje) => (
                  <li key={mensaje.id}>
                    <button type="button" className="fila" onClick={() => void abrir(mensaje.id).catch((error: unknown) => setAviso(texto(error)))}>
                      <span className="avatar" aria-hidden="true">
                        {inicial(mensaje.de)}
                      </span>
                      <span className="quien">
                        {nombreDe(mensaje.de)}
                        {mensaje.mensajes > 1 ? <span className="n-hilo">{mensaje.mensajes}</span> : null}
                      </span>
                      <span className="resumen-fila">
                        <strong>{mensaje.asunto || '(sin asunto)'}</strong>
                        {mensaje.extracto ? <span className="extracto"> — {mensaje.extracto}</span> : null}
                      </span>
                      <time>{mensaje.fecha ? fechaCorta(mensaje.fecha) : ''}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      {redactando ? <Redaccion onCerrar={() => setRedactando(false)} /> : null}
    </div>
  );
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

async function conImagenes(apiUrl: string, token: string, html: string): Promise<string> {
  const documento = new DOMParser().parseFromString(html, 'text/html');
  for (const imagen of documento.querySelectorAll('img')) {
    const src = imagen.getAttribute('src') ?? '';
    if (!src.startsWith('/buzon/adjuntos/')) continue;
    const respuesta = await fetch(`${apiUrl}${src}`, { headers: { authorization: `Bearer ${token}` } });
    if (!respuesta.ok) continue;
    imagen.src = URL.createObjectURL(await respuesta.blob());
  }
  return documento.body.innerHTML;
}

function Lectura({
  hilo,
  abiertos,
  htmls,
  enfocado,
  onIr,
  onAlternar,
  onDescargar,
}: {
  hilo: Hilo;
  abiertos: string[];
  htmls: Record<string, string>;
  enfocado: number;
  onIr: (indice: number) => void;
  onAlternar: (mensaje: Detalle, indice: number) => void;
  onDescargar: (adjunto: Adjunto) => void;
}) {
  const total = hilo.mensajes.length;
  return (
    <section className="lectura-panel">
      <div className="lectura">
        <h2>{hilo.asunto || '(sin asunto)'}</h2>
        <div className="paginas">
          <button type="button" disabled={enfocado <= 0} onClick={() => onIr(enfocado - 1)}>
            Anterior
          </button>
          <button type="button" disabled={enfocado >= total - 1} onClick={() => onIr(enfocado + 1)}>
            Siguiente
          </button>
          <span>
            {enfocado + 1} de {total}
          </span>
        </div>
      </div>
      <div className="hilo">
        {hilo.mensajes.map((mensaje, indice) => {
          const abierto = abiertos.includes(mensaje.id);
          const archivos = mensaje.adjuntos.filter((adjunto) => adjunto.tipo === 'archivo');
          return (
            <article key={mensaje.id} id={`mensaje-${mensaje.id}`} className={abierto ? 'tarjeta abierta' : 'tarjeta'}>
              <button type="button" className="cabecera-mensaje" onClick={() => onAlternar(mensaje, indice)}>
                <span className="avatar" aria-hidden="true">
                  {inicial(mensaje.de)}
                </span>
                <span className="quien">
                  <strong>{nombreDe(mensaje.de)}</strong>
                  {abierto ? <small>para {mensaje.para || '—'}</small> : <span className="extracto">{recorte(mensaje.texto)}</span>}
                </span>
                <time>{mensaje.fecha ? fechaCorta(mensaje.fecha) : ''}</time>
              </button>
              {abierto ? (
                <div className="correo">
                  <div className="cuerpo" dangerouslySetInnerHTML={{ __html: htmls[mensaje.id] ?? mensaje.htmlSeguro }} />
                  {archivos.length > 0 ? (
                    <ul className="adjuntos">
                      {archivos.map((adjunto) => (
                        <li key={adjunto.id}>
                          <button type="button" onClick={() => onDescargar(adjunto)}>
                            {adjunto.nombre}
                            {adjunto.estado === 'listo' ? '' : ' · pendiente'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VacioEnviados({ onRedactar }: { onRedactar: () => void }) {
  return (
    <section className="vacio">
      <h2>Enviados</h2>
      <p>Los correos que salgan desde SGIT se verán aquí, en la misma bandeja que los recibidos.</p>
      <button type="button" className="primario" onClick={onRedactar}>
        Redactar
      </button>
    </section>
  );
}

function Redaccion({ onCerrar }: { onCerrar: () => void }) {
  return (
    <form
      className="redaccion"
      onSubmit={(evento) => {
        evento.preventDefault();
      }}
    >
      <header>
        <strong>Mensaje nuevo</strong>
        <button type="button" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      </header>
      <label className="sr" htmlFor="para">
        Para
      </label>
      <input id="para" name="para" type="email" placeholder="Para" />
      <label className="sr" htmlFor="cc">
        Cc
      </label>
      <input id="cc" name="cc" type="text" placeholder="Cc" />
      <label className="sr" htmlFor="asunto-nuevo">
        Asunto
      </label>
      <input id="asunto-nuevo" name="asunto" type="text" placeholder="Asunto" />
      <textarea name="cuerpo" placeholder="Escribe el mensaje" rows={10} />
      <footer>
        <button type="submit" className="primario" disabled>
          Enviar
        </button>
        <p>El envío desde SGIT se activa más adelante. Este mensaje no sale del programa.</p>
      </footer>
    </form>
  );
}

function Lapiz() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17.2V20h2.8l8.2-8.2-2.8-2.8L4 17.2zm13.1-7.7a.8.8 0 0 0 0-1.1l-1.5-1.5a.8.8 0 0 0-1.1 0l-1.1 1.1 2.8 2.8 1-1.3z" fill="currentColor" />
    </svg>
  );
}

function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  const zona = 'America/Lima';
  const dia = (valor: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(valor);
  const anio = (valor: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric' }).format(valor);
  if (dia(fecha) === dia(new Date())) {
    return fecha.toLocaleTimeString('es-PE', { timeZone: zona, hour: 'numeric', minute: '2-digit' });
  }
  return fecha.toLocaleDateString('es-PE', {
    timeZone: zona,
    day: 'numeric',
    month: 'short',
    year: anio(fecha) === anio(new Date()) ? undefined : 'numeric',
  });
}

function nombreDe(de: string): string {
  const limpio = de.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  return limpio || de;
}

function inicial(de: string): string {
  const nombre = nombreDe(de);
  return (nombre[0] ?? '?').toUpperCase();
}

function recorte(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= 140) return limpio;
  return `${limpio.slice(0, 140)}…`;
}

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function haceDias(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(Date.now() - dias * 24 * 60 * 60 * 1000));
}

function avisoInicial(): string | null {
  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get('gmail') === 'conectado') return null;
  if (parametros.get('gmail') === 'error') return parametros.get('motivo') ?? 'No se pudo conectar Gmail.';
  return null;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
