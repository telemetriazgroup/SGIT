import { FormEvent, useEffect, useState } from 'react';

type Modem = {
  id: string;
  serie: string;
  producto: string;
  estado: string;
  orden_mo: string;
  chip: string;
  salida: string;
  cantidad: number;
  fecha: string | null;
  situacion?: string;
  comentario?: string;
};

type Pagina = {
  modems: Modem[];
  total: number;
  pagina: number;
  paginas: number;
  resumen: { disponibles: number; fabricados: number; salidas: number; producto: string };
};

type NotaOrden = { fecha: string; autor: string; texto: string; imagenes: Array<{ id: string; nombre: string; mime: string; datos?: string }> };

type OrdenVista = {
  nombre: string;
  producto: string;
  estado: string;
  pasos: string[];
  ficha: Array<{ nombre: string; valor: string; lado: 'izq' | 'der' }>;
  componentes: Array<{ producto: string; porConsumir: number; consumido: number; unidad: string; desde: string; serie: string }>;
  notas: NotaOrden[];
  leido_en: string | null;
};

type Detalle = Modem & {
  movimientos: Array<{ fecha: string | null; referencia: string; desde: string; hacia: string; cantidad: number | null; estado: string }>;
  orden: OrdenVista | null;
};

type FotoNota = { id: string; nombre: string; mime: string; datos: string };

const ESTADOS: Record<string, string> = { disponible: 'Disponible', fabricado: 'Fabricado', salida: 'Salida', done: 'Hecho' };

export function PanelModems({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [modems, setModems] = useState<Modem[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState('');
  const [resumen, setResumen] = useState<Pagina['resumen'] | null>(null);
  const [elegido, setElegido] = useState<Detalle | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void cargar(1, '', '').catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  useEffect(() => {
    if (!elegido) return;
    document.getElementById('modem-elegido')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [elegido?.id]);

  async function cargar(siguiente: number, textoBusqueda: string, filtro = estado) {
    const datos = await pedir<Pagina>(apiUrl, token, `/modems?pagina=${siguiente}&q=${encodeURIComponent(textoBusqueda)}&estado=${encodeURIComponent(filtro)}`);
    setModems(datos.modems);
    setPagina(datos.pagina);
    setPaginas(datos.paginas);
    setTotal(datos.total);
    setResumen(datos.resumen);
  }

  async function consultar() {
    setOcupado(true);
    setAviso(null);
    try {
      const resultado = await pedir<{ leidos: number; disponibles: number; fabricados: number; salidas: number; aviso: string }>(apiUrl, token, '/modems/odoo', { method: 'POST', body: '{}' });
      setAviso(`Odoo respondió por ${resultado.leidos} módems: ${resultado.disponibles} disponibles, ${resultado.fabricados} fabricados y ${resultado.salidas} salidas.${resultado.aviso ? ` ${resultado.aviso}` : ''}`);
      setElegido(null);
      await cargar(1, consulta, estado);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function abrir(modem: Modem) {
    setOcupado(true);
    setAviso(null);
    try {
      const detalle = await pedir<Detalle>(apiUrl, token, `/modems/${modem.id}`);
      setElegido(detalle);
      if (!detalle.orden) return;
      const imagenes = await pedir<FotoNota[]>(apiUrl, token, `/modems/${modem.id}/orden/imagenes`).catch(() => []);
      if (imagenes.length === 0) return;
      const porId = new Map(imagenes.map((imagen) => [imagen.id, imagen.datos]));
      setElegido({
        ...detalle,
        orden: {
          ...detalle.orden,
          notas: detalle.orden.notas.map((nota) => ({
            ...nota,
            imagenes: nota.imagenes.map((imagen) => ({ ...imagen, datos: porId.get(imagen.id) ?? imagen.datos })),
          })),
        },
      });
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function refrescarOrden(modem: Detalle) {
    setOcupado(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, `/modems/${modem.id}/orden`, { method: 'POST', body: '{}' });
      await abrir(modem);
    } catch (error: unknown) {
      setAviso(texto(error));
      setOcupado(false);
    }
  }

  async function anotar(modem: Modem, situacion: string, comentario: string) {
    setOcupado(true);
    setAviso(null);
    try {
      const guardado = await pedir<Modem>(apiUrl, token, `/modems/${modem.id}/nota`, {
        method: 'POST',
        body: JSON.stringify({ situacion, comentario }),
      });
      setModems((lista) => lista.map((item) => (item.id === guardado.id ? { ...item, ...guardado } : item)));
      setElegido((actual) => (actual && actual.id === guardado.id ? { ...actual, ...guardado } : actual));
      setAviso('El comentario quedó guardado.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  const desde = total === 0 ? 0 : (pagina - 1) * 40 + 1;
  const hasta = Math.min(pagina * 40, total);

  return (
    <section className="ficha">
      <h2>M2M</h2>
      <p>
        USR-G786-G. Cada 5 minutos se guardan los módems y, si tienen orden de fabricación, la ficha, los componentes, las notas y las imágenes. Abrir uno lee la base. Si Odoo no cambió la orden, no se vuelve a pedir.
      </p>
      <button id="consultar-modems" type="button" disabled={ocupado} onClick={() => void consultar()}>
        Consultar Odoo
      </button>
      {aviso ? <p className={aviso.startsWith('No se') || aviso.includes('no tiene') ? 'error' : 'bajada'}>{aviso}</p> : null}
      {elegido ? (
        <div id="modem-elegido" className="zona-elegida">
          <NotaNumero
            numero={elegido.chip || elegido.serie}
            situacion={elegido.situacion ?? ''}
            comentario={elegido.comentario ?? ''}
            ocupado={ocupado}
            onGuardar={(situacion, comentario) => void anotar(elegido, situacion, comentario)}
          />
          <OrdenModem detalle={elegido} ocupado={ocupado} onCerrar={() => setElegido(null)} onActualizar={() => void refrescarOrden(elegido)} />
        </div>
      ) : null}
      {resumen ? (
        <p className="meta">
          {resumen.disponibles} disponibles · {resumen.fabricados} fabricados · {resumen.salidas} salidas
          {resumen.producto ? ` · ${resumen.producto}` : ''}
        </p>
      ) : null}
      <form
        className="chips-buscar"
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          void cargar(1, consulta).catch((error: unknown) => setAviso(texto(error)));
        }}
      >
        <input id="buscar-modems" value={consulta} placeholder="Buscar serie, orden, chip o salida" onChange={(evento) => setConsulta(evento.target.value)} />
        <button type="submit">Buscar</button>
      </form>
      <div className="chips-filtros">
        {[['', 'Todos'], ['disponible', 'Disponibles'], ['fabricado', 'Fabricados'], ['salida', 'Salidas']].map(([valor, nombre]) => (
          <button
            key={valor || 'todos'}
            type="button"
            className={estado === valor ? 'activo' : 'secundario'}
            onClick={() => {
              setEstado(valor);
              void cargar(1, consulta, valor).catch((error: unknown) => setAviso(texto(error)));
            }}
          >
            {nombre}
          </button>
        ))}
      </div>
      <p className="meta">{total === 0 ? 'Todavía no hay módems. Consulta Odoo para traerlos.' : `${desde}–${hasta} de ${total}`}</p>
      {modems.length > 0 ? (
        <table className="tabla-chips">
          <thead>
            <tr>
              <th>Serie</th>
              <th>Estado</th>
              <th>Orden</th>
              <th>Chip</th>
              <th>Salida</th>
              <th>Fecha</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {modems.map((modem) => (
              <tr
                key={modem.id}
                className={elegido?.id === modem.id ? 'elegida' : ''}
                onClick={(evento) => {
                  if ((evento.target as HTMLElement).closest('button')) return;
                  void abrir(modem);
                }}
              >
                <td>
                  <button type="button" className="enlace" onClick={() => void abrir(modem)}>
                    {modem.serie}
                  </button>
                </td>
                <td>{ESTADOS[modem.estado] ?? modem.estado}</td>
                <td>{modem.orden_mo}</td>
                <td>{modem.chip}</td>
                <td>{modem.salida}</td>
                <td>{modem.fecha ?? ''}</td>
                <td>{textoNota(modem.situacion, modem.comentario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {paginas > 1 ? (
        <div className="chips-filtros">
          <button type="button" className="secundario" disabled={pagina <= 1} onClick={() => void cargar(pagina - 1, consulta).catch((error: unknown) => setAviso(texto(error)))}>
            Anterior
          </button>
          <button type="button" className="secundario" disabled={pagina >= paginas} onClick={() => void cargar(pagina + 1, consulta).catch((error: unknown) => setAviso(texto(error)))}>
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  );
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new Error(cuerpo?.message ?? 'No se pudo completar la operación.');
  }
  return (await respuesta.json()) as T;
}

const SITUACIONES: Array<[string, string]> = [
  ['', 'Sin marca'],
  ['activo', 'Activo'],
  ['observacion', 'En observación'],
  ['suspendido', 'Suspendido'],
  ['baja', 'De baja'],
];

function textoNota(situacion?: string, comentario?: string): string {
  const marca = SITUACIONES.find(([valor]) => valor === (situacion ?? ''))?.[1] ?? '';
  const visible = marca === 'Sin marca' ? '' : marca;
  return [visible, comentario?.trim()].filter(Boolean).join(' · ') || '—';
}

function NotaNumero({
  numero,
  situacion,
  comentario,
  ocupado,
  onGuardar,
}: {
  numero: string;
  situacion: string;
  comentario: string;
  ocupado: boolean;
  onGuardar: (situacion: string, comentario: string) => void;
}) {
  const [marca, setMarca] = useState(situacion);
  const [textoNotaLocal, setTextoNotaLocal] = useState(comentario);
  useEffect(() => {
    setMarca(situacion);
    setTextoNotaLocal(comentario);
  }, [numero, situacion, comentario]);
  return (
    <form
      className="nota-numero"
      onSubmit={(evento) => {
        evento.preventDefault();
        onGuardar(marca, textoNotaLocal);
      }}
    >
      <p>Número {numero}</p>
      <label>
        Estado
        <select value={marca} onChange={(evento) => setMarca(evento.target.value)}>
          {SITUACIONES.map(([valor, nombre]) => (
            <option key={valor || 'sin'} value={valor}>
              {nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Comentario
        <textarea value={textoNotaLocal} rows={2} maxLength={500} onChange={(evento) => setTextoNotaLocal(evento.target.value)} />
      </label>
      <button type="submit" className="primario" disabled={ocupado}>
        {ocupado ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function OrdenModem({ detalle, ocupado, onCerrar, onActualizar }: { detalle: Detalle; ocupado: boolean; onCerrar: () => void; onActualizar: () => void }) {
  const orden = detalle.orden;
  const [foto, setFoto] = useState<number | null>(null);
  const fotos: FotoNota[] = (orden?.notas ?? []).flatMap((nota) => nota.imagenes.filter((imagen): imagen is FotoNota => Boolean(imagen.datos)));
  return (
    <article className="odoo-hoja orden-hoja">
      <header className="odoo-cabeza">
        <p className="odoo-kicker">
          {ESTADOS[detalle.estado] ?? detalle.estado} · {detalle.serie}
        </p>
        <h3>{orden?.nombre || detalle.orden_mo || detalle.serie}</h3>
        <p className="meta">{[detalle.orden_mo, detalle.chip ? `Chip ${detalle.chip}` : '', detalle.salida].filter(Boolean).join(' · ')}</p>
        {orden && orden.pasos.length > 0 ? (
          <div className="odoo-pasos">
            {orden.pasos.map((paso) => (
              <span key={paso} className={paso === orden.estado ? 'actual' : ''}>
                {ETIQUETA_ORDEN[paso] ?? paso}
              </span>
            ))}
          </div>
        ) : null}
        <div className="bitacora-acciones">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cerrar
          </button>
          {detalle.orden_mo ? (
            <button type="button" disabled={ocupado} onClick={onActualizar}>
              Actualizar de Odoo
            </button>
          ) : null}
        </div>
      </header>
      {detalle.orden_mo && !orden ? <p className="bajada">La orden todavía no está en la base. La sincronización la trae cada 5 minutos, o pulsa Actualizar de Odoo.</p> : null}
      {orden ? (
        <div className="odoo-cuerpo">
          <div className="odoo-formulario">
            <dl>
              {orden.ficha.filter((campo) => campo.lado === 'izq').map((campo) => (
                <div key={campo.nombre}>
                  <dt>{campo.nombre}</dt>
                  <dd>{fechaOrden(campo.valor)}</dd>
                </div>
              ))}
            </dl>
            <dl>
              {orden.ficha.filter((campo) => campo.lado === 'der').map((campo) => (
                <div key={campo.nombre}>
                  <dt>{campo.nombre}</dt>
                  <dd>{fechaOrden(campo.valor)}</dd>
                </div>
              ))}
            </dl>
            <h4>Componentes</h4>
            <table className="odoo-lineas">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Por consumir</th>
                  <th>Consumido</th>
                  <th>Unidad</th>
                  <th>Desde</th>
                  <th>Serie</th>
                </tr>
              </thead>
              <tbody>
                {orden.componentes.map((linea) => (
                  <tr key={linea.producto}>
                    <td>{linea.producto}</td>
                    <td>{linea.porConsumir}</td>
                    <td>{linea.consumido}</td>
                    <td>{linea.unidad}</td>
                    <td>{linea.desde}</td>
                    <td>{linea.serie}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="odoo-chatter">
            <h4>Notas</h4>
            {orden.notas.length === 0 ? <p className="meta">Sin notas.</p> : null}
            <ol>
              {orden.notas.map((nota, indice) => (
                <li key={`${nota.fecha}-${indice}`}>
                  <div>
                    <strong>{nota.autor || 'Odoo'}</strong>
                    <time>{nota.fecha ? fechaOrden(nota.fecha) : ''}</time>
                  </div>
                  {nota.texto ? <p>{nota.texto}</p> : null}
                  {nota.imagenes.some((imagen) => imagen.datos) ? (
                    <div className="orden-fotos">
                      {nota.imagenes.map((imagen) =>
                        imagen.datos ? (
                          <button key={imagen.id} type="button" className="miniatura" onClick={() => setFoto(fotos.findIndex((fotoNota) => fotoNota.id === imagen.id))} title="Ver la imagen">
                            <img src={`data:${imagen.mime};base64,${imagen.datos}`} alt={imagen.nombre} />
                          </button>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      ) : null}
      <h4>Movimientos</h4>
      <table className="odoo-lineas">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Referencia</th>
            <th>Desde</th>
            <th>A</th>
            <th>Cantidad</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {detalle.movimientos.map((movimiento, indice) => (
            <tr key={`${movimiento.referencia}-${indice}`}>
              <td>{movimiento.fecha ?? ''}</td>
              <td>{movimiento.referencia}</td>
              <td>{movimiento.desde}</td>
              <td>{movimiento.hacia}</td>
              <td>{movimiento.cantidad ?? ''}</td>
              <td>{ESTADOS[movimiento.estado] ?? movimiento.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {foto != null && fotos[foto] ? (
        <div className="foto-modal" role="dialog" aria-modal="true" aria-label={fotos[foto].nombre} onClick={() => setFoto(null)}>
          <div className="foto-marco" onClick={(evento) => evento.stopPropagation()}>
            <img src={`data:${fotos[foto].mime};base64,${fotos[foto].datos}`} alt={fotos[foto].nombre} />
            <div className="foto-controles">
              <button type="button" onClick={() => setFoto(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

const ETIQUETA_ORDEN: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  progress: 'En progreso',
  to_close: 'Por cerrar',
  done: 'Hecho',
  cancel: 'Cancelada',
};

function fechaOrden(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor;
  const normal = valor.includes('T') ? valor : valor.replace(' ', 'T');
  const conZona = /z$/i.test(normal) || /[+-]\d{2}/.test(normal) ? normal : `${normal}Z`;
  const fecha = new Date(conZona);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha);
}
