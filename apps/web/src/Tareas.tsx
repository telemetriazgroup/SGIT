import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Correr = <T>(promesa: Promise<T>, listo?: string, cargando?: string) => Promise<T | null>;
const TrabajoContext = createContext<Correr | null>(null);

function useTrabajo(): Correr {
  return useContext(TrabajoContext) ?? (async (promesa) => promesa);
}

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
  habilitada?: boolean;
  campana?: boolean;
  proyecto?: boolean;
  locales?: number;
  despacho_fecha?: string | null;
  despacho_hora?: string | null;
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
  codigo_equipo?: string | null;
  maquina_equipo?: string | null;
  asignacion?: {
    autor_nombre: string;
    texto: string;
    confirmada_en: string | null;
    validacion?: string | null;
    imagenes?: Array<{ id: string; nombre: string }>;
    consulta?: string | null;
  } | null;
  movimientos?: Array<{ id: string; tipo: string; actor: string; detalle: string; creado_en: string }>;
  odoo?: { venta: VistaOdoo; ticket: VistaOdoo; cambios?: CambioOdoo[] } | null;
  campana?: boolean;
  proyecto?: boolean;
  tiendas?: TiendaCampana[];
  servicios?: ServicioCampana[];
  borrador?: { codigo: string; maquina: string; autor_nombre: string } | null;
  hilos?: HiloFicha[];
  fabricaciones?: Array<{ hiloId: string; orden: string; estado: string; enlace: string; ejecutor: string }>;
};

type HiloFicha = {
  id: string;
  orden: number;
  estado: string;
  lleva_telemetria: boolean | null;
  contenedor: string | null;
  maquina: string | null;
  despacho_texto: string | null;
  chip_imei?: string | null;
  chip_celular: string | null;
  chip_estado?: 'disponible' | 'ocupado' | null;
  despacho_validado: boolean;
  modem_serie?: string | null;
  modem_imei?: string | null;
  clase?: 'telemetria' | 'infraestructura' | 'hmi';
};

type CopiaOdoo = {
  nombre: string;
  cliente: string;
  estado: string;
  factura: string;
  entrega: string;
  total: string;
  nota: string;
  lineas: Array<{ nombre: string; producto: string; tipo?: string; equipo?: string; cantidad: number | null; entregada: number | null; facturada: number | null; precio?: string; descuento?: string; importe?: string }>;
  notas: Array<{ fecha: string; autor: string; texto: string }>;
  ficha?: Array<{ nombre: string; valor: string; lado: 'izq' | 'der' }>;
  pasos?: string[];
  paso?: string;
  cinta?: string;
};

type TiendaCampana = {
  id: string;
  orden: number | null;
  cadena: string;
  nombre: string;
  contacto: string;
  celular: string;
  entrega_fecha: string | null;
  entrega_hora: string;
  status: string;
  tamano: string;
  direccion: string;
  mapa: string;
  estado: string;
  codigo_equipo: string | null;
  odoo_nombre: string;
  odoo_estado: string;
  tarea_hija_id?: string | null;
  archivada?: boolean;
  hilos?: number;
  notas?: Array<{ id: string; tipo: string; texto: string; autor_nombre: string; creado_en: string }>;
};

type ColumnaTienda = { alias: string; campo: string };
type PlantillaTienda = { id: string; nombre: string; activa: boolean; columnas: ColumnaTienda[] };
type FormaFecha = { nombre: string; ejemplo: string; queda: string; nota: string; reconocida: boolean };

const CAMPOS_TIENDA = [
  ['orden', 'Número'],
  ['cadena', 'Cadena'],
  ['tienda', 'Tienda'],
  ['contacto', 'Contacto'],
  ['celular', 'Celular'],
  ['entregaFecha', 'Fecha de entrega'],
  ['entregaHora', 'Hora de entrega'],
  ['status', 'Status'],
  ['tamano', 'Tamaño'],
  ['direccion', 'Dirección'],
  ['mapa', 'Mapa'],
] as const;

type ServicioCampana = { odoo_id: number; nombre: string; estado: string; tienda_id: string | null };

type CambioOdoo = {
  clase: 'venta' | 'ticket';
  texto: string;
  detalle: Array<{ campo: string; antes: string; despues: string }>;
  creado_en: string;
};

type VistaOdoo = {
  vinculo: 'unico' | 'sin_vinculo' | 'ambiguo';
  odoo_id: number | null;
  estado: string | null;
  candidatos: Array<{ id: number; estado: string; nombre?: string }>;
  copia: CopiaOdoo | null;
  aviso: string | null;
  leido_en: string | null;
};

type NotaBitacora = {
  id: string;
  tipo: string;
  canal?: string;
  texto: string;
  autor_nombre: string;
  archivo_nombre: string | null;
  archivado?: boolean;
  creado_en: string;
  imagenes?: Array<{ id: string; nombre: string }>;
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
type Cola = 'por_atender' | 'atendido' | 'resuelto' | 'todas';
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
  habilitada?: boolean;
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
  atencion?: 'por_atender' | 'atendido' | 'resuelto';
  respuesta?: string;
  cierreArchivo?: boolean;
  notas?: Array<{ id: string; tarea_id?: string; tipo: string; texto: string; autor_nombre: string; creado_en: string; archivo_nombre: string | null }>;
  seguimiento: Tarea['seguimiento'];
};

export function PanelTareas({
  apiUrl,
  token,
  tareaId,
  editar,
  anotar,
  atender,
  sistema,
  prioridad,
  habilita,
  proyectos = false,
  convierte = false,
}: {
  apiUrl: string;
  token: string;
  tareaId: string | null;
  editar: boolean;
  anotar: boolean;
  atender: boolean;
  sistema: boolean;
  prioridad: boolean;
  habilita: boolean;
  proyectos?: boolean;
  convierte?: boolean;
}) {
  const [tareas, setTareas] = useState<TareaLista[]>([]);
  const [ficha, setFicha] = useState<Tarea | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargandoTarea, setCargandoTarea] = useState(false);
  const [trabajo, setTrabajo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
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
  const [vista, setVista] = useState<'abiertas' | 'resueltas'>('abiertas');
  const [hoja, setHoja] = useState<'tarea' | 'odoo'>('tarea');
  const [respuesta, setRespuesta] = useState('');
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const pedido = useRef(0);

  async function cargar(paginaDestino = pagina, sectorDestino = sector, consultaDestino = consulta) {
    const actual = ++pedido.current;
    if (sectorDestino === 'tareas') {
      const parametros = new URLSearchParams({ pagina: String(paginaDestino) });
      if (consultaDestino) parametros.set('q', consultaDestino);
      if (vista === 'resueltas') parametros.set('vista', 'resueltas');
      if (proyectos) parametros.set('lista', 'proyectos');
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
    setHoja('tarea');
    setCargandoTarea(true);
    setAviso(null);
    try {
      setFicha(await pedir<Tarea>(apiUrl, token, `/tareas/${id}`));
    } finally {
      setCargandoTarea(false);
    }
  }

  async function correr<T>(promesa: Promise<T>, listo = 'Quedó guardado.', cargando = 'Guardando…'): Promise<T | null> {
    setTrabajo(cargando);
    setHecho(null);
    setAviso(null);
    try {
      const valor = await promesa;
      setHecho(listo);
      return valor;
    } catch (error: unknown) {
      setAviso(texto(error));
      return null;
    } finally {
      setTrabajo(null);
    }
  }

  const velo = (
    <>
      {cargandoTarea ? <ModalEspera titulo="Cargando la tarea" texto="Leyendo los datos que ya están guardados." /> : null}
      {trabajo ? <ModalEspera titulo={trabajo} texto="Espera un momento." /> : null}
      {hecho ? <ModalEspera titulo={hecho} alCerrar={() => setHecho(null)} /> : null}
    </>
  );

  async function marcar(clase: 'tarea' | 'interno' | 'decision', id: string, visible: boolean) {
    setAviso(null);
    try {
      await pedir(apiUrl, token, '/habilitados', { method: 'POST', body: JSON.stringify({ clase, id, visible }) });
      await cargar();
    } catch (error: unknown) {
      setAviso(texto(error));
    }
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
  }, [apiUrl, token, pagina, sector, area, consulta, cola, vista, proyectos]);

  useEffect(() => {
    if (!tareaId) return;
    void abrir(tareaId).catch((error: unknown) => setAviso(texto(error)));
  }, [tareaId, apiUrl, token]);

  useEffect(() => {
    if (!hecho) return;
    const reloj = window.setTimeout(() => setHecho(null), 1600);
    return () => window.clearTimeout(reloj);
  }, [hecho]);

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
      <TrabajoContext.Provider value={correr}>
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
        {sector === 'pendiente' && sistema ? (
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
        {hilo.motivo === 'interna' && sistema && hilo.atencion !== 'resuelto' ? (
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
        {hilo.atencion === 'resuelto' || (hilo.notas && hilo.notas.length > 0) ? (
          <ol className="bitacora-tiempo">
            {(hilo.notas ?? []).map((nota) => (
              <li key={nota.id} className={nota.tipo}>
                <div className="bitacora-evento">
                  <time>{cuando(nota.creado_en)}</time>
                  <strong>{etiquetaNota(nota.tipo)}</strong>
                  <span>{nota.autor_nombre}</span>
                </div>
                <p>{nota.texto}</p>
                {nota.archivo_nombre && nota.tarea_id ? <FotoNota apiUrl={apiUrl} token={token} tareaId={nota.tarea_id} notaId={nota.id} nombre={nota.archivo_nombre} /> : null}
              </li>
            ))}
            {hilo.atencion === 'resuelto' && (hilo.notas ?? []).every((nota) => nota.tipo !== 'cierre') ? (
              <li className="cierre">
                <div className="bitacora-evento">
                  <strong>Seguimiento de cierre</strong>
                </div>
                <p>{hilo.respuesta}</p>
                {hilo.cierreArchivo ? <FotoCierre apiUrl={apiUrl} token={token} mensajeId={hilo.id} /> : null}
              </li>
            ) : null}
          </ol>
        ) : null}
        {editar && hilo.atencion !== 'resuelto' && (sector === 'internos' || sector === 'pendiente') ? (
          <AccionesAsunto
            apiUrl={apiUrl}
            token={token}
            mensajeId={hilo.id}
            modo={sector === 'internos' ? 'interno' : 'decision'}
            alListo={() => {
              setHilo(null);
              void cargar().catch((error: unknown) => setAviso(texto(error)));
            }}
            alFallar={setAviso}
          />
        ) : null}
        <Seguimiento seguimiento={hilo.seguimiento} mostrarVacio={false} />
        {velo}
      </section>
      </TrabajoContext.Provider>
    );
  }

  async function decidirBorrador(confirmar: boolean) {
    if (!ficha) return;
    const ruta = confirmar ? `/tareas/${ficha.id}/borrador/confirmar` : `/tareas/${ficha.id}/borrador/descartar`;
    const tarea = await correr(pedir<Tarea>(apiUrl, token, ruta, { method: 'POST', body: '{}' }), confirmar ? 'El código y la máquina quedaron confirmados.' : 'El borrador quedó descartado.');
    if (tarea) setFicha(tarea);
  }

  if (ficha) {
    return (
      <TrabajoContext.Provider value={correr}>
      <section className="ficha">
        <button
          type="button"
          onClick={() => {
            setFicha(null);
            void cargar().catch((error: unknown) => setAviso(texto(error)));
          }}
        >
          Volver a tareas
        </button>
        <h2>COT {cotVisible(ficha.cot, ficha.cots)}</h2>
        <p className="estado-tarea">{etiquetaEstado(ficha.estado)}</p>
        {aviso ? <p className="error">{aviso}</p> : null}
        <div className="fichas-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={hoja === 'tarea'} className={hoja === 'tarea' ? 'activo' : ''} onClick={() => setHoja('tarea')}>
            Seguimiento
          </button>
          <button type="button" role="tab" aria-selected={hoja === 'odoo'} className={hoja === 'odoo' ? 'activo' : ''} onClick={() => setHoja('odoo')}>
            Odoo
          </button>
        </div>
        {hoja === 'odoo' ? (
          <HojaOdoo
            ficha={ficha}
            editar={editar}
            onActualizar={() => {
              void correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/odoo/actualizar`, { method: 'POST' }), 'Odoo quedó actualizado.', 'Consultando Odoo…').then((tarea) => {
                if (tarea) setFicha(tarea);
              });
            }}
            elegir={(clase, odooId) => {
              void correr(
                pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/odoo/vincular`, {
                  method: 'POST',
                  body: JSON.stringify({ clase, odooId }),
                }),
                'El documento quedó vinculado.',
              ).then((tarea) => {
                if (tarea) setFicha(tarea);
              });
            }}
          />
        ) : null}
        {hoja === 'tarea' ? (
        <>
        {editar && !ficha.campana ? (
          <button
            type="button"
            onClick={() => {
              void correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/campana`, { method: 'POST' }), 'La cotización quedó en modo campaña.').then((tarea) => {
                if (tarea) setFicha(tarea);
              });
            }}
          >
            Pasar a campaña
          </button>
        ) : null}
        {ficha.campana ? <TiendasCampana apiUrl={apiUrl} token={token} ficha={ficha} editar={editar} atender={atender} archivo={prioridad} alGuardar={setFicha} alFallar={setAviso} /> : null}
        {convierte && !ficha.proyecto ? (
          <div className="decisiones decisiones-ficha">
            <button type="button" className="primario" onClick={() => void correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/proyecto`, { method: 'POST', body: '{}' }), 'La tarea quedó en Proyectos.', 'Pasando a proyectos…').then((tarea) => { if (tarea) setFicha(tarea); })}>
              Pasar a proyectos
            </button>
          </div>
        ) : null}
        {ficha.proyecto ? <FrentesProyecto apiUrl={apiUrl} token={token} ficha={ficha} convierte={convierte} alGuardar={setFicha} alFallar={setAviso} /> : null}
        {convierte && (!ficha.cliente || !ficha.cita_fecha) ? <CompletarDetectado apiUrl={apiUrl} token={token} ficha={ficha} alGuardar={setFicha} alFallar={setAviso} /> : null}
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
          <Campo nombre="Código" valor={ficha.codigo_equipo ?? null} />
          <Campo nombre="Máquina" valor={ficha.maquina_equipo ?? null} />
          <Campo nombre="Asignación de despacho" valor={ficha.asignacion ? [ficha.asignacion.texto || 'Sin texto.', ficha.asignacion.autor_nombre, ficha.asignacion.confirmada_en ? cuando(ficha.asignacion.confirmada_en) : '', prioridad ? etiquetaValidacion(ficha.asignacion.validacion) : ''].filter(Boolean).join(' · ') : null} />
          <Campo nombre="Consulta a despacho" valor={ficha.asignacion?.consulta ?? null} />
        </dl>
        <Bitacora
          apiUrl={apiUrl}
          token={token}
          ficha={ficha}
          editar={editar}
          anotar={anotar}
          parte="acciones"
          alGuardar={(tarea) => {
            setFicha(tarea);
            void cargar().catch((error: unknown) => setAviso(texto(error)));
          }}
          alFallar={setAviso}
        />
        {!ficha.campana || (ficha.hilos ?? []).length > 0 ? (
          <HilosCotizacion
            apiUrl={apiUrl}
            token={token}
            tareaId={ficha.id}
            titulo={ficha.proyecto ? 'Seguimientos del proyecto' : ficha.campana ? 'Telemetrías de la cotización' : 'Telemetrías'}
            hilos={ficha.hilos ?? []}
            fabricaciones={ficha.fabricaciones ?? []}
            notas={ficha.notas ?? []}
            cantidad={ficha.cantidad}
            editar={atender}
            alGuardar={setFicha}
            alFallar={setAviso}
          />
        ) : null}
        <Bitacora
          apiUrl={apiUrl}
          token={token}
          ficha={ficha}
          editar={editar}
          anotar={anotar}
          parte="tiempo"
          alGuardar={(tarea) => {
            setFicha(tarea);
            void cargar().catch((error: unknown) => setAviso(texto(error)));
          }}
          alFallar={setAviso}
        />
        {prioridad && ficha.movimientos && ficha.movimientos.length > 0 ? (
          <ListaVerMas
            titulo="Movimientos de despacho y almacén"
            items={[...ficha.movimientos].sort((a, b) => b.creado_en.localeCompare(a.creado_en))}
            clave={(movimiento) => movimiento.id}
            render={(movimiento) => (
              <>
                <div className="bitacora-evento">
                  <time>{cuando(movimiento.creado_en)}</time>
                  <strong>{movimiento.actor}</strong>
                </div>
                <p>{movimiento.detalle}</p>
              </>
            )}
          />
        ) : null}
        {ficha.borrador ? (
          <div className="borrador-equipo">
            <p>
              Borrador de {ficha.borrador.autor_nombre}: código {ficha.borrador.codigo}, máquina {ficha.borrador.maquina || '—'}. La atención todavía no lo toma.
            </p>
            {editar ? (
              <div className="bitacora-acciones">
                <button type="button" className="primario" onClick={() => void decidirBorrador(true)}>
                  Confirmar código y máquina
                </button>
                <button type="button" onClick={() => void decidirBorrador(false)}>
                  Descartar borrador
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {editar ? <Correccion apiUrl={apiUrl} token={token} ficha={ficha} alGuardar={setFicha} alFallar={setAviso} /> : null}
        <Seguimiento seguimiento={ficha.seguimiento} parte="encargo" />
        <Fechas ficha={ficha} />
        <Situaciones situaciones={ficha.situaciones ?? []} />
        <Seguimiento seguimiento={ficha.seguimiento} parte="correos" />
        </>
        ) : null}
        {velo}
      </section>
      </TrabajoContext.Provider>
    );
  }

  return (
    <section className="ficha">
      <div className="herramientas">
        <h2>{proyectos ? 'Proyectos' : 'Tareas'}</h2>
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
        {sistema ? (
          <button type="button" className="primario" disabled={procesando} onClick={() => void procesarCorreos()}>
            {procesando ? 'Procesando…' : 'Procesar correos'}
          </button>
        ) : null}
      </div>
      {editar && !proyectos ? (
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
      ) : null}
      <p>{proyectos ? 'Una tarea pasa aquí cuando el administrador o el superusuario la convierte en proyecto. Puede quedar sin frentes o reunir telemetría, infraestructura de comunicaciones y pantalla HMI.' : textoSector(sector)}</p>
      {prioridad && sector !== 'otros' ? (
        <p className="meta">Marca las que verán el administrador, los técnicos y despacho. Las demás siguen abiertas y solo las ves tú, hasta que las marques o las cierres. Las cotizaciones nuevas del correo llegan marcadas. Si la cotización ya estaba resuelta, el correo queda en su historial y no vuelve a abiertas.</p>
      ) : habilita && sector === 'tareas' ? (
        <p className="meta">Ves las habilitadas y las que no. Marca las que verán el técnico y despacho.</p>
      ) : null}
      {sector === 'tareas' || proyectos ? (
        <div className="filtro-area">
          <button type="button" className={vista === 'abiertas' ? 'activo' : ''} onClick={() => { setVista('abiertas'); setPagina(1); }}>
            Abiertas
          </button>
          <button type="button" className={vista === 'resueltas' ? 'activo' : ''} onClick={() => { setVista('resueltas'); setPagina(1); }}>
            Resueltas
          </button>
        </div>
      ) : null}
      {sector === 'internos' ? (
        <div className="filtro-area">
          <button type="button" className={cola === 'por_atender' ? 'activo' : ''} onClick={() => { setCola('por_atender'); setPagina(1); }}>
            Por atender
          </button>
          <button type="button" className={cola === 'atendido' ? 'activo' : ''} onClick={() => { setCola('atendido'); setPagina(1); }}>
            Atendidos
          </button>
          <button type="button" className={cola === 'resuelto' ? 'activo' : ''} onClick={() => { setCola('resuelto'); setPagina(1); }}>
            Resueltos
          </button>
          <button type="button" className={cola === 'todas' ? 'activo' : ''} onClick={() => { setCola('todas'); setPagina(1); }}>
            Abiertos
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
      {(sector === 'tareas' || proyectos) ? (
        tareas.length === 0 ? (
          <p>{consulta ? 'No hay tareas con ese texto.' : proyectos ? 'Todavía no hay proyectos.' : editar ? 'Todavía no hay tareas.' : 'El superusuario todavía no habilitó tareas.'}</p>
        ) : (
          <ul className="lista">
            {tareas.map((tarea) => (
              <li key={tarea.id} className={!tarea.habilitada ? 'fila-marca solo-super' : 'fila-marca'}>
                {habilita ? (
                  <label className="marca-habil">
                    <input
                      type="checkbox"
                      checked={Boolean(tarea.habilitada)}
                      aria-label={`Habilitar COT ${cotVisible(tarea.cot, tarea.cots)} para el equipo`}
                      onChange={(evento) => void marcar('tarea', tarea.id, evento.target.checked)}
                    />
                  </label>
                ) : null}
                <button type="button" className="fila" onClick={() => void abrir(tarea.id).catch((error: unknown) => setAviso(texto(error)))}>
                  <span className="avatar" aria-hidden="true">
                    C
                  </span>
                  <span className="quien">{tarea.campana ? 'Campaña' : 'COT'} {cotVisible(tarea.cot, tarea.cots)}{proyectos ? ' · Proyecto' : ''}{!tarea.habilitada ? ' · Sin habilitar' : ''}</span>
                  <span className="resumen-fila">
                    <strong>{tarea.cliente || tarea.lugar || tarea.descripcion || 'Sin cliente'}</strong>
                    {tarea.campana ? <span className="extracto"> — {tarea.locales ?? 0} tiendas</span> : null}
                    {tarea.cliente && tarea.lugar ? <span className="extracto"> — {tarea.lugar}</span> : null}
                    <span className={`fecha-despacho ${marcaFecha(tarea.despacho_fecha)}`}>
                      {tarea.despacho_fecha ? cita(tarea.despacho_fecha, tarea.despacho_hora ?? null) : 'Sin fecha'}
                    </span>
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
        <p>{consulta ? 'No hay correos con ese texto.' : !prioridad && (sector === 'internos' || sector === 'pendiente') ? 'El superusuario todavía no habilitó elementos de esta lista.' : sector === 'internos' ? 'No hay asuntos internos en esta cola.' : 'No hay correos en este grupo.'}</p>
      ) : (
        <ul className="lista">
          {correos.map((correo) => (
            <li key={correo.id} className={sector === 'pendiente' || sector === 'otros' ? 'con-decision' : undefined}>
              <div className={prioridad && sector !== 'otros' && !correo.habilitada ? 'fila-marca solo-super' : 'fila-marca'}>
              {prioridad && sector !== 'otros' ? (
                <label className="marca-habil">
                  <input
                    type="checkbox"
                    checked={Boolean(correo.habilitada)}
                    aria-label={`Habilitar ${correo.asunto || 'este elemento'} para el equipo`}
                    onChange={(evento) => void marcar(sector === 'internos' ? 'interno' : 'decision', correo.id, evento.target.checked)}
                  />
                </label>
              ) : null}
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
                  {sector === 'internos' ? <span className="areas-correo"><span>{correo.atencion === 'resuelto' ? 'Resuelto' : correo.atencion === 'atendido' ? 'Atendido' : 'Por atender'}</span></span> : null}
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
              </div>
              {sector === 'pendiente' && sistema ? (
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
      {velo}
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

export function PanelFechas({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [formas, setFormas] = useState<FormaFecha[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void pedir<{ formas: FormaFecha[] }>(apiUrl, token, '/fechas')
      .then((respuesta) => setFormas(respuesta.formas))
      .catch((fallo: unknown) => setError(texto(fallo)));
  }, [apiUrl, token]);

  async function procesar(hilo?: string) {
    if (!hilo && !window.confirm('Se vuelven a leer las fechas de todos los correos guardados. Puede tardar. ¿Sigo?')) return;
    setOcupado(true);
    setAviso(null);
    setError(null);
    try {
      const resultado = await pedir<{ correos: number; tareas: number; actualizadas: number; sinFecha: number; protegidas: number; tiendas: number }>(
        apiUrl,
        token,
        '/fechas/procesar',
        { method: 'POST', body: JSON.stringify(hilo ? { hilo } : {}) },
      );
      setAviso(`Leí ${resultado.correos} correos. ${resultado.actualizadas} tareas cambiaron de fecha, ${resultado.sinFecha} siguen sin fecha y ${resultado.protegidas} tienen una fecha corregida a mano. Tiendas releídas: ${resultado.tiendas}.`);
    } catch (fallo: unknown) {
      setError(texto(fallo));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ficha">
      <h2>Fechas</h2>
      <p>Estas son las formas que el sistema reconoce al leer una cita. Un campo corregido a mano no se vuelve a pisar.</p>
      {error ? <p className="error">{error}</p> : null}
      {aviso ? <p className="bajada">{aviso}</p> : null}
      <button type="button" className="primario" disabled={ocupado} onClick={() => void procesar()}>
        {ocupado ? 'Leyendo…' : 'Procesar todos los correos'}
      </button>
      <table className="odoo-lineas">
        <thead>
          <tr>
            <th>Forma</th>
            <th>Ejemplo</th>
            <th>Queda</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {formas.map((forma) => (
            <tr key={forma.nombre}>
              <td>{forma.nombre}</td>
              <td>{forma.ejemplo}</td>
              <td>{forma.reconocida ? forma.queda : 'No reconocida'}</td>
              <td>{forma.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FrentesProyecto({
  apiUrl,
  token,
  ficha,
  convierte,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  ficha: Tarea;
  convierte: boolean;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const correr = useTrabajo();
  const frentes = [
    { clase: 'telemetria', nombre: 'Telemetría' },
    { clase: 'infraestructura', nombre: 'Infraestructura de comunicaciones' },
    { clase: 'hmi', nombre: 'Pantalla HMI' },
  ] as const;
  async function abrir(clase: string, nombre: string) {
    const tarea = await correr(
      pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/frentes`, { method: 'POST', body: JSON.stringify({ clase }) }),
      `Quedó abierto el seguimiento de ${nombre}.`,
      'Abriendo el seguimiento…',
    );
    if (tarea) alGuardar(tarea);
  }
  return (
    <section>
      <h3>Frentes del proyecto</h3>
      <p>Puede quedar sin ninguno o reunir los tres. Telemetría es la instalación del equipo. Infraestructura es el cable de comunicación y de alimentación. La pantalla HMI muestra los parámetros y comanda las máquinas.</p>
      {convierte ? (
        <div className="decisiones decisiones-ficha">
          {frentes.map((frente) => (
            <button key={frente.clase} type="button" onClick={() => void abrir(frente.clase, frente.nombre).catch((error: unknown) => alFallar(texto(error)))}>
              Abrir {frente.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CompletarDetectado({
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
  const [cliente, setCliente] = useState(ficha.cliente ?? '');
  const [fecha, setFecha] = useState(ficha.cita_fecha ?? '');
  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    let tarea = ficha;
    if (!ficha.cliente && cliente.trim()) {
      tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/correccion`, {
        method: 'POST',
        body: JSON.stringify({ campo: 'cliente', valor: cliente.trim() }),
      });
    }
    if (!ficha.cita_fecha && fecha) {
      tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/correccion`, {
        method: 'POST',
        body: JSON.stringify({ campo: 'cita_fecha', valor: fecha }),
      });
    }
    alGuardar(tarea);
  }
  return (
    <form className="rango" onSubmit={(evento) => void guardar(evento).catch((error: unknown) => alFallar(texto(error)))}>
      <h3>Datos que el correo no trajo</h3>
      <p>El administrador y el superusuario pueden completar el cliente y la fecha aunque no se hayan detectado.</p>
      {!ficha.cliente ? (
        <>
          <label htmlFor="completar-cliente">Cliente</label>
          <input id="completar-cliente" value={cliente} onChange={(evento) => setCliente(evento.target.value)} />
        </>
      ) : null}
      {!ficha.cita_fecha ? (
        <>
          <label htmlFor="completar-fecha">Fecha</label>
          <input id="completar-fecha" type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
        </>
      ) : null}
      <button type="submit" className="primario">Guardar datos</button>
    </form>
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

const NOMBRES_FECHA = ['Fecha de la orden', 'Validez', 'Tiempo de entrega', 'Lugar de entrega', 'Inicio planeado', 'Fin planeado'];

function Fechas({ ficha }: { ficha: Tarea }) {
  const detectadas = [
    ...NOMBRES_FECHA.flatMap((nombre) => {
      const venta = ficha.odoo?.venta?.copia?.ficha?.find((campo) => campo.nombre === nombre);
      const ticket = ficha.odoo?.ticket?.copia?.ficha?.find((campo) => campo.nombre === nombre);
      return [
        venta ? { origen: 'Cotización', campo: nombre, valor: venta.valor } : null,
        ticket ? { origen: 'Servicio externo', campo: nombre, valor: ticket.valor } : null,
      ];
    }),
  ].filter((fila): fila is { origen: string; campo: string; valor: string } => fila !== null);
  const citaTarea = cita(ficha.cita_fecha, ficha.cita_hora);
  const citaParcial = cita(ficha.cita_parcial_fecha ?? null, ficha.cita_parcial_hora ?? null);
  const reprogramaciones = (ficha.situaciones ?? []).filter((situacion) => situacion.tipo === 'reprogramacion');
  const cambiosFecha = (ficha.odoo?.cambios ?? []).flatMap((cambio) =>
    cambio.detalle
      .filter((fila) => NOMBRES_FECHA.includes(fila.campo) && fila.antes)
      .map((fila) => ({ ...fila, cuando: cambio.creado_en, clase: cambio.clase })),
  );
  if (!citaTarea && !citaParcial && detectadas.length === 0 && reprogramaciones.length === 0 && cambiosFecha.length === 0) return null;
  return (
    <section>
      <h3>Fechas</h3>
      <ol className="linea-tiempo">
        {citaTarea ? (
          <li>
            <strong>Cita de la tarea</strong>
            <span>{[citaTarea, ficha.cita_direccion].filter(Boolean).join(' · ')}</span>
          </li>
        ) : null}
        {citaParcial ? (
          <li>
            <strong>También citada</strong>
            <span>{citaParcial}</span>
          </li>
        ) : null}
        {detectadas.map((fila) => (
          <li key={`${fila.origen}-${fila.campo}`}>
            <strong>{fila.origen} · {fila.campo}</strong>
            <span>{fila.valor}</span>
          </li>
        ))}
        {reprogramaciones.map((situacion, indice) => (
          <li key={`repro-${indice}`} className="nuestra">
            <time>{cuando(situacion.fecha)}</time>
            <strong>Reprogramación del correo</strong>
            <span>
              {situacion.cita_anterior
                ? `Antes: ${[situacion.cita_anterior.fecha, situacion.cita_anterior.hora, situacion.cita_anterior.direccion].filter(Boolean).join(' · ')}`
                : null}
            </span>
            <span>{situacion.resumen}</span>
          </li>
        ))}
        {cambiosFecha.map((fila, indice) => (
          <li key={`odoo-fecha-${indice}`} className="nuestra">
            <time>{cuando(fila.cuando)}</time>
            <strong>{fila.clase === 'ticket' ? 'Servicio externo' : 'Cotización'} · {fila.campo}</strong>
            <span>Antes: {fila.antes}</span>
            <span>Ahora: {fila.despues}</span>
          </li>
        ))}
      </ol>
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

function fechaOdoo(fecha: string): string {
  const normal = fecha.includes('T') ? fecha : fecha.replace(' ', 'T');
  const conZona = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normal) ? normal : `${normal}Z`;
  return Number.isNaN(new Date(conZona).getTime()) ? fecha : cuando(conZona);
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

function marcaFecha(fecha: string | null | undefined): 'pasada' | 'hoy' | 'proxima' | 'sin' {
  if (!fecha) return 'sin';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const dia = fecha.slice(0, 10);
  if (dia < hoy) return 'pasada';
  if (dia === hoy) return 'hoy';
  return 'proxima';
}

function cita(fecha: string | null, hora: string | null): string | null {
  if (!fecha && !hora) return null;
  const dia = fecha ? fecha.slice(0, 10).split('-').reverse().join('/') : '';
  return [dia, hora].filter(Boolean).join(' ');
}

function coincideTienda(tienda: TiendaCampana, consulta: string): boolean {
  return [tienda.cadena, tienda.nombre, tienda.direccion, tienda.contacto, tienda.celular, tienda.status, tienda.codigo_equipo, tienda.tamano].join(' ').toLowerCase().includes(consulta);
}

function TiendasCampana({
  apiUrl,
  token,
  ficha,
  editar,
  atender,
  archivo,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  ficha: Tarea;
  editar: boolean;
  atender: boolean;
  archivo: boolean;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const consulta = busqueda.trim().toLowerCase();
  const tiendas = ficha.tiendas ?? [];
  const activas = tiendas.filter((tienda) => !tienda.archivada);
  const archivadas = tiendas.filter((tienda) => tienda.archivada);
  const visibles = consulta ? activas.filter((tienda) => coincideTienda(tienda, consulta)) : activas;
  const archivadasVisibles = consulta ? archivadas.filter((tienda) => coincideTienda(tienda, consulta)) : archivadas;
  return (
    <section className="campana">
      <h3>Tiendas de la campaña</h3>
      <p>La campaña agrupa tiendas. Cada tienda queda plegada: ábrela para ver el detalle. Cada una se abre como una cotización y ahí se crean sus hilos, uno o varios, desde esta ficha o por WhatsApp.</p>
      {editar ? <FormasTienda apiUrl={apiUrl} token={token} tareaId={ficha.id} archivo={archivo} alGuardar={alGuardar} alFallar={alFallar} /> : null}
      {archivo ? <AltaTienda apiUrl={apiUrl} token={token} tareaId={ficha.id} alGuardar={alGuardar} alFallar={alFallar} /> : null}
      {activas.length === 0 ? <p>Todavía no hay tiendas activas en esta cotización.</p> : null}
      {activas.length > 0 || archivadas.length > 0 ? (
        <form className="buscar buscar-tareas" onSubmit={(evento) => evento.preventDefault()}>
          <label className="sr" htmlFor="buscar-tienda">Buscar tienda</label>
          <input id="buscar-tienda" value={busqueda} placeholder="Cadena, tienda, dirección o telemetría" onChange={(evento) => setBusqueda(evento.target.value)} />
        </form>
      ) : null}
      {activas.length > 0 ? <p>{visibles.length} de {activas.length} tiendas</p> : null}
      {activas.length > 0 && visibles.length === 0 ? <p>No hay tiendas con ese texto.</p> : null}
      <ul className="tiendas">
        {visibles.map((tienda) => (
          <TarjetaTienda key={tienda.id} apiUrl={apiUrl} token={token} tareaId={ficha.id} tienda={tienda} editar={editar} atender={atender} archivo={archivo} expandir={consulta.length > 0 && visibles.length === 1} alGuardar={alGuardar} alFallar={alFallar} />
        ))}
      </ul>
      {archivo && archivadasVisibles.length > 0 ? (
        <details className="formas-tienda">
          <summary>Archivadas ({archivadasVisibles.length})</summary>
          <ul className="tiendas">
            {archivadasVisibles.map((tienda) => (
              <li key={tienda.id}>
                <strong>{[tienda.cadena, tienda.nombre].filter(Boolean).join(' · ')}</strong>
                <button
                  type="button"
                  onClick={() => {
                    void pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/tiendas/${tienda.id}/archivar`, { method: 'POST', body: JSON.stringify({ archivada: false }) })
                      .then(alGuardar)
                      .catch((error: unknown) => alFallar(texto(error)));
                  }}
                >
                  Devolver a la campaña
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function AltaTienda({
  apiUrl,
  token,
  tareaId,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [cadena, setCadena] = useState('');
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [celular, setCelular] = useState('');
  const [fecha, setFecha] = useState('');
  const [direccion, setDireccion] = useState('');
  async function crear(evento: FormEvent) {
    evento.preventDefault();
    const tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas`, {
      method: 'POST',
      body: JSON.stringify({ cadena, nombre, contacto, celular, entregaFecha: fecha, direccion }),
    });
    setCadena('');
    setNombre('');
    setContacto('');
    setCelular('');
    setFecha('');
    setDireccion('');
    setAbierta(false);
    alGuardar(tarea);
  }
  return (
    <div className="formas-tienda">
      <button type="button" onClick={() => setAbierta((actual) => !actual)}>{abierta ? 'Ocultar nueva tienda' : 'Nueva tienda'}</button>
      {abierta ? (
        <form className="forma-tienda" onSubmit={(evento) => void crear(evento).catch((error: unknown) => alFallar(texto(error)))}>
          <p>Para una tienda que el correo no detectó. Solo el superusuario la crea.</p>
          <label htmlFor="tienda-cadena">Cadena</label>
          <input id="tienda-cadena" value={cadena} onChange={(evento) => setCadena(evento.target.value)} />
          <label htmlFor="tienda-nombre">Tienda</label>
          <input id="tienda-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} required />
          <label htmlFor="tienda-contacto">Contacto</label>
          <input id="tienda-contacto" value={contacto} onChange={(evento) => setContacto(evento.target.value)} />
          <label htmlFor="tienda-celular">Celular</label>
          <input id="tienda-celular" value={celular} onChange={(evento) => setCelular(evento.target.value)} />
          <label htmlFor="tienda-fecha">Fecha</label>
          <input id="tienda-fecha" type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
          <label htmlFor="tienda-direccion">Dirección</label>
          <input id="tienda-direccion" value={direccion} onChange={(evento) => setDireccion(evento.target.value)} />
          <button type="submit" className="primario">Crear tienda</button>
        </form>
      ) : null}
    </div>
  );
}

function FormasTienda({
  apiUrl,
  token,
  tareaId,
  archivo,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  archivo: boolean;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const [plantillas, setPlantillas] = useState<PlantillaTienda[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState('');
  const [columnas, setColumnas] = useState<ColumnaTienda[]>([
    { alias: 'cadena', campo: 'cadena' },
    { alias: 'tienda', campo: 'tienda' },
  ]);

  async function cargar() {
    setPlantillas(await pedir<PlantillaTienda[]>(apiUrl, token, '/campana/plantillas'));
  }

  useEffect(() => {
    if (!abierta) return;
    void cargar().catch((error: unknown) => alFallar(texto(error)));
  }, [abierta, apiUrl, token]);

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    await pedir(apiUrl, token, '/campana/plantillas', { method: 'POST', body: JSON.stringify({ nombre, columnas }) });
    setNombre('');
    await cargar();
  }

  async function guardar(plantilla: PlantillaTienda, cambio: Partial<PlantillaTienda>) {
    await pedir(apiUrl, token, `/campana/plantillas/${plantilla.id}`, {
      method: 'POST',
      body: JSON.stringify(cambio),
    });
    await cargar();
  }

  return (
    <div className="formas-tienda">
      <button type="button" onClick={() => setAbierta((actual) => !actual)}>
        {abierta ? 'Ocultar formas de tienda' : 'Formas de tienda'}
      </button>
      <button
        type="button"
        onClick={() => {
          void pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas/releer`, { method: 'POST', body: '{}' })
            .then(alGuardar)
            .catch((error: unknown) => alFallar(texto(error)));
        }}
      >
        Volver a leer las tiendas
      </button>
      {archivo ? (
        <button
          type="button"
          onClick={() => {
            if (!window.confirm('Quita las tiendas que no salen del cronograma. Las que ya tienen hilo se quedan.')) return;
            void pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas/reordenar`, { method: 'POST', body: '{}' })
              .then(alGuardar)
              .catch((error: unknown) => alFallar(texto(error)));
          }}
        >
          Reordenar
        </button>
      ) : null}
      {abierta ? (
        <>
          <p>Cada forma dice cómo vienen las columnas del cronograma. Al leer los correos se usa la forma activa que reconozca más tiendas.</p>
          {plantillas.map((plantilla) => (
            <form
              key={plantilla.id}
              className="forma-tienda"
              onSubmit={(evento) => {
                evento.preventDefault();
                const datos = new FormData(evento.currentTarget);
                const leidas = plantilla.columnas.map((columna, indice) => ({
                  alias: String(datos.get(`alias-${indice}`) ?? ''),
                  campo: String(datos.get(`campo-${indice}`) ?? columna.campo),
                }));
                void guardar(plantilla, { nombre: String(datos.get('nombre') ?? plantilla.nombre), columnas: leidas }).catch((error: unknown) => alFallar(texto(error)));
              }}
            >
              <input name="nombre" defaultValue={plantilla.nombre} aria-label="Nombre de la forma" />
              <button type="button" className={plantilla.activa ? 'sync-auto activa' : 'sync-auto'} onClick={() => void guardar(plantilla, { activa: !plantilla.activa }).catch((error: unknown) => alFallar(texto(error)))}>
                {plantilla.activa ? 'Activa' : 'Inactiva'}
              </button>
              <ul>
                {plantilla.columnas.map((columna, indice) => (
                  <li key={`${plantilla.id}-${indice}`}>
                    <input name={`alias-${indice}`} defaultValue={columna.alias} aria-label="Alias de la columna" />
                    <select name={`campo-${indice}`} defaultValue={columna.campo} aria-label="Dato de la tienda">
                      {CAMPOS_TIENDA.map(([campo, etiqueta]) => (
                        <option key={campo} value={campo}>{etiqueta}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              <button type="submit">Guardar forma</button>
            </form>
          ))}
          <form className="forma-tienda" onSubmit={(evento) => void crear(evento).catch((error: unknown) => alFallar(texto(error)))}>
            <h4>Nueva forma</h4>
            <label htmlFor="forma-nombre">Nombre</label>
            <input id="forma-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} required />
            <ul>
              {columnas.map((columna, indice) => (
                <li key={indice}>
                  <input value={columna.alias} aria-label="Alias de la columna" onChange={(evento) => setColumnas((actual) => actual.map((item, posicion) => posicion === indice ? { ...item, alias: evento.target.value } : item))} />
                  <select value={columna.campo} aria-label="Dato de la tienda" onChange={(evento) => setColumnas((actual) => actual.map((item, posicion) => posicion === indice ? { ...item, campo: evento.target.value } : item))}>
                    {CAMPOS_TIENDA.map(([campo, etiqueta]) => (
                      <option key={campo} value={campo}>{etiqueta}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setColumnas((actual) => [...actual, { alias: '', campo: 'status' }])}
            >
              Agregar columna
            </button>
            <button type="submit" className="primario">Crear forma</button>
          </form>
        </>
      ) : null}
    </div>
  );
}

const CLAVE_TIENDAS = 'sgit-tiendas-abiertas';

function tiendasVistas(): Set<string> {
  try {
    const raw = sessionStorage.getItem(CLAVE_TIENDAS);
    const lista = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function guardarTiendaVista(clave: string, abierta: boolean) {
  const vistas = tiendasVistas();
  if (abierta) vistas.add(clave);
  else vistas.delete(clave);
  try {
    sessionStorage.setItem(CLAVE_TIENDAS, JSON.stringify([...vistas]));
  } catch {
    /* la sesión del navegador no dejó guardar la tienda abierta */
  }
}

function etiquetaTienda(estado: string): string {
  if (estado === 'resuelta') return 'Realizada';
  if (estado === 'atendida') return 'Atendida';
  if (estado === 'en_seguimiento') return 'En seguimiento';
  return 'Pendiente';
}

function TarjetaTienda({
  apiUrl,
  token,
  tareaId,
  tienda,
  editar,
  atender,
  archivo,
  expandir,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  tienda: TiendaCampana;
  editar: boolean;
  atender: boolean;
  archivo: boolean;
  expandir: boolean;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (aviso: string) => void;
}) {
  const correr = useTrabajo();
  const claveVista = `${tareaId}:${tienda.id}`;
  const [nota, setNota] = useState('');
  const [codigo, setCodigo] = useState(tienda.codigo_equipo ?? '');
  const [hija, setHija] = useState<Tarea | null>(null);
  const [abierta, setAbierta] = useState(() => tiendasVistas().has(claveVista));
  const [detalle, setDetalle] = useState(() => tiendasVistas().has(claveVista));
  const hijaId = useRef<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [revision, setRevision] = useState(0);
  const entrega = [tienda.entrega_fecha ? tienda.entrega_fecha.slice(0, 10).split('-').reverse().join('/') : '', tienda.entrega_hora].filter(Boolean).join(' ');
  const hilos = hija?.hilos?.length ?? tienda.hilos ?? 0;
  const notasTienda = [...(tienda.notas ?? [])].sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  hijaId.current = hija?.id ?? tienda.tarea_hija_id ?? null;

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    setAbriendo(true);
    void (async () => {
      try {
        let id = hijaId.current;
        if (!id) {
          const respuesta = await pedir<{ tareaId: string }>(apiUrl, token, `/tareas/${tareaId}/tiendas/${tienda.id}/abrir`, { method: 'POST', body: '{}' });
          id = respuesta.tareaId;
          hijaId.current = id;
        }
        const tarea = await pedir<Tarea>(apiUrl, token, `/tareas/${id}`);
        if (vivo) setHija(tarea);
      } catch (error: unknown) {
        if (vivo) alFallar(texto(error));
      } finally {
        if (vivo) setAbriendo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [abierta, revision, apiUrl, token, tareaId, tienda.id]);

  useEffect(() => {
    if (expandir) setDetalle(true);
  }, [expandir]);

  function abrirTienda() {
    guardarTiendaVista(claveVista, true);
    setAbierta(true);
    setRevision((valor) => valor + 1);
  }

  function cerrarTienda() {
    guardarTiendaVista(claveVista, false);
    setAbierta(false);
    setHija(null);
    hijaId.current = null;
  }

  return (
    <li className={tienda.estado === 'resuelta' ? 'tienda-lista' : ''}>
      <header>
        <button type="button" className="tienda-cabeza" aria-expanded={detalle} onClick={() => setDetalle((actual) => !actual)}>
          <strong>{[tienda.cadena, tienda.nombre].filter(Boolean).join(' · ')}</strong>
          <span>{etiquetaTienda(tienda.estado)}{hilos > 0 ? ` · ${hilos} hilo${hilos === 1 ? '' : 's'}` : ''} · {detalle ? 'Ocultar' : 'Ver'}</span>
        </button>
        {archivo ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('La tienda sale de la campaña. El correo no la vuelve a abrir.')) return;
              void pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas/${tienda.id}/archivar`, { method: 'POST', body: JSON.stringify({ archivada: true }) })
                .then(alGuardar)
                .catch((error: unknown) => alFallar(texto(error)));
            }}
          >
            Archivar
          </button>
        ) : null}
      </header>
      {detalle ? (
      <>
      <dl>
        <Campo nombre="Contacto" valor={tienda.contacto || null} />
        <Campo nombre="Celular" valor={tienda.celular || null} />
        <Campo nombre="Entrega" valor={entrega || null} />
        <Campo nombre="Status" valor={tienda.status || null} />
        <Campo nombre="Tamaño" valor={tienda.tamano || null} />
        <Campo nombre="Dirección" valor={tienda.direccion || null} />
        <Campo nombre="Mapa" valor={tienda.mapa || null} enlace />
        <Campo nombre="Servicio externo" valor={[tienda.odoo_nombre, tienda.odoo_estado].filter(Boolean).join(' · ') || null} />
        <Campo nombre="Telemetría" valor={tienda.codigo_equipo} />
      </dl>
      {notasTienda.length > 0 ? (
        <ListaVerMas
          titulo="Seguimientos"
          items={notasTienda}
          clave={(item) => item.id}
          claseItem={(item) => item.tipo}
          render={(item) => (
            <>
              <div className="bitacora-evento">
                <time>{cuando(item.creado_en)}</time>
                <strong>{item.tipo === 'incidente' ? 'Incidente' : 'Seguimiento'}</strong>
                <span>{item.autor_nombre}</span>
              </div>
              <p>{item.texto}</p>
            </>
          )}
        />
      ) : null}
      {atender && tienda.estado !== 'resuelta' ? (
        <form
          className="cuenta-alta"
          onSubmit={(evento) => {
            evento.preventDefault();
            void correr(
              pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/notas`, {
                method: 'POST',
                body: JSON.stringify({ tipo: 'seguimiento', texto: nota, tiendaId: tienda.id }),
              }),
              'El seguimiento quedó guardado.',
            ).then((guardada) => {
              if (!guardada) return;
              setNota('');
              alGuardar(guardada);
            });
          }}
        >
          <label>
            Seguimiento o incidente
            <input value={nota} onChange={(evento) => setNota(evento.target.value)} />
          </label>
          <div className="bitacora-acciones">
            <button type="submit">Anotar seguimiento</button>
            {editar && (tienda.estado === 'pendiente' || tienda.estado === 'en_seguimiento') ? (
              <button
                type="button"
                onClick={() => {
                  void correr(pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas/${tienda.id}/atender`, { method: 'POST' }), 'La tienda quedó atendida.').then((tarea) => {
                    if (tarea) alGuardar(tarea);
                  });
                }}
              >
                Marcar atendida
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void correr(
                  pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/notas`, {
                    method: 'POST',
                    body: JSON.stringify({ tipo: 'incidente', texto: nota, tiendaId: tienda.id }),
                  }),
                  'El incidente quedó guardado.',
                ).then((guardada) => {
                  if (!guardada) return;
                  setNota('');
                  alGuardar(guardada);
                });
              }}
            >
              Anotar incidente
            </button>
          </div>
          {editar ? (
            <>
          <label>
            Código de telemetría
            <input value={codigo} onChange={(evento) => setCodigo(evento.target.value)} />
          </label>
          <button
            type="button"
            className="primario"
            onClick={() => {
              void correr(
                pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/tiendas/${tienda.id}/realizar`, {
                  method: 'POST',
                  body: JSON.stringify({ codigo }),
                }),
                'La tienda quedó realizada.',
              ).then((tarea) => {
                if (tarea) alGuardar(tarea);
              });
            }}
          >
            Marcar tienda realizada
          </button>
            </>
          ) : null}
        </form>
      ) : null}
      <div className="tienda-abrir">
        <button type="button" className="primario" disabled={abriendo} onClick={abrirTienda}>
          {abierta && hija ? 'Actualizar tienda' : abriendo ? 'Abriendo…' : 'Abrir tienda'}
        </button>
        {abierta ? (
          <button type="button" className="secundario" onClick={cerrarTienda}>
            Cerrar tienda
          </button>
        ) : null}
      </div>
      {abierta && hija ? (
        <div className="tienda-ficha">
          <h4>Datos de la tienda</h4>
          <dl>
            <Campo nombre="Ticket" valor={hija.ticket} />
            <Campo nombre="Cliente" valor={hija.cliente} />
            <Campo nombre="Lugar" valor={hija.lugar} />
            <Campo nombre="Cita" valor={cita(hija.cita_fecha, hija.cita_hora)} />
            <Campo nombre="Dirección" valor={direccionLimpia(hija.cita_direccion)} />
            <Campo nombre="Mapa" valor={hija.cita_mapa} enlace />
            <Campo nombre="Telemetrías" valor={hija.cantidad === null ? null : String(hija.cantidad)} />
            <Campo nombre="Contacto" valor={[hija.comercial_nombre, hija.comercial_telefono].filter(Boolean).join(' · ') || null} />
          </dl>
          <HilosCotizacion
            apiUrl={apiUrl}
            token={token}
            tareaId={hija.id}
            titulo="Telemetrías"
            hilos={hija.hilos ?? []}
            fabricaciones={hija.fabricaciones ?? []}
            notas={hija.notas ?? []}
            cantidad={hija.cantidad}
            editar={atender}
            alGuardar={setHija}
            alFallar={alFallar}
          />
        </div>
      ) : null}
      </>
      ) : null}
    </li>
  );
}

function HojaOdoo({
  ficha,
  editar,
  onActualizar,
  elegir,
}: {
  ficha: Tarea;
  editar: boolean;
  onActualizar: () => void;
  elegir: (clase: 'venta' | 'ticket', odooId: number) => void;
}) {
  return (
    <div className="odoo-hojas">
      <DocumentoOdoo titulo="Cotización" lectura={ficha.odoo?.venta} elegir={editar && !ficha.campana ? (id) => elegir('venta', id) : null} />
      {ficha.campana ? (
        <article className="odoo-hoja">
          <header className="odoo-cabeza">
            <p className="odoo-kicker">Servicios externos</p>
            <h3>{(ficha.servicios ?? []).length} servicios de la campaña</h3>
          </header>
          <ul className="tiendas">
            {(ficha.servicios ?? []).map((servicio) => (
              <li key={servicio.odoo_id}>
                {servicio.nombre || servicio.odoo_id}
                {servicio.estado ? ` · ${servicio.estado}` : ''}
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <DocumentoOdoo titulo="Servicio externo" lectura={ficha.odoo?.ticket} elegir={editar ? (id) => elegir('ticket', id) : null} />
      )}
      <CambiosOdoo cambios={ficha.odoo?.cambios ?? []} />
      {editar ? (
        <button type="button" onClick={onActualizar}>
          Actualizar desde Odoo
        </button>
      ) : null}
    </div>
  );
}

function CambiosOdoo({ cambios }: { cambios: CambioOdoo[] }) {
  return (
    <section>
      <h3>Cambios y evolución</h3>
      {cambios.length === 0 ? <p className="meta">Todavía no hay una evolución guardada.</p> : null}
      <ol className="linea-tiempo">
        {cambios.map((cambio, indice) => (
          <li key={`${cambio.creado_en}-${indice}`}>
            <time>{cuando(cambio.creado_en)}</time>
            <strong>{cambio.clase === 'ticket' ? 'Servicio externo' : 'Cotización'}</strong>
            <span>{cambio.texto}</span>
            {cambio.detalle.filter((fila) => fila.antes).map((fila) => (
              <span key={fila.campo}>{fila.campo}: {fila.antes} → {fila.despues}</span>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DocumentoOdoo({ titulo, lectura, elegir }: { titulo: string; lectura: VistaOdoo | undefined; elegir: ((id: number) => void) | null }) {
  const copia = lectura?.copia;
  const ficha = copia?.ficha ?? [];
  const pasos = copia?.pasos ?? [];
  return (
    <article className="odoo-hoja">
      <header className="odoo-cabeza">
        <p className="odoo-kicker">{titulo}</p>
        <h3>{copia?.nombre || titulo}</h3>
        {pasos.length > 0 ? (
          <div className="odoo-pasos">
            {pasos.map((paso) => (
              <span key={paso} className={presentarFecha(paso) === presentarFecha(copia?.paso ?? '') ? 'actual' : ''}>
                {presentarFecha(paso)}
              </span>
            ))}
            {copia?.cinta ? <strong className="odoo-cinta">{presentarFecha(copia.cinta)}</strong> : null}
          </div>
        ) : copia?.estado ? (
          <p className="odoo-etapa">{presentarFecha(copia.estado)}</p>
        ) : null}
      </header>
      {lectura?.aviso ? <p className={copia ? 'bajada' : 'error'}>{lectura.aviso}</p> : null}
      {lectura?.vinculo === 'sin_vinculo' && !copia ? <p>Sin vínculo en Odoo.</p> : null}
      {lectura?.vinculo === 'ambiguo' && elegir ? (
        <div className="bitacora-acciones">
          {lectura.candidatos.map((candidato) => (
            <button key={candidato.id} type="button" onClick={() => elegir(candidato.id)}>
              Elegir {candidato.nombre || candidato.id}
              {candidato.estado ? ` · ${candidato.estado}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      {copia ? (
        <div className="odoo-cuerpo">
          <div className="odoo-formulario">
            <dl>
              {ficha.filter((campo) => campo.lado === 'izq').map((campo) => (
                <Campo key={campo.nombre} nombre={campo.nombre} valor={presentarFecha(campo.valor)} />
              ))}
            </dl>
            <dl>
              {ficha.filter((campo) => campo.lado === 'der').map((campo) => (
                <Campo key={campo.nombre} nombre={campo.nombre} valor={presentarFecha(campo.valor)} />
              ))}
            </dl>
            {copia.nota ? <p className="odoo-nota">{copia.nota}</p> : null}
            {copia.lineas.length > 0 ? (
              <table className="odoo-lineas">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Equipo</th>
                    <th>Cantidad</th>
                    <th>Entregado</th>
                    <th>Facturado</th>
                    <th>Precio</th>
                    <th>Desc.</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {copia.lineas.map((linea, indice) => (
                    <tr key={`${linea.producto}-${indice}`}>
                      <td>
                        <strong>{linea.producto}</strong>
                        {linea.nombre ? <span>{linea.nombre}</span> : null}
                      </td>
                      <td>{linea.tipo}</td>
                      <td>{linea.equipo}</td>
                      <td>{linea.cantidad ?? ''}</td>
                      <td>{linea.entregada ?? ''}</td>
                      <td>{linea.facturada ?? ''}</td>
                      <td>{linea.precio}</td>
                      <td>{linea.descuento}</td>
                      <td>{linea.importe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {copia.total ? <p className="odoo-total">Total {copia.total}</p> : null}
            {lectura?.leido_en ? <p className="meta">Leído {cuando(lectura.leido_en)}</p> : null}
          </div>
          <aside className="odoo-chatter">
            <h4>Notas</h4>
            {copia.notas.length === 0 ? <p className="meta">Sin notas.</p> : null}
            <ol>
              {copia.notas.map((nota, indice) => (
                <li key={`${nota.fecha}-${indice}`}>
                  <div>
                    <strong>{nota.autor || 'Odoo'}</strong>
                    <time>{nota.fecha ? fechaOdoo(nota.fecha) : ''}</time>
                  </div>
                  <p>{nota.texto}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      ) : null}
    </article>
  );
}

function presentarFecha(valor: string): string {
  const conocido = EN_ESPANOL[valor];
  if (conocido) return conocido;
  return /^\d{4}-\d{2}-\d{2}/.test(valor) ? fechaOdoo(valor) : valor;
}

const EN_ESPANOL: Record<string, string> = {
  'Quotation': 'Cotización',
  'Quotation Sent': 'Cotización enviada',
  'Sales Order': 'Orden de venta',
  Locked: 'Bloqueado',
  Cancelled: 'Cancelado',
  'Nothing to Invoice': 'Nada que facturar',
  'To Invoice': 'Por facturar',
  'Fully Invoiced': 'Facturado',
  'Upselling Opportunity': 'Oportunidad de venta adicional',
  'Not Delivered': 'Sin entrega',
  Started: 'Entrega iniciada',
  'Partially Delivered': 'Entrega parcial',
  'Fully Delivered': 'Entregado',
};

function etiquetaValidacion(validacion: string | null | undefined): string {
  if (validacion === 'validada') return 'El técnico validó las lecturas.';
  if (validacion === 'sin_validar') return 'Quedó registrado sin validar.';
  if (validacion === 'pendiente') return 'Espera que el técnico corrobore.';
  return '';
}

function etiquetaEstado(estado: string): string {
  if (estado === 'detectada') return 'Detectada';
  if (estado === 'en_seguimiento') return 'En seguimiento';
  if (estado === 'en_validacion') return 'En validación';
  if (estado === 'informativa') return 'Informativa';
  if (estado === 'resuelta') return 'Resuelta';
  return estado;
}

function HilosCotizacion({
  apiUrl,
  token,
  tareaId,
  titulo = 'Telemetrías',
  hilos,
  fabricaciones,
  notas,
  cantidad,
  editar,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  titulo?: string;
  hilos: HiloFicha[];
  fabricaciones: Array<{ hiloId: string; orden: string; estado: string; enlace: string; ejecutor: string }>;
  notas: NotaBitacora[];
  cantidad: number | null;
  editar: boolean;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const correr = useTrabajo();
  const [numero, setNumero] = useState(String(hilos.length || cantidad || ''));
  const [reporte, setReporte] = useState('');
  const [imprimiendo, setImprimiendo] = useState(false);
  return (
    <section>
      <h3>{titulo}</h3>
      <p>
        {cantidad ? `La cotización trae ${cantidad}. ` : 'Indica cuántas telemetrías son. '}
        {hilos.length === 0
          ? editar
            ? 'Escribe el número y ábrelos aquí. También se puede hacer por WhatsApp.'
            : 'Quien edita la tarea abre los hilos aquí. También se puede hacer por WhatsApp.'
          : `${hilos.length} hilo${hilos.length === 1 ? '' : 's'}.`}
      </p>
      {editar ? (
        <form
          className="cantidad-hilos"
          onSubmit={(evento) => {
            evento.preventDefault();
            void correr(pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/hilos`, { method: 'POST', body: JSON.stringify({ cantidad: Number(numero) }) }), 'Los hilos quedaron guardados.').then((tarea) => {
              if (tarea) alGuardar(tarea);
            });
          }}
        >
          <label htmlFor={`cantidad-hilos-${tareaId}`}>Cantidad de hilos</label>
          <input id={`cantidad-hilos-${tareaId}`} value={numero} onChange={(evento) => setNumero(evento.target.value)} inputMode="numeric" />
          <button type="submit">{hilos.length === 0 ? 'Abrir hilos' : 'Guardar cantidad'}</button>
        </form>
      ) : null}
      {hilos.length > 0 ? (
        <ol className="bitacora-tiempo">
          {hilos.map((hilo) => {
            const falta = [
              hilo.despacho_validado ? '' : 'falta validar despacho',
              hilo.lleva_telemetria == null ? 'falta decir si se instala' : '',
              hilo.lleva_telemetria && hilo.chip_estado === 'ocupado' ? 'el chip está ocupado; pide otro o regulariza la foto' : '',
              hilo.lleva_telemetria && hilo.chip_estado !== 'ocupado' && !hilo.chip_celular ? 'falta el chip' : '',
            ].filter(Boolean);
            return (
              <li key={hilo.id}>
                <div className="bitacora-evento">
                  <strong>Hilo {hilo.orden}{hilo.clase === 'infraestructura' ? ' · Infraestructura' : hilo.clase === 'hmi' ? ' · Pantalla HMI' : hilo.clase === 'telemetria' ? ' · Telemetría' : ''}</strong>
                  <span>{hilo.estado === 'listo' ? 'Listo para la orden de fabricación' : falta.join(' · ')}</span>
                </div>
                <p>
                  {[
                    hilo.contenedor ? `Contenedor ${hilo.contenedor}` : 'Sin contenedor',
                    hilo.maquina ? `Máquina ${hilo.maquina}` : 'Sin máquina',
                    hilo.lleva_telemetria === false
                      ? 'Sin instalación'
                      : hilo.chip_estado === 'ocupado'
                        ? `Chip ocupado ${hilo.chip_celular ?? ''}`
                        : hilo.chip_celular
                          ? `Chip ${hilo.chip_celular}`
                          : 'Chip sin pedir',
                    hilo.chip_imei ? `IMEI chip ${hilo.chip_imei}` : '',
                    hilo.modem_serie || hilo.modem_imei
                      ? `Módulo 4G${hilo.modem_serie ? ` SN ${hilo.modem_serie}` : ''}${hilo.modem_imei ? ` · IMEI ${hilo.modem_imei}` : ''}`
                      : 'Módulo 4G pendiente',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {hilo.despacho_texto ? <p>{hilo.despacho_texto}</p> : null}
                {fabricaciones.filter((item) => item.hiloId === hilo.id).map((item) => (
                  <p key={item.enlace}>Orden {item.orden || 'sin número'} · {item.estado} · {item.ejecutor}.</p>
                ))}
                {editar && hilo.clase !== 'infraestructura' && hilo.clase !== 'hmi' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const abierta = fabricaciones.find((item) => item.hiloId === hilo.id);
                      if (abierta?.enlace) {
                        window.open(abierta.enlace, '_blank', 'noopener');
                        return;
                      }
                      void correr(pedir<Tarea & { enlaceInsumos?: string }>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}/insumos`, { method: 'POST', body: '{}' }), 'Los insumos quedaron pedidos.', 'Pidiendo insumos…').then((tarea) => {
                        if (!tarea) return;
                        alGuardar(tarea);
                        if (tarea.enlaceInsumos) window.open(tarea.enlaceInsumos, '_blank', 'noopener');
                      });
                    }}
                  >
                    {fabricaciones.some((item) => item.hiloId === hilo.id) ? 'Abrir materiales' : 'Pedir insumos'}
                  </button>
                ) : null}
                {editar && fabricaciones.some((item) => item.hiloId === hilo.id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReporte('');
                      void correr(pedir<{ texto: string }>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}/reporte`, { method: 'POST', body: '{}' }), 'El reporte quedó pedido.', 'Pidiendo el reporte…').then((respuesta) => {
                        if (respuesta) setReporte(respuesta.texto);
                      });
                    }}
                  >
                    Pedir reporte
                  </button>
                ) : null}
                {editar && fabricaciones.some((item) => item.hiloId === hilo.id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('¿Confirmar la orden de fabricación? Los materiales marcados quedan como consumidos.')) return;
                      setReporte('');
                      void correr(pedir<Tarea & { mensaje?: string }>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}/accion`, { method: 'POST', body: JSON.stringify({ accion: 'confirmar-orden' }) }), 'La orden quedó confirmada.', 'Confirmando la orden…').then((tarea) => {
                        if (!tarea) return;
                        setReporte(tarea.mensaje ?? 'La orden quedó confirmada.');
                        alGuardar(tarea);
                      });
                    }}
                  >
                    Confirmar orden
                  </button>
                ) : null}
                {editar && fabricaciones.some((item) => item.hiloId === hilo.id) ? (
                  <button
                    type="button"
                    disabled={imprimiendo}
                    onClick={() => {
                      setImprimiendo(true);
                      setReporte('');
                      void correr(pedir<{ texto: string }>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}/imprimir`, { method: 'POST', body: '{}' }), 'La orden se envió a imprimir.', 'Enviando a imprimir…')
                        .then((respuesta) => {
                          if (respuesta) setReporte(respuesta.texto);
                        })
                        .finally(() => setImprimiendo(false));
                    }}
                  >
                    Imprimir orden
                  </button>
                ) : null}
                {editar ? (
                  <CorregirHilo
                    apiUrl={apiUrl}
                    token={token}
                    tareaId={tareaId}
                    hilo={hilo}
                    notas={notas}
                    alGuardar={alGuardar}
                    alFallar={alFallar}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {reporte ? <p>{reporte}</p> : null}
    </section>
  );
}

const MOTIVOS_SIN_INSTALAR = [
  'La máquina es Carrier o Daikin.',
  'Control interno. Se priorizan los pedidos regulares.',
  'No hay stock de telemetría o de chip.',
];

function leerFotos(lista: FileList): Promise<Array<{ nombre: string; mime: string; contenido: string }>> {
  return Promise.all(
    [...lista].slice(0, 8).map(
      (archivo) =>
        new Promise<{ nombre: string; mime: string; contenido: string }>((resolver, rechazar) => {
          const lector = new FileReader();
          lector.onload = () => resolver({ nombre: archivo.name, mime: archivo.type || 'image/jpeg', contenido: String(lector.result).split(',')[1] ?? '' });
          lector.onerror = () => rechazar(new Error('No pude leer la foto.'));
          lector.readAsDataURL(archivo);
        }),
    ),
  );
}

function CorregirHilo({
  apiUrl,
  token,
  tareaId,
  hilo,
  notas,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  hilo: HiloFicha;
  notas: NotaBitacora[];
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const [contenedor, setContenedor] = useState(hilo.contenedor ?? '');
  const [maquina, setMaquina] = useState(hilo.maquina ?? '');
  const [celularAlmacen, setCelularAlmacen] = useState(hilo.chip_celular ?? '');
  const [modemImeiAlmacen, setModemImeiAlmacen] = useState(hilo.modem_imei ?? '');
  const [modemSerieAlmacen, setModemSerieAlmacen] = useState(hilo.modem_serie ?? '');
  const [celularTecnico, setCelularTecnico] = useState(hilo.chip_celular ?? '');
  const [modemImeiTecnico, setModemImeiTecnico] = useState(hilo.modem_imei ?? '');
  const [modemSerieTecnico, setModemSerieTecnico] = useState(hilo.modem_serie ?? '');
  const [fotosInstalacion, setFotosInstalacion] = useState(false);
  const [notaAccion, setNotaAccion] = useState('');
  const [motivoFijo, setMotivoFijo] = useState(MOTIVOS_SIN_INSTALAR[0]);
  const [motivoLibre, setMotivoLibre] = useState('');
  const [comentario, setComentario] = useState('');
  const correr = useTrabajo();
  const [comentarioAlmacen, setComentarioAlmacen] = useState('');
  const [ampliaInstalacion, setAmpliaInstalacion] = useState<{ url: string; nombre: string; pie: string } | null>(null);
  const fotosSinCodigo = useMemo(
    () =>
      notas.filter(
        (nota) =>
          !nota.archivado &&
          Boolean(nota.archivo_nombre) &&
          new RegExp(`Hilo\\s+${hilo.orden}\\.`, 'i').test(nota.texto) &&
          nota.texto.includes('sin código leído'),
      ),
    [notas, hilo.orden],
  );
  const [leyendo, setLeyendo] = useState('');
  const notasInstalacion = useMemo(
    () =>
      notas.filter(
        (nota) =>
          !nota.archivado &&
          new RegExp(`hilo\\s*${hilo.orden}\\b`, 'i').test(nota.texto) &&
          /im[aá]genes de la instalaci[oó]n|instalaci[oó]n\./i.test(nota.texto),
      ),
    [notas, hilo.orden],
  );

  useEffect(() => {
    setContenedor(hilo.contenedor ?? '');
    setMaquina(hilo.maquina ?? '');
    setCelularAlmacen(hilo.chip_celular ?? '');
    setModemImeiAlmacen(hilo.modem_imei ?? '');
    setModemSerieAlmacen(hilo.modem_serie ?? '');
    setCelularTecnico(hilo.chip_celular ?? '');
    setModemImeiTecnico(hilo.modem_imei ?? '');
    setModemSerieTecnico(hilo.modem_serie ?? '');
  }, [hilo.id, hilo.contenedor, hilo.maquina, hilo.chip_celular, hilo.modem_imei, hilo.modem_serie]);

  function guardar(datos: Record<string, string | undefined>) {
    void correr(
      pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}`, {
        method: 'POST',
        body: JSON.stringify(datos),
      }),
    ).then((tarea) => {
      if (tarea) alGuardar(tarea);
    });
  }

  function actuar(accion: string, extra: Record<string, unknown> = {}) {
    setNotaAccion('');
    void correr(
      pedir<Tarea & { mensaje?: string }>(apiUrl, token, `/tareas/${tareaId}/hilos/${hilo.id}/accion`, {
        method: 'POST',
        body: JSON.stringify({ accion, ...extra }),
      }),
    ).then((tarea) => {
      if (!tarea) return;
      setNotaAccion(tarea.mensaje ?? 'Quedó registrado.');
      if (accion === 'comentario-instalacion') setComentario('');
      alGuardar(tarea);
    });
  }

  function subir(accion: string, archivos: FileList | null, comentarioFoto = '') {
    if (!archivos || archivos.length === 0) return;
    void leerFotos(archivos)
      .then((fotos) => actuar(accion, { fotos, comentario: comentarioFoto }))
      .catch((error: unknown) => alFallar(texto(error)));
  }

  function releer(notaId: string) {
    setLeyendo(notaId);
    void correr(pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/notas/${notaId}/releer`, { method: 'POST', body: '{}' }), 'La foto quedó leída de nuevo.', 'Leyendo la foto…')
      .then((tarea) => {
        if (tarea) alGuardar(tarea);
      })
      .finally(() => setLeyendo(''));
  }

  return (
    <div className="zonas">
      {notaAccion ? <p className="bajada zona-aviso">{notaAccion}</p> : null}
      {fotosSinCodigo.length > 0 ? (
        <div className="zona-accion">
          <h4>Fotos guardadas sin código</h4>
          <p>La imagen ya está en la cotización. Volver a leer busca el código de contenedor, máquina o chip.</p>
          {fotosSinCodigo.map((nota) => (
            <div key={nota.id}>
              <FotoNota apiUrl={apiUrl} token={token} tareaId={tareaId} notaId={nota.id} nombre={nota.archivo_nombre ?? 'foto'} />
              <p>{nota.texto}</p>
              <button type="button" disabled={leyendo === nota.id} onClick={() => releer(nota.id)}>
                {leyendo === nota.id ? 'Leyendo…' : 'Volver a leer'}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <form
        className="zona-accion"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar({ contenedor, maquina, zona: 'despacho' });
        }}
      >
        <h4>Despacho</h4>
        <p>{hilo.despacho_validado ? 'Lo que envió despacho ya está validado.' : 'Valida el contenedor y la máquina, o pídeselos ahora. También puedes escribirlos o subir la foto.'}</p>
        <div className="zona-botones">
          <button type="button" disabled={hilo.despacho_validado} onClick={() => actuar('validar-despacho')}>
            Validar lo que envió despacho
          </button>
          <button type="button" className="secundario" onClick={() => actuar('pedir-despacho')}>
            Pedir contenedor y máquina
          </button>
        </div>
        <label htmlFor={`contenedor-${hilo.id}`}>Contenedor</label>
        <input id={`contenedor-${hilo.id}`} value={contenedor} onChange={(evento) => setContenedor(evento.target.value)} />
        <label htmlFor={`maquina-${hilo.id}`}>Máquina</label>
        <input id={`maquina-${hilo.id}`} value={maquina} onChange={(evento) => setMaquina(evento.target.value)} />
        <button type="submit">Guardar equipo</button>
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="contenedor" etiqueta="Foto del contenedor" alGuardar={alGuardar} alFallar={alFallar} />
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="maquina" etiqueta="Foto de la máquina" alGuardar={alGuardar} alFallar={alFallar} />
      </form>
      <form
        className="zona-accion"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar({
            celular: celularAlmacen,
            modem_imei: modemImeiAlmacen,
            modem_serie: modemSerieAlmacen,
            zona: 'almacen',
          });
        }}
      >
        <h4>Almacén</h4>
        <p>Pide el chip o el módulo, registra la entrega y la recepción, o escribe el número si ya lo tienes. Lo que envió despacho está en este hilo.</p>
        {hilo.despacho_texto ? <p>{hilo.despacho_texto}</p> : <p>Despacho todavía no dejó texto de este equipo.</p>}
        <div className="zona-botones">
          <button type="button" onClick={() => actuar('pedir-chip')}>Pedir chip</button>
          <button type="button" onClick={() => actuar('pedir-modulo')}>Pedir módulo 4G</button>
          <button type="button" className="secundario" onClick={() => actuar('estado-retiro')}>Consultar retiro de insumos</button>
        </div>
        <label htmlFor={`chip-almacen-${hilo.id}`}>Número de chip (celular)</label>
        <input
          id={`chip-almacen-${hilo.id}`}
          value={celularAlmacen}
          onChange={(evento) => setCelularAlmacen(evento.target.value)}
          placeholder="Ej. 919867926"
          inputMode="numeric"
        />
        <label htmlFor={`modem-serie-almacen-${hilo.id}`}>SN módulo 4G</label>
        <input
          id={`modem-serie-almacen-${hilo.id}`}
          value={modemSerieAlmacen}
          onChange={(evento) => setModemSerieAlmacen(evento.target.value)}
          placeholder="Opcional"
        />
        <label htmlFor={`modem-imei-almacen-${hilo.id}`}>IMEI módulo 4G</label>
        <input
          id={`modem-imei-almacen-${hilo.id}`}
          value={modemImeiAlmacen}
          onChange={(evento) => setModemImeiAlmacen(evento.target.value)}
          placeholder="IMEI de la señal"
          inputMode="numeric"
        />
        <button type="submit">Guardar chip y módulo</button>
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="chip" zona="almacen" etiqueta="Foto del chip" alGuardar={alGuardar} alFallar={alFallar} />
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="modem" zona="almacen" etiqueta="Foto del módulo 4G" alGuardar={alGuardar} alFallar={alFallar} />
        <label htmlFor={`comentario-almacen-${hilo.id}`}>Comentario de la entrega o la recepción</label>
        <input id={`comentario-almacen-${hilo.id}`} value={comentarioAlmacen} onChange={(evento) => setComentarioAlmacen(evento.target.value)} />
        <label htmlFor={`entrega-${hilo.id}`}>Entrega de la solicitud firmada</label>
        <input id={`entrega-${hilo.id}`} type="file" accept="image/*" onChange={(evento) => { subir('entrega-almacen', evento.target.files, comentarioAlmacen); evento.target.value = ''; }} />
        <label htmlFor={`recepcion-${hilo.id}`}>Recepción de insumos</label>
        <input id={`recepcion-${hilo.id}`} type="file" accept="image/*" multiple onChange={(evento) => { subir('recepcion-almacen', evento.target.files, comentarioAlmacen); evento.target.value = ''; }} />
      </form>
      <form
        className="zona-accion"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar({
            celular: celularTecnico,
            modem_imei: modemImeiTecnico,
            modem_serie: modemSerieTecnico,
            zona: 'tecnico',
          });
        }}
      >
        <h4>Instalación</h4>
        <p>Regulariza el chip y el módulo, sube las fotos de la instalación, deja un comentario o pide validar la conexión. Si esta telemetría no se instala, anota el motivo.</p>
        <label htmlFor={`celular-tecnico-${hilo.id}`}>Número de celular</label>
        <input
          id={`celular-tecnico-${hilo.id}`}
          value={celularTecnico}
          onChange={(evento) => setCelularTecnico(evento.target.value)}
          placeholder="Celular del chip"
          inputMode="numeric"
        />
        <label htmlFor={`modem-serie-tecnico-${hilo.id}`}>SN módulo 4G</label>
        <input
          id={`modem-serie-tecnico-${hilo.id}`}
          value={modemSerieTecnico}
          onChange={(evento) => setModemSerieTecnico(evento.target.value)}
          placeholder="Opcional"
        />
        <label htmlFor={`modem-imei-tecnico-${hilo.id}`}>IMEI módulo 4G</label>
        <input
          id={`modem-imei-tecnico-${hilo.id}`}
          value={modemImeiTecnico}
          onChange={(evento) => setModemImeiTecnico(evento.target.value)}
          placeholder="IMEI de la señal"
          inputMode="numeric"
        />
        <button type="submit">Guardar validación</button>
        <p className="enlace-instalacion">
          <button type="button" className="enlace" onClick={() => setFotosInstalacion(true)}>
            Ver fotos de la instalación{notasInstalacion.length > 0 ? ` (${notasInstalacion.length})` : ''}
          </button>
        </p>
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="chip" zona="tecnico" etiqueta="Foto del chip (si se modifica)" alGuardar={alGuardar} alFallar={alFallar} />
        <FotoRegularizar apiUrl={apiUrl} token={token} tareaId={tareaId} hiloId={hilo.id} clase="modem" zona="tecnico" etiqueta="Foto del módulo 4G (si se modifica)" alGuardar={alGuardar} alFallar={alFallar} />
        <div className="zona-botones">
          <button type="button" onClick={() => actuar('asimilar-orden')}>Asimilar orden de fabricación</button>
          <button type="button" className="secundario" onClick={() => actuar('validar-senal', { equipo: 'Starcool' })}>Validar Starcool</button>
          <button type="button" className="secundario" onClick={() => actuar('validar-senal', { equipo: 'Thermoking' })}>Validar Thermoking</button>
          <button type="button" className="secundario" onClick={() => actuar('validar-senal', { equipo: 'Genset' })}>Validar Genset</button>
        </div>
        <label htmlFor={`fotos-instalacion-${hilo.id}`}>Fotos de la instalación</label>
        <input id={`fotos-instalacion-${hilo.id}`} type="file" accept="image/*" multiple onChange={(evento) => { subir('fotos-instalacion', evento.target.files, comentario); evento.target.value = ''; }} />
        <label htmlFor={`comentario-instalacion-${hilo.id}`}>Comentario de la instalación</label>
        <textarea id={`comentario-instalacion-${hilo.id}`} value={comentario} onChange={(evento) => setComentario(evento.target.value)} />
        <button type="button" onClick={() => actuar('comentario-instalacion', { comentario })}>Guardar comentario</button>
        <label htmlFor={`motivo-${hilo.id}`}>Esta telemetría no se instala</label>
        <select id={`motivo-${hilo.id}`} value={motivoFijo} onChange={(evento) => setMotivoFijo(evento.target.value)}>
          {MOTIVOS_SIN_INSTALAR.map((motivo) => (
            <option key={motivo} value={motivo}>{motivo}</option>
          ))}
          <option value="otra">Otra razón</option>
        </select>
        {motivoFijo === 'otra' ? (
          <input value={motivoLibre} onChange={(evento) => setMotivoLibre(evento.target.value)} placeholder="Escribe la razón" />
        ) : null}
        <button
          type="button"
          className="secundario"
          onClick={() => actuar('sin-instalacion', { motivo: motivoFijo === 'otra' ? motivoLibre : motivoFijo })}
        >
          Anotar que no se instala
        </button>
      </form>
      {fotosInstalacion ? (
        <Cuadro
          titulo={`Fotos de la instalación · Hilo ${hilo.orden}`}
          ayuda={
            notasInstalacion.length > 0
              ? 'Imágenes que el técnico envió por WhatsApp o web para este hilo.'
              : 'Todavía no hay fotos de instalación registradas en este hilo.'
          }
          alCerrar={() => setFotosInstalacion(false)}
        >
          {notasInstalacion.length > 0 ? (
            <ol className="bitacora-tiempo">
              {notasInstalacion.map((nota) => (
                <li key={nota.id}>
                  <div className="bitacora-evento">
                    <time>{cuando(nota.creado_en)}</time>
                    <strong>{nota.autor_nombre}</strong>
                  </div>
                  <p>{nota.texto}</p>
                  <MiniaturasNota
                    nota={nota}
                    apiUrl={apiUrl}
                    token={token}
                    tareaId={tareaId}
                    ocultar={false}
                    alAbrir={setAmpliaInstalacion}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p>Sin fotos aún. El técnico las carga desde WhatsApp en “Registrar imágenes de la instalación”.</p>
          )}
          <div className="modal-acciones">
            <button type="button" className="primario" onClick={() => setFotosInstalacion(false)}>
              Cerrar
            </button>
          </div>
        </Cuadro>
      ) : null}
      {ampliaInstalacion ? (
        <FotoAmpliada
          url={ampliaInstalacion.url}
          nombre={ampliaInstalacion.nombre}
          pie={ampliaInstalacion.pie}
          alCerrar={() => setAmpliaInstalacion(null)}
        />
      ) : null}
    </div>
  );
}

function FotoRegularizar({
  apiUrl,
  token,
  tareaId,
  hiloId,
  clase,
  zona,
  etiqueta,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  hiloId: string;
  clase: 'chip' | 'contenedor' | 'maquina' | 'modem';
  zona?: 'almacen' | 'tecnico';
  etiqueta: string;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const correr = useTrabajo();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const idFoto = `foto-${clase}-${zona ?? 'x'}-${hiloId}`;
  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  return (
    <div className="elegir-foto">
      <label className="elegir" htmlFor={idFoto}>{etiqueta}</label>
      <input
        id={idFoto}
        type="file"
        accept="image/*"
        onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
      />
      {vista ? <img className="mini-local" src={vista} alt={archivo?.name ?? etiqueta} /> : null}
      <button
        type="button"
        disabled={!archivo}
        onClick={() => {
          if (!archivo) return;
          const lector = new FileReader();
          lector.onload = () => {
            const contenido = String(lector.result).split(',')[1] ?? '';
            void correr(
              pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/hilos/${hiloId}/foto`, {
                method: 'POST',
                body: JSON.stringify({
                  clase,
                  zona,
                  nombre: archivo.name,
                  mime: archivo.type || 'image/jpeg',
                  contenido,
                }),
              }),
              'La foto quedó guardada.',
              'Subiendo la foto…',
            ).then((tarea) => {
              if (!tarea) return;
              setArchivo(null);
              alGuardar(tarea);
            });
          };
          lector.readAsDataURL(archivo);
        }}
      >
        Subir
      </button>
    </div>
  );
}

function Transferir({
  apiUrl,
  token,
  tareaId,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  tareaId: string;
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const correr = useTrabajo();
  const [cuentas, setCuentas] = useState<Array<{ correo: string; nombre: string }>>([]);
  const [correo, setCorreo] = useState('');
  useEffect(() => {
    void pedir<Array<{ correo: string; nombre: string }>>(apiUrl, token, '/tareas/tecnicos')
      .then(setCuentas)
      .catch((error: unknown) => alFallar(texto(error)));
  }, [apiUrl, token, alFallar]);
  return (
    <form
      className="herramientas"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!correo) return;
        void correr(pedir<Tarea>(apiUrl, token, `/tareas/${tareaId}/transferir`, { method: 'POST', body: JSON.stringify({ correo }) }), 'La tarea quedó transferida.').then((tarea) => {
          if (tarea) alGuardar(tarea);
        });
      }}
    >
      <label htmlFor="transferir">Transferir a</label>
      <select id="transferir" value={correo} onChange={(evento) => setCorreo(evento.target.value)}>
        <option value="">Elige un técnico</option>
        {cuentas.map((cuenta) => (
          <option key={cuenta.correo} value={cuenta.correo}>{cuenta.nombre}</option>
        ))}
      </select>
      <button type="submit">Transferir tarea</button>
    </form>
  );
}

function Bitacora({
  apiUrl,
  token,
  ficha,
  editar,
  anotar,
  parte = 'todo',
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  ficha: Tarea;
  editar: boolean;
  anotar: boolean;
  /** acciones = botones; tiempo = línea de seguimiento; todo = ambos (compat). */
  parte?: 'acciones' | 'tiempo' | 'todo';
  alGuardar: (tarea: Tarea) => void;
  alFallar: (mensaje: string) => void;
}) {
  const correr = useTrabajo();
  const verAcciones = parte === 'acciones' || parte === 'todo';
  const verTiempo = parte === 'tiempo' || parte === 'todo';
  const [modal, setModal] = useState<'seguimiento' | 'incidente' | 'cierre' | null>(null);
  const [textoNota, setTextoNota] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [amplia, setAmplia] = useState<{ url: string; nombre: string; pie: string } | null>(null);
  const notas = (ficha.notas ?? []).filter((nota) => editar || !nota.archivado);
  const fotosDespacho = ficha.asignacion?.imagenes ?? [];
  const eventos = [
    ...notas.map((nota) => ({ id: nota.id, cuando: nota.creado_en, nota })),
    ...(fotosDespacho.length > 0 ? [{ id: 'despacho-fotos', cuando: ficha.asignacion?.confirmada_en ?? '', nota: null }] : []),
  ].sort((a, b) => a.cuando.localeCompare(b.cuando) || (a.nota ? 1 : -1));

  function abrir(tipo: 'seguimiento' | 'incidente' | 'cierre') {
    setTextoNota('');
    setFotos([]);
    setModal(tipo);
  }

  function limpiar() {
    setModal(null);
    setAnulando(null);
    setTextoNota('');
    setFotos([]);
    setMotivo('');
  }

  function cerrar() {
    if (guardando) return;
    limpiar();
  }

  async function tomar() {
    const tarea = await correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/tomar`, { method: 'POST' }), 'La tarea quedó tomada.');
    if (tarea) alGuardar(tarea);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!modal) return;
    setGuardando(true);
    try {
      const cuerpo: { tipo?: string; texto: string; archivo?: { nombre: string; mime: string; contenido: string }; archivos?: Array<{ nombre: string; mime: string; contenido: string }> } = { texto: textoNota };
      const elegidas = modal === 'cierre' ? fotos.slice(0, 1) : fotos;
      if (elegidas.length === 1) cuerpo.archivo = await leerFoto(elegidas[0]);
      if (elegidas.length > 1) cuerpo.archivos = await Promise.all(elegidas.map((item) => leerFoto(item)));
      const ruta = modal === 'cierre' ? `/tareas/${ficha.id}/cerrar` : `/tareas/${ficha.id}/notas`;
      if (modal !== 'cierre') cuerpo.tipo = modal;
      const tarea = await correr(
        pedir<Tarea>(apiUrl, token, ruta, { method: 'POST', body: JSON.stringify(cuerpo) }),
        modal === 'cierre' ? 'La tarea quedó cerrada.' : 'La nota quedó guardada.',
      );
      setGuardando(false);
      if (!tarea) return;
      alGuardar(tarea);
      limpiar();
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  async function validar() {
    const tarea = await correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/validar`, { method: 'POST', body: JSON.stringify({ horas: 4 }) }), 'La tarea vuelve a salir en 4 horas.');
    if (tarea) alGuardar(tarea);
  }

  async function guardarEdicion(evento: FormEvent, notaId: string) {
    evento.preventDefault();
    setGuardando(true);
    try {
      const tarea = await correr(pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/notas/${notaId}/editar`, { method: 'POST', body: JSON.stringify({ texto: textoNota }) }), 'La nota quedó corregida.');
      setGuardando(false);
      if (!tarea) return;
      alGuardar(tarea);
      setEditando(null);
      setTextoNota('');
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  async function anular(evento: FormEvent) {
    evento.preventDefault();
    if (!anulando) return;
    setGuardando(true);
    try {
      const tarea = await correr(
        pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/notas/${anulando}/anular`, {
          method: 'POST',
          body: JSON.stringify({ texto: motivo }),
        }),
        'La nota quedó anulada.',
      );
      setGuardando(false);
      if (!tarea) return;
      alGuardar(tarea);
      limpiar();
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  return (
    <section className="bitacora">
      {verAcciones ? (
      <>
      <div className="bitacora-cabeza">
        <h3>Registro</h3>
        <p>Primero las acciones del técnico; luego los hilos; al final el seguimiento.</p>
        <p>{ficha.responsable_nombre ? `La tomó ${ficha.responsable_nombre}.` : 'Nadie la ha tomado. Al crear los hilos queda tomada automáticamente.'}</p>
        {editar ? <Transferir apiUrl={apiUrl} token={token} tareaId={ficha.id} alGuardar={alGuardar} alFallar={alFallar} /> : null}
        <p>{ficha.recordar_en ? `Vuelve a salir: ${cuando(ficha.recordar_en)}.` : 'Sin recordatorio pedido.'}</p>
      </div>
      {ficha.estado === 'resuelta' ? (
        <p>Esta tarea está resuelta y ya no se lista entre las abiertas.</p>
      ) : anotar || editar ? (
      <div className="bitacora-acciones">
        {(editar || anotar) && !ficha.responsable_nombre ? (
          <button type="button" className="primario" onClick={() => void tomar().catch((error: unknown) => alFallar(texto(error)))}>
            Tomar tarea
          </button>
        ) : null}
        <button type="button" className="primario" onClick={() => abrir('seguimiento')}>
          Anotar seguimiento
        </button>
        <button type="button" onClick={() => abrir('incidente')}>
          Registrar incidente
        </button>
        {editar ? (
          <button type="button" onClick={() => void validar().catch((error: unknown) => alFallar(texto(error)))}>
            Recordarme en 4 horas
          </button>
        ) : null}
        {editar ? (
          <button type="button" onClick={() => abrir('cierre')}>
            Cerrar por regularización
          </button>
        ) : null}
      </div>
      ) : null}
      </>
      ) : null}
      {verTiempo ? (
        eventos.length > 0 ? (
        <ListaVerMas
          titulo="Seguimiento"
          items={[...eventos].reverse()}
          clave={(evento) => evento.id}
          render={(evento) =>
            evento.nota ? (
              <>
                <div className="bitacora-evento">
                  <time>{cuando(evento.nota.creado_en)}</time>
                  <strong>
                    {etiquetaArea(areaDeNota(evento.nota))} · {etiquetaNota(evento.nota.tipo)}
                    {evento.nota.canal === 'whatsapp' ? ' · WhatsApp' : ''}
                  </strong>
                  <span>{evento.nota.autor_nombre}</span>
                </div>
                <p>{evento.nota.texto}</p>
                <MiniaturasNota
                  nota={evento.nota}
                  apiUrl={apiUrl}
                  token={token}
                  tareaId={ficha.id}
                  ocultar={fotosDespacho.length > 0 && evento.nota.texto.startsWith('Despacho registró')}
                  alAbrir={setAmplia}
                />
                {editar && evento.nota.tipo !== 'anulacion' && evento.nota.tipo !== 'cierre' && ficha.estado !== 'resuelta' ? (
                  <div className="bitacora-acciones">
                    <button type="button" onClick={() => { setMotivo(''); setAnulando(evento.nota?.id ?? ''); }}>Anular</button>
                    <button type="button" onClick={() => { setEditando(evento.nota?.id ?? null); setTextoNota(evento.nota?.texto ?? ''); }}>Editar</button>
                    <button
                      type="button"
                      onClick={() =>
                        void pedir<Tarea>(apiUrl, token, `/tareas/${ficha.id}/notas/${evento.nota?.id}/archivar`, {
                          method: 'POST',
                          body: JSON.stringify({ archivado: !evento.nota?.archivado }),
                        })
                          .then(alGuardar)
                          .catch((error: unknown) => alFallar(texto(error)))
                      }
                    >
                      {evento.nota.archivado ? 'Restaurar' : 'Archivar'}
                    </button>
                  </div>
                ) : null}
                {evento.nota.archivado ? <p>Archivada. El técnico no la ve en WhatsApp ni en su ficha.</p> : null}
                {editando === evento.nota.id ? (
                  <form onSubmit={(eventoForm) => void guardarEdicion(eventoForm, evento.nota?.id ?? '')}>
                    <textarea value={textoNota} onChange={(cambio) => setTextoNota(cambio.target.value)} rows={4} />
                    <button type="submit" disabled={guardando}>Guardar texto</button>
                  </form>
                ) : null}
              </>
            ) : (
              <>
                <div className="bitacora-evento">
                  <time>{ficha.asignacion?.confirmada_en ? cuando(ficha.asignacion.confirmada_en) : ''}</time>
                  <strong>Despacho</strong>
                  <span>{ficha.asignacion?.autor_nombre}</span>
                </div>
                <p>
                  Fotos del contenedor y de la máquina.
                  {ficha.asignacion?.texto?.trim() && ficha.asignacion.texto.trim() !== 'Sin texto.'
                    ? ` ${ficha.asignacion.texto.trim()}`
                    : ''}
                </p>
                <div className="miniaturas">
                  {fotosDespacho.map((imagen) => (
                    <FotoAsignacion
                      key={imagen.id}
                      apiUrl={apiUrl}
                      token={token}
                      tareaId={ficha.id}
                      archivoId={imagen.id}
                      nombre={imagen.nombre}
                      pie="Despacho · contenedor y máquina"
                      alAbrir={setAmplia}
                    />
                  ))}
                </div>
              </>
            )
          }
          claseItem={(evento) => (evento.nota ? `${evento.nota.tipo} ${areaDeNota(evento.nota)}` : 'despacho')}
        />
      ) : (
        <p className="bitacora-vacia">Todavía no hay notas del equipo.</p>
      )
      ) : null}
      {modal ? (
        <Cuadro
          titulo={modal === 'cierre' ? 'Cerrar por regularización' : modal === 'seguimiento' ? 'Seguimiento' : 'Incidente'}
          ayuda={modal === 'cierre' ? 'Escribe por qué se cierra. La foto es opcional. La tarea queda resuelta y deja de listarse.' : modal === 'seguimiento' ? 'Lo que te dijeron. Con esta nota la tarea sale del recordatorio de cada hora.' : 'Queda en la línea de tiempo. No vuelve a entrar al recordatorio.'}
          alCerrar={cerrar}
        >
          <form onSubmit={(evento) => void enviar(evento)}>
            <label htmlFor="texto-nota">{modal === 'cierre' ? 'Por qué se cierra' : 'Qué pasó'}</label>
            <textarea id="texto-nota" value={textoNota} onChange={(evento) => setTextoNota(evento.target.value)} rows={5} required autoFocus />
            <label htmlFor="foto-nota">{modal === 'cierre' ? 'Foto' : 'Fotos'}</label>
            <input id="foto-nota" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={modal !== 'cierre'} onChange={(evento) => setFotos(Array.from(evento.target.files ?? []))} />
            <p className="meta">{fotos.length > 0 ? fotos.map((item) => item.name).join(', ') : modal === 'cierre' ? 'La foto es opcional.' : 'La foto es opcional. Puedes elegir varias.'}</p>
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
      {amplia ? <FotoAmpliada url={amplia.url} nombre={amplia.nombre} pie={amplia.pie} alCerrar={() => setAmplia(null)} /> : null}
    </section>
  );
}

const VER_MAS_INICIAL = 2;
const VER_MAS_PAGINA = 8;

/** Últimos 2 visibles; con «Ver más» pagina de 8 en 8 (más recientes primero). */
function ListaVerMas<T>({
  titulo,
  items,
  clave,
  render,
  claseItem,
}: {
  titulo: string;
  items: T[];
  clave: (item: T) => string;
  render: (item: T) => ReactNode;
  claseItem?: (item: T) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pagina, setPagina] = useState(1);
  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / VER_MAS_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = !abierto
    ? items.slice(0, VER_MAS_INICIAL)
    : items.slice((paginaSegura - 1) * VER_MAS_PAGINA, paginaSegura * VER_MAS_PAGINA);
  const hayMas = total > VER_MAS_INICIAL;

  return (
    <section className="lista-ver-mas">
      <div className="lista-ver-mas-cabeza">
        <h3>{titulo}</h3>
        <p className="meta">
          {total === 0
            ? 'Sin registros.'
            : abierto
              ? `${total} en total · página ${paginaSegura} de ${totalPaginas}`
              : `Últimos ${Math.min(VER_MAS_INICIAL, total)} de ${total}`}
        </p>
      </div>
      {visibles.length > 0 ? (
        <ol className="bitacora-tiempo">
          {visibles.map((item) => (
            <li key={clave(item)} className={claseItem?.(item)}>
              {render(item)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="bitacora-vacia">Sin registros.</p>
      )}
      {hayMas ? (
        <div className="lista-ver-mas-acciones">
          {!abierto ? (
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setAbierto(true);
                setPagina(1);
              }}
            >
              Ver más
            </button>
          ) : (
            <>
              <button
                type="button"
                className="enlace"
                disabled={paginaSegura <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="meta">
                {paginaSegura} / {totalPaginas}
              </span>
              <button
                type="button"
                className="enlace"
                disabled={paginaSegura >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Siguiente
              </button>
              <button
                type="button"
                className="enlace"
                onClick={() => {
                  setAbierto(false);
                  setPagina(1);
                }}
              >
                Ver menos
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ModalEspera({ titulo, texto, alCerrar }: { titulo: string; texto?: string; alCerrar?: () => void }) {
  return (
    <div className="modal-fondo" onMouseDown={alCerrar}>
      <div className="modal modal-espera" role="dialog" aria-modal="true" aria-labelledby="titulo-espera" onMouseDown={(evento) => evento.stopPropagation()}>
        <h3 id="titulo-espera">{titulo}</h3>
        {texto ? <p className="meta">{texto}</p> : null}
        {alCerrar ? (
          <div className="modal-acciones">
            <button type="button" className="primario" onClick={alCerrar}>
              Cerrar
            </button>
          </div>
        ) : null}
      </div>
    </div>
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

function MiniaturasNota({ nota, apiUrl, token, tareaId, ocultar, alAbrir }: { nota: NotaBitacora; apiUrl: string; token: string; tareaId: string; ocultar: boolean; alAbrir: (foto: { url: string; nombre: string; pie: string }) => void }) {
  if (ocultar) return null;
  const imagenes = nota.imagenes && nota.imagenes.length > 0
    ? nota.imagenes
    : nota.archivo_nombre
      ? [{ id: '', nombre: nota.archivo_nombre }]
      : [];
  if (imagenes.length === 0) return null;
  const pie = `${etiquetaArea(areaDeNota(nota))} · ${etiquetaNota(nota.tipo)}`;
  return (
    <div className="miniaturas">
      {imagenes.map((imagen) => (
        <FotoNota key={imagen.id || nota.id} apiUrl={apiUrl} token={token} tareaId={tareaId} notaId={nota.id} nombre={imagen.nombre} archivoId={imagen.id || undefined} pie={pie} alAbrir={alAbrir} />
      ))}
    </div>
  );
}

function FotoNota({ apiUrl, token, tareaId, notaId, nombre, archivoId, pie, alAbrir }: { apiUrl: string; token: string; tareaId: string; notaId: string; nombre: string; archivoId?: string; pie?: string; alAbrir?: (foto: { url: string; nombre: string; pie: string }) => void }) {
  const url = useFoto(`${archivoId ? `${apiUrl}/tareas/${tareaId}/notas/${notaId}/archivos/${archivoId}` : `${apiUrl}/tareas/${tareaId}/notas/${notaId}/archivo`}`, token);
  const [propia, setPropia] = useState<{ url: string; nombre: string; pie: string } | null>(null);
  const abrir = alAbrir ?? setPropia;
  return (
    <>
      <Miniatura url={url} nombre={nombre} pie={pie ?? nombre} alAbrir={abrir} />
      {!alAbrir && propia ? <FotoAmpliada url={propia.url} nombre={propia.nombre} pie={propia.pie} alCerrar={() => setPropia(null)} /> : null}
    </>
  );
}

function FotoAsignacion({ apiUrl, token, tareaId, archivoId, nombre, pie, alAbrir }: { apiUrl: string; token: string; tareaId: string; archivoId: string; nombre: string; pie: string; alAbrir: (foto: { url: string; nombre: string; pie: string }) => void }) {
  const url = useFoto(`${apiUrl}/tareas/${tareaId}/asignacion/${archivoId}`, token);
  return <Miniatura url={url} nombre={nombre} pie={pie} alAbrir={alAbrir} />;
}

function useFoto(ruta: string, token: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    let objeto = '';
    void fetch(ruta, { headers: { authorization: `Bearer ${token}` } })
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
  }, [ruta, token]);
  return url;
}

function Miniatura({ url, nombre, pie, alAbrir }: { url: string | null; nombre: string; pie: string; alAbrir: (foto: { url: string; nombre: string; pie: string }) => void }) {
  if (!url) return <span className="mini-espera">{nombre}</span>;
  return (
    <button type="button" className="mini" onClick={() => alAbrir({ url, nombre, pie })}>
      <img src={url} alt={nombre} />
    </button>
  );
}

function FotoAmpliada({ url, nombre, pie, alCerrar }: { url: string; nombre: string; pie: string; alCerrar: () => void }) {
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
    <div className="modal-fondo foto" onMouseDown={alCerrar}>
      <div className="modal modal-foto" role="dialog" aria-modal="true" aria-label={nombre} onMouseDown={(evento) => evento.stopPropagation()}>
        <img src={url} alt={nombre} />
        <p>{pie}</p>
        <button type="button" onClick={alCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

function areaDeNota(nota: NotaBitacora): 'despacho' | 'almacen' | 'tecnico' {
  if (/^despacho|^regularización\. el técnico registró la (contenedor|máquina)/i.test(nota.texto)) return 'despacho';
  if (/almacén/i.test(nota.texto)) return 'almacen';
  if (/módulo 4g|modem|imei del chip|registró el chip|celular \d/i.test(nota.texto)) return 'tecnico';
  return 'tecnico';
}

function etiquetaArea(area: 'despacho' | 'almacen' | 'tecnico'): string {
  if (area === 'despacho') return 'Despacho';
  if (area === 'almacen') return 'Almacén';
  return 'Técnico';
}

function AccionesAsunto({
  apiUrl,
  token,
  mensajeId,
  modo,
  alListo,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  mensajeId: string;
  modo: 'interno' | 'decision';
  alListo: () => void;
  alFallar: (mensaje: string) => void;
}) {
  const correr = useTrabajo();
  const [modal, setModal] = useState<'seguimiento' | 'incidente' | 'cierre' | null>(null);
  const [textoNota, setTextoNota] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  function abrir(tipo: 'seguimiento' | 'incidente' | 'cierre') {
    setTextoNota('');
    setFoto(null);
    setModal(tipo);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!modal) return;
    setGuardando(true);
    try {
      const cuerpo: { tipo?: string; texto: string; archivo?: { nombre: string; mime: string; contenido: string } } = { texto: textoNota };
      if (foto) cuerpo.archivo = await leerFoto(foto);
      if (modal === 'cierre') {
        const cerrado = await correr(pedir(apiUrl, token, `/hilos/${mensajeId}/cerrar`, { method: 'POST', body: JSON.stringify(cuerpo) }), 'El asunto quedó cerrado.');
        setGuardando(false);
        if (cerrado) alListo();
        return;
      }
      cuerpo.tipo = modal;
      const nota = await correr(pedir(apiUrl, token, `/hilos/${mensajeId}/notas`, { method: 'POST', body: JSON.stringify(cuerpo) }), 'La nota quedó guardada.');
      if (!nota) {
        setGuardando(false);
        return;
      }
      setGuardando(false);
      setModal(null);
      alListo();
    } catch (error: unknown) {
      setGuardando(false);
      alFallar(texto(error));
    }
  }

  return (
    <div className="bitacora-acciones">
      {modo === 'interno' ? (
        <>
          <button type="button" className="primario" onClick={() => abrir('seguimiento')}>
            Anotar seguimiento
          </button>
          <button type="button" onClick={() => abrir('incidente')}>
            Registrar incidente
          </button>
        </>
      ) : null}
      <button type="button" onClick={() => abrir('cierre')}>
        Cerrar por regularización
      </button>
      {modal ? (
        <Cuadro
          titulo={modal === 'cierre' ? 'Cerrar por regularización' : modal === 'seguimiento' ? 'Seguimiento' : 'Incidente'}
          ayuda={modal === 'cierre' ? 'Escribe por qué se cierra. La foto es opcional. Queda resuelto y deja de listarse.' : 'Queda como evento de este asunto.'}
          alCerrar={() => { if (!guardando) setModal(null); }}
        >
          <form onSubmit={(evento) => void enviar(evento)}>
            <label htmlFor="texto-asunto">{modal === 'cierre' ? 'Por qué se cierra' : 'Qué pasó'}</label>
            <textarea id="texto-asunto" value={textoNota} onChange={(evento) => setTextoNota(evento.target.value)} rows={5} required autoFocus />
            <label htmlFor="foto-asunto">Foto</label>
            <input id="foto-asunto" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(evento) => setFoto(evento.target.files?.[0] ?? null)} />
            <p className="meta">{foto ? foto.name : 'La foto es opcional.'}</p>
            <div className="modal-acciones">
              <button type="button" onClick={() => setModal(null)} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" className="primario" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Cuadro>
      ) : null}
    </div>
  );
}

function FotoCierre({ apiUrl, token, mensajeId }: { apiUrl: string; token: string; mensajeId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    let objeto: string | null = null;
    void fetch(`${apiUrl}/hilos/${mensajeId}/cierre`, { headers: { authorization: `Bearer ${token}` } })
      .then((respuesta) => (respuesta.ok ? respuesta.blob() : null))
      .then((blob) => {
        if (!vigente || !blob) return;
        objeto = URL.createObjectURL(blob);
        setUrl(objeto);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [apiUrl, token, mensajeId]);
  if (!url) return null;
  return <img className="nota-foto" src={url} alt="Foto del cierre" />;
}

type EquipoInventario = {
  id: string;
  tarea_id: string;
  cot: string;
  cliente: string;
  lugar: string;
  proyecto: boolean;
  campana: boolean;
  estado: string;
  cadena: string;
  tienda: string;
  orden: number | null;
  clase: string;
  contenedor: string;
  maquina: string;
  telemetria: string;
  chip_imei: string;
  chip_celular: string;
  modem_imei: string;
  modem_serie: string;
};

function textoEquipo(equipo: EquipoInventario): string {
  const partes = [
    equipo.contenedor ? `Contenedor ${equipo.contenedor}` : '',
    equipo.maquina ? `Máquina ${equipo.maquina}` : '',
    equipo.telemetria ? `Telemetría ${equipo.telemetria}` : '',
    equipo.chip_celular ? `Celular ${equipo.chip_celular}` : '',
    equipo.chip_imei ? `IMEI chip ${equipo.chip_imei}` : '',
    equipo.modem_serie ? `Módulo ${equipo.modem_serie}` : '',
    equipo.modem_imei ? `IMEI módulo ${equipo.modem_imei}` : '',
  ].filter(Boolean);
  return partes.join(' · ') || 'Sin datos de equipo';
}

function claseEquipo(clase: string): string {
  if (clase === 'infraestructura') return 'Infraestructura';
  if (clase === 'hmi') return 'Pantalla HMI';
  return 'Telemetría';
}

export function PanelInventario({
  apiUrl,
  token,
  onAbrir,
}: {
  apiUrl: string;
  token: string;
  onAbrir: (tareaId: string, proyecto: boolean) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [equipos, setEquipos] = useState<EquipoInventario[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    if (consulta) parametros.set('q', consulta);
    void pedir<{ equipos: EquipoInventario[]; total: number; pagina: number; paginas: number }>(apiUrl, token, `/inventario?${parametros}`)
      .then((paginaLeida) => {
        setEquipos(paginaLeida.equipos);
        setTotal(paginaLeida.total);
        setPaginas(paginaLeida.paginas);
        setPagina(paginaLeida.pagina);
        setAviso(null);
      })
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token, pagina, consulta]);

  return (
    <section className="ficha">
      <div className="herramientas">
        <h2>Inventario</h2>
        <form
          className="buscar buscar-tareas"
          onSubmit={(evento) => {
            evento.preventDefault();
            setPagina(1);
            setConsulta(busqueda.trim());
          }}
        >
          <label className="sr" htmlFor="buscar-inventario">Buscar equipo</label>
          <input id="buscar-inventario" value={busqueda} placeholder="Contenedor, máquina, chip, IMEI o COT" onChange={(evento) => setBusqueda(evento.target.value)} />
          <button type="submit">Buscar</button>
        </form>
      </div>
      <p>Cada fila es un hilo con lo que quedó guardado: contenedor, máquina, número de chip e IMEI del módulo. Al abrirla vas a la ficha de esa cotización.</p>
      {aviso ? <p className="error">{aviso}</p> : null}
      <div className="paginas">
        <span>{total === 0 ? '0' : `${(pagina - 1) * 20 + 1}–${Math.min(pagina * 20, total)}`} de {total}</span>
        <button type="button" aria-label="Anterior" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹</button>
        <button type="button" aria-label="Siguiente" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>›</button>
      </div>
      {equipos.length === 0 ? <p>{consulta ? 'No hay equipos con ese texto.' : 'Todavía no hay equipos registrados.'}</p> : (
        <ul className="lista">
          {equipos.map((equipo) => (
            <li key={equipo.id}>
              <button type="button" className="fila" onClick={() => onAbrir(equipo.tarea_id, equipo.proyecto)}>
                <span className="avatar" aria-hidden="true">{equipo.orden ?? 'E'}</span>
                <span className="quien">
                  Hilo {equipo.orden} · {claseEquipo(equipo.clase)} · COT {equipo.cot}
                  {equipo.proyecto ? ' · Proyecto' : equipo.campana ? ' · Campaña' : ' · Tarea'}
                  {equipo.estado === 'resuelta' ? ' · Resuelta' : ' · En curso'}
                </span>
                <span className="resumen-fila">
                  <strong>{[equipo.cadena, equipo.tienda].filter(Boolean).join(' · ') || equipo.cliente || equipo.lugar || 'Sin cliente'}</strong>
                </span>
                <span className="equipo-guardado">
                  <span>Contenedor {equipo.contenedor || '—'}</span>
                  <span>Máquina {equipo.maquina || '—'}</span>
                  <span>Chip {equipo.chip_celular || '—'}</span>
                  <span>IMEI módulo {equipo.modem_imei || '—'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type OrigenConciliacion = EquipoInventario & { origen: 'hilo' | 'tienda' };
type HiloDestino = { id: string; orden: number; clase: string; ocupado: boolean; resumen: string };
type DestinoTarea = { id: string; cot: string; cliente: string; lugar: string; proyecto: boolean; campana: boolean; estado: string; hilos: HiloDestino[] };
type DestinoTienda = { id: string; campana_id: string; tarea_hija_id: string | null; cot: string; cliente: string; cadena: string; nombre: string; codigo: string; proyecto: boolean; estado: string; hilos: HiloDestino[] };

export function PanelConciliacion({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [origenes, setOrigenes] = useState<OrigenConciliacion[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [elegido, setElegido] = useState<OrigenConciliacion | null>(null);
  const [buscaDestino, setBuscaDestino] = useState('');
  const [destino, setDestino] = useState('');
  const [tareas, setTareas] = useState<DestinoTarea[]>([]);
  const [tiendas, setTiendas] = useState<DestinoTienda[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pasando, setPasando] = useState(false);

  useEffect(() => {
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    if (consulta) parametros.set('q', consulta);
    void pedir<{ origenes: OrigenConciliacion[]; total: number; pagina: number; paginas: number }>(apiUrl, token, `/conciliacion?${parametros}`)
      .then((paginaLeida) => {
        setOrigenes(paginaLeida.origenes);
        setTotal(paginaLeida.total);
        setPaginas(paginaLeida.paginas);
        setPagina(paginaLeida.pagina);
      })
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token, pagina, consulta, hecho]);

  useEffect(() => {
    if (destino.trim().length < 2) {
      setTareas([]);
      setTiendas([]);
      return;
    }
    const reloj = window.setTimeout(() => {
      void pedir<{ tareas: DestinoTarea[]; tiendas: DestinoTienda[] }>(apiUrl, token, `/conciliacion/destinos?q=${encodeURIComponent(destino.trim())}`)
        .then((lista) => {
          setTareas(lista.tareas);
          setTiendas(lista.tiendas);
        })
        .catch((error: unknown) => setAviso(texto(error)));
    }, 250);
    return () => window.clearTimeout(reloj);
  }, [apiUrl, token, destino]);

  async function pasar(destinoHiloId: string, ocupado: boolean) {
    if (!elegido) return;
    const pregunta = ocupado
      ? 'Ese hilo ya tiene equipo. Se intercambian la telemetría, el contenedor, la máquina y los IMEI.'
      : 'Se libera del lugar actual y queda en ese hilo.';
    if (!window.confirm(pregunta)) return;
    setPasando(true);
    setAviso(null);
    try {
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/conciliacion', {
        method: 'POST',
        body: JSON.stringify({ origen: elegido.origen, origenId: elegido.id, destinoHiloId }),
      });
      setHecho(respuesta.texto);
      setElegido(null);
      setDestino('');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setPasando(false);
    }
  }

  async function abrirYPasar(tareaId: string) {
    if (!elegido) return;
    if (!window.confirm('Se abre un hilo libre y la telemetría queda ahí.')) return;
    setPasando(true);
    setAviso(null);
    try {
      const hilo = await pedir<{ hiloId: string }>(apiUrl, token, '/conciliacion/hilo', {
        method: 'POST',
        body: JSON.stringify({ tareaId }),
      });
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/conciliacion', {
        method: 'POST',
        body: JSON.stringify({ origen: elegido.origen, origenId: elegido.id, destinoHiloId: hilo.hiloId }),
      });
      setHecho(respuesta.texto);
      setElegido(null);
      setDestino('');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setPasando(false);
    }
  }

  async function abrirTiendaYPasar(tienda: DestinoTienda) {
    if (!elegido) return;
    if (!window.confirm('Se abre un hilo de esta tienda y la telemetría queda ahí.')) return;
    setPasando(true);
    setAviso(null);
    try {
      let tareaId = tienda.tarea_hija_id;
      if (!tareaId) {
        const abierta = await pedir<{ tareaId: string }>(apiUrl, token, `/tareas/${tienda.campana_id}/tiendas/${tienda.id}/abrir`, { method: 'POST', body: '{}' });
        tareaId = abierta.tareaId;
      }
      const hilo = await pedir<{ hiloId: string }>(apiUrl, token, '/conciliacion/hilo', {
        method: 'POST',
        body: JSON.stringify({ tareaId }),
      });
      const respuesta = await pedir<{ texto: string }>(apiUrl, token, '/conciliacion', {
        method: 'POST',
        body: JSON.stringify({ origen: elegido.origen, origenId: elegido.id, destinoHiloId: hilo.hiloId }),
      });
      setHecho(respuesta.texto);
      setElegido(null);
      setDestino('');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setPasando(false);
    }
  }

  return (
    <section className="ficha">
      <div className="herramientas">
        <h2>Conciliación</h2>
        <form className="buscar buscar-tareas" onSubmit={(evento) => { evento.preventDefault(); setPagina(1); setConsulta(busqueda.trim()); }}>
          <label className="sr" htmlFor="buscar-conciliacion">Buscar telemetría mal ubicada</label>
          <input id="buscar-conciliacion" value={busqueda} placeholder="Contenedor, tienda, telemetría o IMEI" onChange={(evento) => setBusqueda(evento.target.value)} />
          <button type="submit">Buscar</button>
        </form>
      </div>
      <p>Una telemetría instalada puede haber quedado en otra tienda, en otra tarea o en otro hilo. Eliges la que está mal y la pasas al hilo de la tienda o de la tarea que corresponde. El lugar de origen queda libre. Si el hilo de destino ya tiene equipo, los dos se intercambian.</p>
      {aviso ? <p className="error">{aviso}</p> : null}
      {hecho ? <p>{hecho}</p> : null}
      {elegido ? (
        <section>
          <h3>Vas a mover</h3>
          <p>
            COT {elegido.cot}
            {elegido.tienda ? ` · ${[elegido.cadena, elegido.tienda].filter(Boolean).join(' · ')}` : ''}
            {elegido.orden ? ` · Hilo ${elegido.orden}` : ''}
            {' · '}{textoEquipo(elegido)}
          </p>
          <button type="button" onClick={() => setElegido(null)}>Elegir otra</button>
          <form className="buscar buscar-tareas" onSubmit={(evento) => { evento.preventDefault(); setDestino(buscaDestino.trim()); }}>
            <label className="sr" htmlFor="destino-conciliacion">Buscar destino</label>
            <input id="destino-conciliacion" value={buscaDestino} placeholder="COT, cliente o tienda de destino" onChange={(evento) => setBuscaDestino(evento.target.value)} />
            <button type="submit">Buscar destino</button>
          </form>
          {tareas.map((tarea) => (
            <article key={tarea.id} className="forma-tienda">
              <h4>COT {tarea.cot} · {tarea.proyecto ? 'Proyecto' : tarea.campana ? 'Campaña' : 'Tarea'} · {tarea.estado === 'resuelta' ? 'Resuelta' : 'En curso'}</h4>
              <p>{tarea.cliente || tarea.lugar || 'Sin cliente'}</p>
              <div className="bitacora-acciones">
                {tarea.hilos.map((hilo) => (
                  <button key={hilo.id} type="button" disabled={pasando || (elegido.origen === 'hilo' && elegido.id === hilo.id)} onClick={() => void pasar(hilo.id, hilo.ocupado)}>
                    Hilo {hilo.orden} · {hilo.resumen}
                  </button>
                ))}
                <button type="button" disabled={pasando} onClick={() => void abrirYPasar(tarea.id)}>Abrir un hilo libre y pasar</button>
              </div>
            </article>
          ))}
          {tiendas.map((tienda) => (
            <article key={tienda.id} className="forma-tienda">
              <h4>{[tienda.cadena, tienda.nombre].filter(Boolean).join(' · ')} · COT {tienda.cot}</h4>
              <p>{tienda.codigo ? `Telemetría ${tienda.codigo}` : 'Sin telemetría en la tienda'} · {tienda.estado === 'resuelta' ? 'Resuelta' : 'En curso'}</p>
              <div className="bitacora-acciones">
                {tienda.hilos.map((hilo) => (
                  <button key={hilo.id} type="button" disabled={pasando || (elegido.origen === 'hilo' && elegido.id === hilo.id)} onClick={() => void pasar(hilo.id, hilo.ocupado)}>
                    Hilo {hilo.orden} · {hilo.resumen}
                  </button>
                ))}
                <button type="button" disabled={pasando} onClick={() => void abrirTiendaYPasar(tienda)}>
                  {tienda.hilos.length === 0 ? 'Abrir el hilo de la tienda y pasar' : 'Abrir otro hilo y pasar'}
                </button>
              </div>
            </article>
          ))}
          {destino.trim().length >= 2 && tareas.length === 0 && tiendas.length === 0 ? <p>No hay tareas ni tiendas con ese texto.</p> : null}
        </section>
      ) : (
        <>
          <div className="paginas">
            <span>{total === 0 ? '0' : `${(pagina - 1) * 20 + 1}–${Math.min(pagina * 20, total)}`} de {total}</span>
            <button type="button" aria-label="Anterior" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹</button>
            <button type="button" aria-label="Siguiente" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>›</button>
          </div>
          {origenes.length === 0 ? <p>{consulta ? 'No hay telemetría con ese texto.' : 'Todavía no hay telemetría registrada para conciliar.'}</p> : (
            <ul className="lista">
              {origenes.map((origen) => (
                <li key={`${origen.origen}-${origen.id}`}>
                  <button type="button" className="fila" onClick={() => { setElegido(origen); setHecho(null); }}>
                    <span className="avatar" aria-hidden="true">C</span>
                    <span className="quien">COT {origen.cot}{origen.orden ? ` · Hilo ${origen.orden}` : ' · Tienda'}{origen.estado === 'resuelta' ? ' · Resuelta' : ' · En curso'}</span>
                    <span className="resumen-fila">
                      <strong>{[origen.cadena, origen.tienda].filter(Boolean).join(' · ') || origen.cliente || origen.lugar || 'Sin cliente'}</strong>
                      <span className="extracto"> — {textoEquipo(origen)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function etiquetaNota(tipo: string): string {
  if (tipo === 'seguimiento') return 'Seguimiento';
  if (tipo === 'incidente') return 'Incidente';
  if (tipo === 'cierre') return 'Seguimiento de cierre';
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
