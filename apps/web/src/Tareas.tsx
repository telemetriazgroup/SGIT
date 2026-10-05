import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

type TareaLista = {
  id: string;
  cot: string;
  estado: string;
  ticket: string | null;
  lugar: string | null;
  cliente: string | null;
  descripcion: string | null;
  cita_fecha: string | null;
  cita_hora: string | null;
  comercial_nombre: string | null;
  fecha: string | null;
  cots?: string[];
  referencias?: string[];
};

type Momento = {
  area: string | null;
  cuando: string | null;
  de: string | null;
  extracto: string;
  frases: string[];
};

type AreaEncargo = { area: string; texto: string; nuestra: boolean };
type Paso = { cuando: string | null; de: string; resumen: string; convoca: boolean };

type Tarea = TareaLista & {
  cantidad: number | null;
  temperatura: string | null;
  producto: string | null;
  contenedor: string | null;
  comercial_cargo: string | null;
  comercial_correo: string | null;
  comercial_telefono: string | null;
  cita_direccion: string | null;
  cita_mapa: string | null;
  cita_parcial_fecha: string | null;
  cita_parcial_hora: string | null;
  seguimiento: { momento: Momento | null; areas: AreaEncargo[]; linea: Paso[] };
  campos_corregidos?: string[];
  situaciones?: Situacion[];
  responsable_nombre?: string | null;
  recordar_en?: string | null;
  en_barrido?: boolean;
  notas?: NotaBitacora[];
};

type NotaBitacora = {
  id: string;
  tipo: string;
  texto: string;
  autor_nombre: string;
  archivo_nombre: string | null;
  creado_en: string;
};

type Situacion = {
  tipo: string;
  resumen: string;
  cita_anterior: { fecha: string | null; hora: string | null; direccion: string | null } | null;
  de: string;
  fecha: string | null;
  asunto: string;
};

type Termino = { id: string; termino: string; activo: boolean };

type ResumenProceso = {
  mensajes: number;
  nuevas: number;
  repetidas: number;
  pendientes: number;
  otros: number;
  internos?: number;
};

type Sector = 'tareas' | 'pendiente' | 'otros' | 'internos';
type Cola = 'por_atender' | 'atendido' | 'todas';
type Cuentas = { tareas: number; pendientes: number; otros: number; internos: number };
type CorreoSector = {
  id: string;
  asunto: string;
  de: string;
  fecha: string | null;
  correos: number;
  areas: string[];
  resumen: string;
  atencion?: string;
};
type Pagina = { total: number; pagina: number; paginas: number; cuentas: Cuentas };
type MensajeVisible = {
  id: string;
  de: string;
  fecha: string | null;
  asunto: string;
  htmlSeguro: string;
  texto: string;
};

type Conversacion = { asunto: string; mensajes: MensajeVisible[] };

type ResumenHilo = {
  id: string;
  asunto: string;
  de: string;
  fecha: string | null;
  cots: string[];
  motivo: 'dos cot' | 'sin referencia' | 'falta cot' | 'interna' | null;
  resumen: string;
  atencion?: 'por_atender' | 'atendido';
  respuesta?: string;
  seguimiento: Tarea['seguimiento'];
};

export function PanelTareas({ apiUrl, token, tareaId }: { apiUrl: string; token: string; tareaId: string | null }) {
  const [tareas, setTareas] = useState<TareaLista[]>([]);
  const [ficha, setFicha] = useState<Tarea | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [resumen, setResumen] = useState<ResumenProceso | null>(null);
  const [sector, setSector] = useState<Sector>('tareas');
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [cuentas, setCuentas] = useState<Cuentas>({ tareas: 0, pendientes: 0, otros: 0, internos: 0 });
  const [correos, setCorreos] = useState<CorreoSector[]>([]);
  const [areasPosibles, setAreasPosibles] = useState<string[]>([]);
  const [area, setArea] = useState<string | null>(null);
  const [hilo, setHilo] = useState<ResumenHilo | null>(null);
  const [correo, setCorreo] = useState<Conversacion | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [cola, setCola] = useState<Cola>('por_atender');
  const [respuesta, setRespuesta] = useState('');
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const pedido = useRef(0);

  async function cargar(paginaDestino = pagina, sectorDestino = sector, consultaDestino = consulta) {
    const actual = ++pedido.current;
    if (sectorDestino === 'tareas') {
      const parametros = new URLSearchParams({ pagina: String(paginaDestino) });
      if (consultaDestino) parametros.set('q', consultaDestino);
      const lista = await pedir<Pagina & { tareas: TareaLista[] }>(apiUrl, token, `/tareas?${parametros}`);
      if (actual !== pedido.current) return;
      setTareas(lista.tareas);
      aplicarPagina(lista);
      return;
    }
    const parametros = new URLSearchParams({ sector: sectorDestino, pagina: String(paginaDestino) });
    if (area) parametros.set('area', area);
    if (consultaDestino) parametros.set('q', consultaDestino);
    if (sectorDestino === 'internos' && cola !== 'todas') parametros.set('atencion', cola);
    const lista = await pedir<Pagina & { correos: CorreoSector[]; areas: string[] }>(apiUrl, token, `/sectores?${parametros}`);
    if (actual !== pedido.current) return;
    setCorreos(lista.correos);
    setAreasPosibles(lista.areas);
    aplicarPagina(lista);
  }

  function aplicarPagina(lista: Pagina) {
    setTotal(lista.total);
    setPagina(lista.pagina);
    setPaginas(lista.paginas);
    setCuentas(lista.cuentas);
  }

  function elegir(siguiente: Sector) {
    setSector(siguiente);
    setPagina(1);
    setArea(null);
    setCola('por_atender');
    setFicha(null);
    setHilo(null);
    setCorreo(null);
  }

  function fijarArea(siguiente: string | null) {
    setArea(siguiente);
    setPagina(1);
    setHilo(null);
    setCorreo(null);
  }

  async function verMensaje(id: string) {
    const conversacion = await pedir<Conversacion>(apiUrl, token, `/buzon/mensajes/${id}/hilo`);
    setCorreo(conversacion);
  }

  async function abrirHilo(id: string) {
    const detalle = await pedir<ResumenHilo>(apiUrl, token, `/hilos/${id}/resumen`);
    setRespuesta(detalle.respuesta ?? '');
    setHilo(detalle);
  }

  async function decidir(id: string, destino: 'otros' | 'interna' | 'archivado' | 'evento') {
    setAviso(null);
    setMoviendo(id);
    try {
      await pedir(apiUrl, token, `/hilos/${id}/destino`, {
        method: 'POST',
        body: JSON.stringify({ destino }),
      });
      setHilo(null);
      setCorreo(null);
      await cargar(pagina, sector, consulta);
    } catch (error) {
      setAviso(texto(error));
    } finally {
      setMoviendo(null);
    }
  }

  async function guardarAtencion(estado: 'por_atender' | 'atendido') {
    if (!hilo) return;
    const guardado = await pedir<{ atencion: 'por_atender' | 'atendido'; respuesta: string }>(apiUrl, token, `/hilos/${hilo.id}/atencion`, {
      method: 'POST',
      body: JSON.stringify({ estado, respuesta }),
    });
    setHilo({ ...hilo, atencion: guardado.atencion, respuesta: guardado.respuesta });
    await cargar(pagina, sector, consulta);
  }

  async function abrir(id: string) {
    setFicha(await pedir<Tarea>(apiUrl, token, `/tareas/${id}`));
  }

  function enviarBusqueda(evento: FormEvent) {
    evento.preventDefault();
    setConsulta(busqueda.trim());
    setPagina(1);
    setFicha(null);
    setHilo(null);
    setCorreo(null);
  }

  useEffect(() => {
    void cargar(pagina, sector, consulta).catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token, pagina, sector, area, consulta, cola]);

  useEffect(() => {
    if (!tareaId) return;
    void abrir(tareaId).catch((error: unknown) => setAviso(texto(error)));
  }, [tareaId, apiUrl, token]);

  async function procesarCorreos() {
    setProcesando(true);
    setAviso(null);
    try {
      const resultado = await pedir<ResumenProceso>(apiUrl, token, '/tareas/procesar-buzon', {
        method: 'POST',
        body: JSON.stringify({ desde: '2026-08-01' }),
      });
      setResumen(resultado);
      setFicha(null);
      setPagina(1);
      await cargar(1, sector);
    } catch (error) {
      setAviso(texto(error));
    } finally {
      setProcesando(false);
    }
  }

  if (correo) {
    return (
      <section className="ficha">
        <div className="herramientas">
          <button type="button" onClick={() => setCorreo(null)}>
            Volver
          </button>
          {sector === 'otros' && correo.mensajes[0] ? (
            <div className="decisiones decisiones-ficha">
              <button type="button" disabled={moviendo === correo.mensajes[0].id} onClick={() => void decidir(correo.mensajes[0].id, 'archivado')}>
                Archivar
              </button>
            </div>
          ) : null}
        </div>
        {aviso ? <p className="error">{aviso}</p> : null}
        <h2>{correo.asunto || '(sin asunto)'}</h2>
        {correo.mensajes.map((mensaje) => (
          <article key={mensaje.id} className="correo">
            <p className="meta">{[nombreDe(mensaje.de), cuando(mensaje.fecha)].filter(Boolean).join(' · ')}</p>
            {mensaje.htmlSeguro ? (
              <div className="cuerpo" dangerouslySetInnerHTML={{ __html: mensaje.htmlSeguro }} />
            ) : (
              <p className="cuerpo">{mensaje.texto}</p>
            )}
          </article>
        ))}
      </section>
    );
  }

  if (hilo) {
    return (
      <section className="ficha">
        <button type="button" onClick={() => setHilo(null)}>
          Volver
        </button>
        <h2>{hilo.asunto || '(sin asunto)'}</h2>
        <p className="estado-tarea">{etiquetaMotivo(hilo.motivo)}</p>
        <p className="meta">{[nombreDe(hilo.de), cuando(hilo.fecha)].filter(Boolean).join(' · ')}</p>
        <article className="momento">
          <h3>Resumen</h3>
          <p>{hilo.resumen}</p>
        </article>
        {sector === 'pendiente' ? (
          <div className="decisiones decisiones-ficha">
            <button type="button" disabled={moviendo === hilo.id} onClick={() => void decidir(hilo.id, 'otros')}>
              Enviar a Otros
            </button>
            <button type="button" disabled={moviendo === hilo.id} onClick={() => void decidir(hilo.id, 'interna')}>
              Enviar a asuntos internos
            </button>
            <button type="button" disabled={moviendo === hilo.id} onClick={() => void decidir(hilo.id, 'evento')}>
              Es telemetría
            </button>
          </div>
        ) : null}
        {sector === 'pendiente' && aviso ? <p className="error">{aviso}</p> : null}
        {hilo.motivo === 'interna' ? (
          <form
            className="atencion"
            onSubmit={(evento) => {
              evento.preventDefault();
              void guardarAtencion(hilo.atencion === 'atendido' ? 'atendido' : 'por_atender').catch((error: unknown) => setAviso(texto(error)));
            }}
          >
            <p>COT 10000000000 · cliente ZGROUP. Este asunto se atiende solo. La respuesta queda guardada aquí; el buzón todavía no envía el correo.</p>
            <label htmlFor="respuesta-interna">Respuesta</label>
            <textarea id="respuesta-interna" value={respuesta} onChange={(evento) => setRespuesta(evento.target.value)} rows={5} />
            {aviso ? <p className="error">{aviso}</p> : null}
            <div className="herramientas">
              <button type="submit">Guardar respuesta</button>
              <button
                type="button"
                className="primario"
                onClick={() => void guardarAtencion(hilo.atencion === 'atendido' ? 'por_atender' : 'atendido').catch((error: unknown) => setAviso(texto(error)))}
              >
                {hilo.atencion === 'atendido' ? 'Volver a por atender' : 'Marcar atendido'}
              </button>
            </div>
          </form>
        ) : null}
        <Seguimiento seguimiento={hilo.seguimiento} mostrarVacio={false} />
      </section>
    );
  }

  if (ficha) {
    return (
      <section className="ficha">
        <button type="button" onClick={() => setFicha(null)}>
          Volver a tareas
        </button>
        <h2>COT {cotVisible(ficha.cot, ficha.cots)}</h2>
        <p className="estado-tarea">{etiquetaEstado(ficha.estado)}</p>
        {aviso ? <p className="error">{aviso}</p> : null}
        <h3>Datos de la cotización</h3>
        <dl>
          <Campo nombre="Ticket" valor={ficha.ticket} />
          <Campo nombre="Descripción" valor={ficha.descripcion} />
          <Campo nombre="Cliente" valor={ficha.cliente} />
          <Campo nombre="Lugar" valor={ficha.lugar} />
          <Campo nombre="Cita" valor={cita(ficha.cita_fecha, ficha.cita_hora)} />
          <Campo nombre="Dirección" valor={direccionLimpia(ficha.cita_direccion)} />
          <Campo nombre="Mapa" valor={ficha.cita_mapa} enlace />
          <Campo nombre="También citado" valor={cita(ficha.cita_parcial_fecha, ficha.cita_parcial_hora)} />
          <Campo nombre="Temperatura" valor={[ficha.temperatura, ficha.producto].filter(Boolean).join(' · ') || null} />
          <Campo nombre="Telemetrías" valor={ficha.cantidad === null ? null : String(ficha.cantidad)} />
          <Campo nombre="Contenedor" valor={ficha.contenedor} />
          <Campo nombre="Comercial" valor={[ficha.comercial_nombre, ficha.comercial_cargo].filter(Boolean).join(', ') || null} />
          <Campo nombre="Correo" valor={ficha.comercial_correo} />
          <Campo nombre="Teléfono" valor={ficha.comercial_telefono} />
        </dl>
        <Correccion apiUrl={apiUrl} token={token} ficha={ficha} alGuardar={setFicha} alFallar={setAviso} />
        <Seguimiento seguimiento={ficha.seguimiento} parte="encargo" />
        <Bitacora apiUrl={apiUrl} token={token} ficha={ficha} alGuardar={setFicha} alFallar={setAviso} />
        <Situaciones situaciones={ficha.situaciones ?? []} />
        <Seguimiento seguimiento={ficha.seguimiento} parte="correos" />
      </section>
    );
  }

  return (
    <section className="ficha">
      <div className="herramientas">
        <h2>Tareas</h2>
        <form className="buscar buscar-tareas" onSubmit={enviarBusqueda}>
          <label className="sr" htmlFor="buscar-tareas">
            Buscar en tareas
          </label>
          <input
            id="buscar-tareas"
            type="search"
            value={busqueda}
            placeholder="Buscar COT, cliente, lugar o referencia"
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <button type="submit">Buscar</button>
        </form>
        <button type="button" className="primario" disabled={procesando} onClick={() => void procesarCorreos()}>
          {procesando ? 'Procesando…' : 'Procesar correos'}
        </button>
      </div>
      <div className="sectores" role="tablist">
        <button type="button" className={sector === 'tareas' ? 'activo' : ''} onClick={() => elegir('tareas')}>
          Tareas <span>{cuentas.tareas}</span>
        </button>
        <button type="button" className={sector === 'pendiente' ? 'activo' : ''} onClick={() => elegir('pendiente')}>
          Pendiente de decisión <span>{cuentas.pendientes}</span>
        </button>
        <button type="button" className={sector === 'otros' ? 'activo' : ''} onClick={() => elegir('otros')}>
          Otros <span>{cuentas.otros}</span>
        </button>
        <button type="button" className={sector === 'internos' ? 'activo' : ''} onClick={() => elegir('internos')}>
          Asuntos internos <span>{cuentas.internos}</span>
        </button>
      </div>
      <p>{textoSector(sector)}</p>
      {sector === 'internos' ? (
        <div className="filtro-area">
          <button type="button" className={cola === 'por_atender' ? 'activo' : ''} onClick={() => { setCola('por_atender'); setPagina(1); }}>
            Por atender
          </button>
          <button type="button" className={cola === 'atendido' ? 'activo' : ''} onClick={() => { setCola('atendido'); setPagina(1); }}>
            Atendidos
          </button>
          <button type="button" className={cola === 'todas' ? 'activo' : ''} onClick={() => { setCola('todas'); setPagina(1); }}>
            Todas
          </button>
        </div>
      ) : null}
      {sector !== 'tareas' && sector !== 'internos' ? (
        <div className="filtro-area">
          <button type="button" className={area ? '' : 'activo'} onClick={() => fijarArea(null)}>
            Todas
          </button>
          {areasPosibles.map((nombre) => (
            <button type="button" key={nombre} className={area === nombre ? 'activo' : ''} onClick={() => fijarArea(nombre)}>
              {nombre}
            </button>
          ))}
        </div>
      ) : null}
      {aviso ? <p className="error">{aviso}</p> : null}
      {resumen ? (
        <div className="resumen-proceso">
          <p>
            {resumen.mensajes} correos clasificados. {resumen.nuevas} tareas nuevas, {resumen.repetidas} correos de una COT que ya tenía tarea, {resumen.pendientes} pendientes de decisión, {resumen.internos ?? 0} asuntos internos y {resumen.otros} en Otros.
          </p>
        </div>
      ) : null}
      <div className="paginas">
        <span>
          {total === 0 ? '0' : `${(pagina - 1) * 10 + 1}–${Math.min(pagina * 10, total)}`} de {total}
        </span>
        <button type="button" aria-label="Anterior" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
          ‹
        </button>
        <button type="button" aria-label="Siguiente" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
          ›
        </button>
      </div>
      {sector === 'tareas' ? (
        tareas.length === 0 ? (
          <p>{consulta ? 'No hay tareas con ese texto.' : 'Todavía no hay tareas. Pulsa Procesar correos.'}</p>
        ) : (
          <ul className="lista">
            {tareas.map((tarea) => (
              <li key={tarea.id}>
                <button type="button" className="fila" onClick={() => void abrir(tarea.id).catch((error: unknown) => setAviso(texto(error)))}>
                  <span className="avatar" aria-hidden="true">
                    C
                  </span>
                  <span className="quien">COT {cotVisible(tarea.cot, tarea.cots)}</span>
                  <span className="resumen-fila">
                    <strong>{tarea.cliente || tarea.lugar || tarea.descripcion || 'Sin cliente'}</strong>
                    {tarea.cliente && tarea.lugar ? <span className="extracto"> — {tarea.lugar}</span> : null}
                    {tarea.referencias && tarea.referencias.length > 0 ? (
                      <span className="senales">
                        {tarea.referencias.map((frase) => (
                          <mark key={frase}>{frase}</mark>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <time>{cuando(tarea.fecha)}</time>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : correos.length === 0 ? (
        <p>{consulta ? 'No hay correos con ese texto.' : sector === 'internos' ? 'No hay asuntos internos en esta cola.' : 'No hay correos en este grupo.'}</p>
      ) : (
        <ul className="lista">
          {correos.map((correo) => (
            <li key={correo.id} className={sector === 'pendiente' || sector === 'otros' ? 'con-decision' : undefined}>
              <button
                type="button"
                className="fila"
                onClick={() => {
                  const abrir = sector === 'otros' ? verMensaje(correo.id) : abrirHilo(correo.id);
                  void abrir.catch((error: unknown) => setAviso(texto(error)));
                }}
              >
                <span className="avatar" aria-hidden="true">
                  {sector === 'pendiente' ? 'P' : sector === 'internos' ? 'I' : 'O'}
                </span>
                <span className="quien">{nombreDe(correo.de)}</span>
                <span className="resumen-fila">
                  <strong>{correo.asunto || '(sin asunto)'}</strong>
                  {sector !== 'otros' && correo.resumen ? <span className="resumen-pendiente">{correo.resumen}</span> : null}
                  {sector === 'internos' ? <span className="areas-correo"><span>{correo.atencion === 'atendido' ? 'Atendido' : 'Por atender'}</span></span> : null}
                  {correo.areas.length > 0 ? (
                    <span className="areas-correo">
                      {correo.areas.map((nombre) => (
                        <span key={nombre}>{nombre}</span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <time>{cuando(correo.fecha)}</time>
              </button>
              {sector === 'pendiente' ? (
                <div className="decisiones">
                  <button type="button" disabled={moviendo === correo.id} onClick={() => void decidir(correo.id, 'otros')}>
                    Enviar a Otros
                  </button>
                  <button type="button" disabled={moviendo === correo.id} onClick={() => void decidir(correo.id, 'interna')}>
                    Enviar a asuntos internos
                  </button>
                  <button type="button" disabled={moviendo === correo.id} onClick={() => void decidir(correo.id, 'evento')}>
                    Es telemetría
                  </button>
                </div>
              ) : null}
              {sector === 'otros' ? (
                <div className="decisiones">
                  <button type="button" disabled={moviendo === correo.id} onClick={() => void decidir(correo.id, 'archivado')}>
                    Archivar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PanelDiccionario({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [terminos, setTerminos] = useState<Termino[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    setTerminos(await pedir<Termino[]>(apiUrl, token, '/diccionario'));
  }

  useEffect(() => {
    void cargar().catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    await pedir(apiUrl, token, '/diccionario', { method: 'POST', body: JSON.stringify({ termino: nuevo }) });
    setNuevo('');
    await cargar();
  }

  async function fijar(termino: Termino) {
    setAviso(null);
    await pedir(apiUrl, token, `/diccionario/${termino.id}`, {
      method: 'POST',
      body: JSON.stringify({ activo: !termino.activo }),
    });
    await cargar();
  }

  return (
    <section className="ficha">
      <h2>Diccionario</h2>
      <p>Cada término activo, palabra o frase, se busca en el correo. Si hay cotización, abre la tarea y esas referencias quedan resaltadas. Puede haber una o más.</p>
      {aviso ? <p className="error">{aviso}</p> : null}
      <form
        className="rango"
        onSubmit={(evento) => void agregar(evento).catch((error: unknown) => setAviso(texto(error)))}
      >
        <label htmlFor="termino">Término</label>
        <input id="termino" value={nuevo} onChange={(evento) => setNuevo(evento.target.value)} required />
        <button type="submit" className="primario">
          Agregar
        </button>
      </form>
      <ul className="diccionario">
        {terminos.map((termino) => (
          <li key={termino.id}>
            <span>{termino.termino}</span>
            <button type="button" className={termino.activo ? 'sync-auto activa' : 'sync-auto'} onClick={() => void fijar(termino).catch((error: unknown) => setAviso(texto(error)))}>
              {termino.activo ? 'Activo' : 'Inactivo'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CAMPOS_CORREGIBLES = [
  { id: 'cliente', nombre: 'Cliente' },
  { id: 'lugar', nombre: 'Lugar' },
  { id: 'descripcion', nombre: 'Descripción' },
  { id: 'cita_fecha', nombre: 'Fecha de la cita' },
  { id: 'cita_hora', nombre: 'Hora de la cita' },
  { id: 'cita_direccion', nombre: 'Dirección' },
  { id: 'comercial_nombre', nombre: 'Comercial' },
  { id: 'comercial_telefono', nombre: 'Teléfono' },
];

function Correccion({
  apiUrl,
  token,
  ficha,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  ficha: Tarea;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const [campo, setCampo] = useState('cliente');
  const [valor, setValor] = useState('');
  const corregidos = ficha.campos_corregidos ?? [];

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    const tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/correccion`, {
      method: 'POST',
      body: JSON.stringify({ campo, valor }),
    });
    setValor('');
    alGuardar(tarea);
  }

  async function releer(nombre: string) {
    const tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/releer`, {
      method: 'POST',
      body: JSON.stringify({ campo: nombre }),
    });
    alGuardar(tarea);
  }

  return (
    <section>
      <h3>Corregir un dato</h3>
      <form className="rango" onSubmit={(evento) => void guardar(evento).catch((error: unknown) => alFallar(texto(error)))}>
        <label htmlFor="campo-corregir">Campo</label>
        <select id="campo-corregir" value={campo} onChange={(evento) => setCampo(evento.target.value)}>
          {CAMPOS_CORREGIBLES.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.nombre}
            </option>
          ))}
        </select>
        <label htmlFor="valor-corregir">Valor</label>
        <input id="valor-corregir" value={valor} onChange={(evento) => setValor(evento.target.value)} required />
        <button type="submit">Guardar corrección</button>
      </form>
      {corregidos.length > 0 ? (
        <div className="decisiones decisiones-ficha">
          {corregidos.map((nombre) => (
            <button key={nombre} type="button" onClick={() => void releer(nombre).catch((error: unknown) => alFallar(texto(error)))}>
              Volver a leer {CAMPOS_CORREGIBLES.find((opcion) => opcion.id === nombre)?.nombre ?? nombre}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Situaciones({ situaciones }: { situaciones: Situacion[] }) {
  if (situaciones.length === 0) return null;
  return (
    <section>
      <h3>Situaciones del hilo</h3>
      <ol className="linea-tiempo">
        {situaciones.map((situacion, indice) => (
          <li key={`${situacion.fecha ?? ''}-${indice}`} className={situacion.tipo === 'reprogramacion' ? 'nuestra' : undefined}>
            <time>{cuando(situacion.fecha)}</time>
            <strong>{[etiquetaSituacion(situacion.tipo), nombreDe(situacion.de)].filter(Boolean).join(' · ')}</strong>
            <span>{situacion.resumen}</span>
            {situacion.cita_anterior ? (
              <span>Cita anterior: {[situacion.cita_anterior.fecha, situacion.cita_anterior.hora, situacion.cita_anterior.direccion].filter(Boolean).join(' · ')}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function etiquetaSituacion(tipo: string): string {
  if (tipo === 'origen') return 'Origen';
  if (tipo === 'reprogramacion') return 'Reprogramación';
  return 'Informativa';
}

function Seguimiento({
  seguimiento,
  mostrarVacio = true,
  parte = 'completa',
}: {
  seguimiento: Tarea['seguimiento'] | undefined;
  mostrarVacio?: boolean;
  parte?: 'completa' | 'encargo' | 'correos';
}) {
  if (!seguimiento) return null;
  const { momento, areas, linea } = seguimiento;
  const encargo = parte === 'completa' || parte === 'encargo';
  const correos = parte === 'completa' || parte === 'correos';
  return (
    <div className="seguimiento">
      {encargo && (momento || mostrarVacio) ? (
      <article className="momento">
        <h3>Por qué nos corresponde</h3>
        {momento ? (
          <>
            <p className="meta">{[momento.area, momento.cuando, momento.de].filter(Boolean).join(' · ')}</p>
            <p className="extracto-motivo">
              <Marcado texto={momento.extracto} frases={momento.frases} />
            </p>
            {momento.frases.length > 0 ? (
              <p className="senales">
                Referencias:{' '}
                {momento.frases.map((frase) => (
                  <mark key={frase}>{frase}</mark>
                ))}
              </p>
            ) : null}
          </>
        ) : (
          <p>En estos correos no aparece la convocatoria a Luis y Eusebio.</p>
        )}
      </article>
      ) : null}
      {encargo && areas.length > 0 ? (
        <section>
          <h3>Áreas del encargo</h3>
          <ol className="areas">
            {areas.map((area) => (
              <li key={area.area} className={area.nuestra ? 'nuestra' : undefined}>
                <strong>{area.area}</strong>
                <span>{area.texto}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {correos && linea.length > 0 ? (
        <section>
          <h3>Línea de tiempo</h3>
          <ol className="linea-tiempo">
            {linea.map((paso, indice) => (
              <li key={`${paso.cuando}-${indice}`} className={paso.convoca ? 'nuestra' : undefined}>
                <time>{paso.cuando}</time>
                <strong>{paso.de}</strong>
                <span>{paso.resumen}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Marcado({ texto, frases }: { texto: string; frases: string[] }) {
  return (
    <>
      {tramos(texto, frases).map((tramo, indice) =>
        tramo.marca ? <mark key={indice}>{tramo.texto}</mark> : <span key={indice}>{tramo.texto}</span>,
      )}
    </>
  );
}

function tramos(texto: string, frases: string[]): Array<{ texto: string; marca: boolean }> {
  const bajos = texto.toLowerCase();
  const marcas = frases
    .map((frase) => {
      const inicio = bajos.indexOf(frase.toLowerCase());
      return inicio < 0 ? null : { inicio, fin: inicio + frase.length };
    })
    .filter((marca): marca is { inicio: number; fin: number } => marca !== null)
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  const usadas: Array<{ inicio: number; fin: number }> = [];
  for (const marca of marcas) {
    if (usadas.some((previa) => marca.inicio < previa.fin && marca.fin > previa.inicio)) continue;
    usadas.push(marca);
  }
  const partes: Array<{ texto: string; marca: boolean }> = [];
  let cursor = 0;
  for (const marca of usadas) {
    if (marca.inicio > cursor) partes.push({ texto: texto.slice(cursor, marca.inicio), marca: false });
    partes.push({ texto: texto.slice(marca.inicio, marca.fin), marca: true });
    cursor = marca.fin;
  }
  if (cursor < texto.length) partes.push({ texto: texto.slice(cursor), marca: false });
  return partes.length > 0 ? partes : [{ texto, marca: false }];
}

function direccionLimpia(valor: string | null): string | null {
  if (!valor) return null;
  const limpia = valor.replace(/<\s*https?:\/\/[^>]*>/gi, ' ').replace(/https?:\/\/\S+/gi, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return limpia || null;
}

function etiquetaMotivo(motivo: ResumenHilo['motivo']): string {
  if (motivo === 'dos cot') return 'Más de una COT';
  if (motivo === 'sin referencia') return 'Cotización sin cita a desarrollo';
  if (motivo === 'falta cot') return 'Sin COT';
  if (motivo === 'interna') return 'Aviso interno';
  return 'Otros';
}

function textoSector(sector: Sector): string {
  if (sector === 'tareas') return 'Cotizaciones que citan una palabra o frase del diccionario. Una tarea puede reunir una o más cotizaciones y una o más referencias.';
  if (sector === 'internos') return 'Asuntos internos de ZGROUP, COT 10000000000. Cada asunto se atiende aparte. No es una instalación de telemetría.';
  if (sector === 'pendiente') return 'Hay cotización o ticket, y no queda claro que nos corresponda. Hay que decidir.';
  return 'El asunto no trae cotización ni ticket, ni una referencia a desarrollo.';
}

function nombreDe(de: string): string {
  const nombre = de.replace(/<[^>]*>/g, ' ').replace(/[a-z0-9._+-]+@[a-z0-9.-]+/gi, ' ').replace(/\s+/g, ' ').trim();
  return nombre || 'Sin nombre';
}

function cuando(fecha: string | null): string {
  if (!fecha) return '';
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

function Campo({ nombre, valor, enlace = false }: { nombre: string; valor: string | null; enlace?: boolean }) {
  if (!valor) return null;
  return (
    <>
      <dt>{nombre}</dt>
      <dd>{enlace ? <a href={valor}>{valor}</a> : valor}</dd>
    </>
  );
}

function cotVisible(cot: string, cots?: string[]): string {
  const lista = cots && cots.length > 0 ? cots : cot.split('+').filter(Boolean);
  return lista.join(' · ');
}

function cita(fecha: string | null, hora: string | null): string | null {
  if (!fecha && !hora) return null;
  const dia = fecha ? fecha.slice(0, 10).split('-').reverse().join('/') : '';
  return [dia, hora].filter(Boolean).join(' ');
}

function etiquetaEstado(estado: string): string {
  if (estado === 'detectada') return 'Detectada';
  if (estado === 'en_seguimiento') return 'En seguimiento';
  if (estado === 'en_validacion') return 'En validación';
  if (estado === 'informativa') return 'Informativa';
  return estado;
}

function Bitacora({
  apiUrl,
  token,
  ficha,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  ficha: Tarea;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const [modal, setModal] = useState<'seguimiento' | 'incidente' | null>(null);
  const [textoNota, setTextoNota] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const notas = ficha.notas ?? [];

  function abrir(tipo: 'seguimiento' | 'incidente') {
    setTextoNota('');
    setFoto(null);
    setModal(tipo);
  }

  function limpiar() {
    setModal(null);
    setAnulando(null);
    setTextoNota('');
    setFoto(null);
    setMotivo('');
  }

  function cerrar() {
    if (guardando) return;
    limpiar();
  }

  async function tomar() {
    alGuardar(await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/tomar`, { method: 'POST' }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!modal) return;
    setGuardando(true);
    try {
      const cuerpo: { tipo: string; texto: string; archivo?: { nombre: string; mime: string; contenido: string } } = { tipo: modal, texto: textoNota };
      if (foto) cuerpo.archivo = await leerFoto(foto);
      alGuardar(await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/notas`, { method: 'POST', body: JSON.stringify(cuerpo) }));
      setGuardando(false);
      limpiar();
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  async function validar() {
    alGuardar(await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/validar`, { method: 'POST', body: JSON.stringify({ horas: 4 }) }));
  }

  async function anular(evento: FormEvent) {
    evento.preventDefault();
    if (!anulando) return;
    setGuardando(true);
    try {
      alGuardar(
        await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/notas/${anulando}/anular`, {
          method: 'POST',
          body: JSON.stringify({ texto: motivo }),
        }),
      );
      setGuardando(false);
      limpiar();
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  return (
    <section className="bitacora">
      <div className="bitacora-cabeza">
        <h3>Bitácora</h3>
        <p>{ficha.responsable_nombre ? `La tomó ${ficha.responsable_nombre}.` : 'Nadie la ha tomado.'}</p>
        <p>{ficha.recordar_en ? `Vuelve a salir: ${cuando(ficha.recordar_en)}.` : ficha.en_barrido ? 'Entra al recordatorio de esta hora.' : 'No entra al recordatorio de cada hora.'}</p>
      </div>
      <div className="bitacora-acciones">
        {ficha.responsable_nombre ? null : (
          <button type="button" className="primario" onClick={() => void tomar().catch((error: unknown) => alFallar(texto(error)))}>
            Tomar tarea
          </button>
        )}
        <button type="button" className="primario" onClick={() => abrir('seguimiento')}>
          Anotar seguimiento
        </button>
        <button type="button" onClick={() => abrir('incidente')}>
          Registrar incidente
        </button>
        <button type="button" onClick={() => void validar().catch((error: unknown) => alFallar(texto(error)))}>
          Recordarme en 4 horas
        </button>
      </div>
      {notas.length > 0 ? (
        <ol className="bitacora-tiempo">
          {notas.map((nota) => (
            <li key={nota.id} className={nota.tipo}>
              <div className="bitacora-evento">
                <time>{cuando(nota.creado_en)}</time>
                <strong>{etiquetaNota(nota.tipo)}</strong>
                <span>{nota.autor_nombre}</span>
              </div>
              <p>{nota.texto}</p>
              {nota.archivo_nombre ? <FotoNota apiUrl={apiUrl} token={token} tareaId={ficha.id} notaId={nota.id} nombre={nota.archivo_nombre} /> : null}
              {nota.tipo !== 'anulacion' ? (
                <button type="button" onClick={() => { setMotivo(''); setAnulando(nota.id); }}>
                  Anular
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="bitacora-vacia">Todavía no hay notas del equipo.</p>
      )}
      {modal ? (
        <Cuadro
          titulo={modal === 'seguimiento' ? 'Seguimiento' : 'Incidente'}
          ayuda={modal === 'seguimiento' ? 'Lo que te dijeron. Con esta nota la tarea sale del recordatorio de cada hora.' : 'Queda en la línea de tiempo. No vuelve a entrar al recordatorio.'}
          alCerrar={cerrar}
        >
          <form onSubmit={(evento) => void enviar(evento)}>
            <label htmlFor="texto-nota">Qué pasó</label>
            <textarea id="texto-nota" value={textoNota} onChange={(evento) => setTextoNota(evento.target.value)} rows={5} required autoFocus />
            <label htmlFor="foto-nota">Foto</label>
            <input id="foto-nota" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(evento) => setFoto(evento.target.files?.[0] ?? null)} />
            <p className="meta">{foto ? foto.name : 'La foto es opcional.'}</p>
            <div className="modal-acciones">
              <button type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" className="primario" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Cuadro>
      ) : null}
      {anulando ? (
        <Cuadro titulo="Anular nota" ayuda="La nota se queda. Esta explicación se suma a la línea de tiempo." alCerrar={cerrar}>
          <form onSubmit={(evento) => void anular(evento)}>
            <label htmlFor="motivo-anulacion">Por qué se anula</label>
            <textarea id="motivo-anulacion" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} rows={4} required autoFocus />
            <div className="modal-acciones">
              <button type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" className="primario" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar anulación'}
              </button>
            </div>
          </form>
        </Cuadro>
      ) : null}
    </section>
  );
}

function Cuadro({ titulo, ayuda, alCerrar, children }: { titulo: string; ayuda: string; alCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('keydown', tecla);
    };
  }, [alCerrar]);

  return (
    <div className="modal-fondo" onMouseDown={alCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-modal" onMouseDown={(evento) => evento.stopPropagation()}>
        <h3 id="titulo-modal">{titulo}</h3>
        <p className="meta">{ayuda}</p>
        {children}
      </div>
    </div>
  );
}

function FotoNota({ apiUrl, token, tareaId, notaId, nombre }: { apiUrl: string; token: string; tareaId: string; notaId: string; nombre: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    let objeto = '';
    void fetch(`${apiUrl}/tareas/${tareaId}/notas/${notaId}/archivo`, { headers: { authorization: `Bearer ${token}` } })
      .then((respuesta) => (respuesta.ok ? respuesta.blob() : null))
      .then((blob) => {
        if (!blob || !vigente) return;
        objeto = URL.createObjectURL(blob);
        setUrl(objeto);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [apiUrl, token, tareaId, notaId]);
  if (!url) return <span>{nombre}</span>;
  return <img className="nota-foto" src={url} alt={nombre} />;
}

function etiquetaNota(tipo: string): string {
  if (tipo === 'seguimiento') return 'Seguimiento';
  if (tipo === 'incidente') return 'Incidente';
  return 'Anulación';
}

function leerFoto(archivo: File): Promise<{ nombre: string; mime: string; contenido: string }> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const data = String(lector.result ?? '');
      resolve({ nombre: archivo.name, mime: archivo.type, contenido: data.slice(data.indexOf(',') + 1) });
    };
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
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
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
