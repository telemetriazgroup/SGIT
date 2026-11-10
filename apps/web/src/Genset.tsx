import { Fragment, useEffect, useRef, useState } from 'react';

type Conexion = 'en_linea' | 'reciente' | 'sin_reporte';

type Dispositivo = {
  imei: string;
  estado: number;
  tipo: string;
  fecha: string | null;
  ultimo_dato: string | null;
  last_ip: string | null;
  secured: boolean;
  presente: boolean;
  conexion: Conexion;
  tramas: number;
  consultado_en: string | null;
  consultado_por: string;
};

type Lista = {
  dispositivos: Dispositivo[];
  total: number;
  en_linea: number;
  recientes: number;
  sin_reporte: number;
  sincronizado_en: string | null;
  coleccion: string;
  aviso: string;
};

type Campo = { nombre: string; valor: string };

type Gps = {
  valido: boolean;
  latitud: number | null;
  longitud: number | null;
  velocidad_kmh: number | null;
  rumbo: number | null;
  cuando: string | null;
  texto: string;
};

type Trama = {
  id: string;
  consultado_en: string;
  consultado_por: string;
  gps: Gps | null;
  campos: Campo[];
  crudo: Record<string, unknown>;
};

type Consulta = {
  imei: string;
  nueva: boolean;
  mensaje: string;
  trama: Trama | null;
  historial: Trama[];
};

type Filtro = '' | 'en_linea' | 'hoy' | 'sin_reporte';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const FECHAS = new Set(['fecha', 'received_at', 'batch_processed_at']);
const NOMBRES: Record<string, string> = {
  estado: 'Estado',
  fecha: 'Fecha de la trama',
  received_at: 'Recibida en el servidor',
  batch_processed_at: 'Procesada',
  tipo_dispositivo: 'Tipo',
  secured: 'Protegida',
};
const CONEXION: Record<Conexion, string> = {
  en_linea: 'En línea',
  reciente: 'Reportó hoy',
  sin_reporte: 'Sin reporte reciente',
};

export function PanelGenset({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [consulta, setConsulta] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [elegido, setElegido] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Consulta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    let vigente = true;
    async function preparar() {
      try {
        const cargada = await pedir<Lista>(apiUrl, token, '/genset');
        if (!vigente) return;
        setLista(cargada);
        if (!listaAntigua(cargada.sincronizado_en)) return;
        const fresca = await pedir<Lista>(apiUrl, token, '/genset/sincronizar', { method: 'POST', body: '{}' });
        if (vigente) setLista(fresca);
      } catch (error: unknown) {
        if (vigente) setFallo(texto(error));
      }
    }
    void preparar();
    const id = window.setInterval(() => {
      void pedir<Lista>(apiUrl, token, '/genset')
        .then((fresca) => {
          if (vigente) setLista(fresca);
        })
        .catch(() => undefined);
    }, 60 * 1000);
    return () => {
      vigente = false;
      window.clearInterval(id);
    };
  }, [apiUrl, token]);

  useEffect(() => {
    if (!elegido) return;
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setElegido(null);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [elegido]);

  async function sincronizar() {
    setOcupado(true);
    setFallo(null);
    setAviso(null);
    try {
      const fresca = await pedir<Lista>(apiUrl, token, '/genset/sincronizar', { method: 'POST', body: '{}' });
      setLista(fresca);
      setAviso(fresca.aviso || `Lista actualizada. ${fresca.total} equipos.`);
    } catch (error: unknown) {
      setFallo(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function abrir(imei: string) {
    const actual = pedido.current + 1;
    pedido.current = actual;
    setElegido(imei);
    setDetalle(null);
    setFallo(null);
    setOcupado(true);
    try {
      const resultado = await pedir<Consulta>(apiUrl, token, `/genset/${imei}/consultar`, { method: 'POST', body: '{}' });
      if (pedido.current !== actual) return;
      setDetalle(resultado);
      const fresca = await pedir<Lista>(apiUrl, token, '/genset');
      if (pedido.current === actual) setLista(fresca);
    } catch (error: unknown) {
      if (pedido.current !== actual) return;
      setFallo(texto(error));
      const previo = await pedir<Consulta>(apiUrl, token, `/genset/${imei}`).catch(() => null);
      if (pedido.current === actual && previo) setDetalle(previo);
    } finally {
      if (pedido.current === actual) setOcupado(false);
    }
  }

  const equipos = lista?.dispositivos ?? [];
  const buscados = equipos.filter((equipo) => !consulta.trim() || equipo.imei.includes(consulta.trim()));
  const cuentas = {
    todos: buscados.length,
    en_linea: buscados.filter((equipo) => equipo.conexion === 'en_linea').length,
    hoy: buscados.filter((equipo) => equipo.conexion === 'en_linea' || equipo.conexion === 'reciente').length,
    sin_reporte: buscados.filter((equipo) => equipo.conexion === 'sin_reporte').length,
  };
  const visibles = buscados.filter((equipo) => coincide(equipo, filtro));

  return (
    <section className="ficha">
      <h2>GENSET</h2>
      <p>
        Validación de la telemetría de generadores. Cada 10 minutos se baja la lista de equipos. Al abrir un IMEI se pide la última trama y, si es distinta de la anterior, queda en la trazabilidad. No está ligado a las tareas.
      </p>
      <button id="actualizar-genset" type="button" disabled={ocupado} onClick={() => void sincronizar()}>
        {ocupado && !elegido ? 'Consultando generadores…' : 'Actualizar lista'}
      </button>
      {lista ? (
        <p className="meta">
          {lista.sincronizado_en ? `Lista del ${fechaLocal(lista.sincronizado_en)}` : 'La lista todavía no se ha consultado'}
          {lista.coleccion ? ` · ${lista.coleccion}` : ''}
          {` · ${cuentas.en_linea} en línea · ${buscados.filter((equipo) => equipo.conexion === 'reciente').length} reportaron hoy · ${cuentas.sin_reporte} sin reporte reciente`}
        </p>
      ) : null}
      {aviso ? <p className="bajada">{aviso}</p> : null}
      {fallo && !elegido ? <p className="error">{fallo}</p> : null}
      <form
        className="chips-buscar"
        onSubmit={(evento) => {
          evento.preventDefault();
        }}
      >
        <input id="buscar-genset" value={consulta} placeholder="Buscar IMEI" inputMode="numeric" onChange={(evento) => setConsulta(evento.target.value)} />
      </form>
      <div className="chips-filtros genset-filtros">
        {(
          [
            ['', 'Todos', cuentas.todos],
            ['en_linea', 'En línea', cuentas.en_linea],
            ['hoy', 'Últimas 24 h', cuentas.hoy],
            ['sin_reporte', 'Sin reporte', cuentas.sin_reporte],
          ] as const
        ).map(([valor, nombre, cantidad]) => (
          <button key={valor || 'todos'} type="button" className={filtro === valor ? 'activo' : ''} onClick={() => setFiltro(valor)}>
            {nombre} {cantidad}
          </button>
        ))}
      </div>
      {!lista && !fallo ? <p>Cargando la lista…</p> : null}
      {lista && visibles.length === 0 ? <p>No hay equipos para este filtro.</p> : null}
      {visibles.length > 0 ? (
        <div className="genset-tabla">
          <table className="tabla-chips">
            <thead>
              <tr>
                <th>IMEI</th>
                <th>Tipo</th>
                <th>Último dato</th>
                <th>Conexión</th>
                <th>Tramas</th>
                <th>Última revisión</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((equipo) => (
                <tr
                  key={equipo.imei}
                  tabIndex={0}
                  onClick={() => void abrir(equipo.imei)}
                  onKeyDown={(evento) => {
                    if (evento.key !== 'Enter' && evento.key !== ' ') return;
                    evento.preventDefault();
                    void abrir(equipo.imei);
                  }}
                >
                  <td>
                    {equipo.imei}
                    {equipo.presente ? '' : <span className="genset-fuera"> · fuera de la lista</span>}
                  </td>
                  <td>{equipo.tipo || '—'}</td>
                  <td>{fechaLocal(equipo.ultimo_dato)}</td>
                  <td>
                    <span className={`genset-marca ${equipo.conexion}`}>{CONEXION[equipo.conexion]}</span>
                  </td>
                  <td>{equipo.tramas}</td>
                  <td>{equipo.consultado_en ? `${fechaLocal(equipo.consultado_en)}${equipo.consultado_por ? ` · ${equipo.consultado_por}` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {elegido ? (
        <div className="modal-fondo" onMouseDown={() => setElegido(null)}>
          <div className="modal modal-genset" role="dialog" aria-modal="true" aria-labelledby="titulo-genset" onMouseDown={(evento) => evento.stopPropagation()}>
            <h3 id="titulo-genset">{elegido}</h3>
            <p className="meta">Última trama que el servidor tiene de este generador.</p>
            {ocupado && !detalle ? <p>Consultando la última trama…</p> : null}
            {fallo ? <p className="error">{fallo}</p> : null}
            {detalle ? <NotaConsulta detalle={detalle} /> : null}
            {detalle?.trama ? <TramaActual trama={detalle.trama} /> : null}
            {detalle && detalle.historial.length > 1 ? <Trazabilidad historial={detalle.historial} /> : null}
            <div className="modal-acciones">
              <button type="button" onClick={() => setElegido(null)}>
                Cerrar
              </button>
              <button type="button" className="primario" disabled={ocupado} onClick={() => void abrir(elegido)}>
                {ocupado ? 'Consultando…' : 'Consultar de nuevo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NotaConsulta({ detalle }: { detalle: Consulta }) {
  if (!detalle.trama) return <p>Este IMEI todavía no tiene tramas guardadas.</p>;
  if (detalle.nueva && detalle.historial.length <= 1) return <p className="bajada">Primera trama guardada de este IMEI.</p>;
  if (detalle.nueva) return <p className="bajada">Esta trama es distinta y quedó en la trazabilidad.</p>;
  return <p className="bajada">La trama no cambió. Sigue siendo la guardada el {fechaLocal(detalle.trama.consultado_en)}.</p>;
}

function TramaActual({ trama }: { trama: Trama }) {
  const mapa = trama.gps?.valido && trama.gps.latitud !== null && trama.gps.longitud !== null ? `https://www.google.com/maps?q=${trama.gps.latitud},${trama.gps.longitud}` : null;
  return (
    <div>
      <p className="meta">
        Guardada el {fechaLocal(trama.consultado_en)}
        {trama.consultado_por ? ` por ${trama.consultado_por}` : ''}
      </p>
      {trama.gps ? (
        <p>
          {trama.gps.texto}
          {trama.gps.cuando ? ` · fix ${fechaLocal(trama.gps.cuando)}` : ''}
          {mapa ? (
            <>
              {' '}
              <a href={mapa} target="_blank" rel="noreferrer">
                Ver en el mapa
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <p>Sin GPS en esta trama.</p>
      )}
      <dl>
        {trama.campos.map((campo) => (
          <Fragment key={campo.nombre}>
            <dt>{NOMBRES[campo.nombre] ?? campo.nombre}</dt>
            <dd>{presentar(campo)}</dd>
          </Fragment>
        ))}
      </dl>
      <details>
        <summary>Trama completa</summary>
        <pre className="genset-trama">{JSON.stringify(trama.crudo, null, 2)}</pre>
      </details>
    </div>
  );
}

function Trazabilidad({ historial }: { historial: Trama[] }) {
  return (
    <div>
      <h3>Trazabilidad</h3>
      <ol className="bitacora-tiempo">
        {historial.map((trama, indice) => {
          const d00 = trama.campos.find((campo) => campo.nombre === 'd00')?.valor ?? '';
          return (
            <li key={trama.id}>
              <strong>{indice === 0 ? 'Última' : `Anterior ${indice}`}</strong>
              <p className="meta">
                Consultada el {fechaLocal(trama.consultado_en)}
                {trama.consultado_por ? ` · ${trama.consultado_por}` : ''}
              </p>
              <p>{trama.gps?.texto ?? 'Sin GPS'}</p>
              {d00 ? <p className="meta">d00 {d00.length > 72 ? `${d00.slice(0, 72)}…` : d00}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function presentar(campo: Campo): string {
  if (campo.nombre === 'secured') return campo.valor === 'true' ? 'Sí' : 'No';
  if (FECHAS.has(campo.nombre)) return fechaLocal(campo.valor);
  return campo.valor;
}

function coincide(equipo: Dispositivo, filtro: Filtro): boolean {
  if (filtro === 'en_linea') return equipo.conexion === 'en_linea';
  if (filtro === 'hoy') return equipo.conexion === 'en_linea' || equipo.conexion === 'reciente';
  if (filtro === 'sin_reporte') return equipo.conexion === 'sin_reporte';
  return true;
}

function listaAntigua(iso: string | null): boolean {
  if (!iso) return true;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return true;
  return Date.now() - fecha.getTime() > DIEZ_MINUTOS;
}

function fechaLocal(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string | string[] } | null;
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message.join(' ') : cuerpo?.message;
    throw new Error(mensaje ?? 'No se pudo completar la operación.');
  }
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
