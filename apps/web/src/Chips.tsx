import { FormEvent, useEffect, useState } from 'react';

type Chip = {
  id: string;
  producto: string;
  marca: string;
  imei: string;
  celular: string;
  archivado: boolean;
  estado?: string;
  telemetria?: string;
  orden_mo?: string;
  ocupado_fecha?: string | null;
};

type Pagina = {
  chips: Chip[];
  total: number;
  pagina: number;
  paginas: number;
  resumen?: { disponibles: number; ocupados: number; sinDato: number; meses: Array<{ mes: string; total: number }>; dias: Array<{ dia: string; total: number }> };
};

type Carga = {
  creados: number;
  reemplazados: number;
  conflictos: Array<{ fila: number; imei: string }>;
  rechazados: Array<{ fila: number; motivo: string }>;
};

type Borrador = { producto: string; marca: string; imei: string; celular: string };

export function PanelChips({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [chips, setChips] = useState<Chip[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [consulta, setConsulta] = useState('');
  const [archivados, setArchivados] = useState(false);
  const [estado, setEstado] = useState('');
  const [periodo, setPeriodo] = useState({ mes: '', dia: '' });
  const [resumen, setResumen] = useState<Pagina['resumen']>(undefined);
  const [producto, setProducto] = useState('');
  const [marca, setMarca] = useState('');
  const [imei, setImei] = useState('');
  const [celular, setCelular] = useState('');
  const [edicion, setEdicion] = useState<string | null>(null);
  const [orden, setOrden] = useState<Chip | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void cargar(1, '', false, '').catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function cargar(siguiente: number, textoBusqueda: string, verArchivados = archivados, filtro = estado, corte = periodo) {
    const datos = await pedir<Pagina>(
      apiUrl,
      token,
      `/chips?pagina=${siguiente}&q=${encodeURIComponent(textoBusqueda)}&archivados=${verArchivados ? 'si' : 'no'}&estado=${encodeURIComponent(filtro)}&mes=${encodeURIComponent(corte.mes)}&dia=${encodeURIComponent(corte.dia)}`,
    );
    setChips(datos.chips);
    setPagina(datos.pagina);
    setPaginas(datos.paginas);
    setTotal(datos.total);
    setResumen(datos.resumen);
    setEdicion(null);
  }

  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    await guardarNuevo(false);
  }

  async function guardarNuevo(reemplazar: boolean) {
    setOcupado(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, '/chips', { method: 'POST', body: JSON.stringify({ producto, marca, imei, celular, reemplazar }) });
      setProducto('');
      setMarca('');
      setImei('');
      setCelular('');
      setAviso(reemplazar ? 'Eliminé el chip anterior y guardé este.' : 'El chip quedó cargado.');
      await cargar(1, consulta);
    } catch (error: unknown) {
      if (!reemplazar && pideEliminar(error) && window.confirm('Ese IMEI ya está cargado. ¿Eliminar el otro y guardar este?')) {
        await pedir(apiUrl, token, '/chips', { method: 'POST', body: JSON.stringify({ producto, marca, imei, celular, reemplazar: true }) });
        setProducto('');
        setMarca('');
        setImei('');
        setCelular('');
        setAviso('Eliminé el chip anterior y guardé este.');
        await cargar(1, consulta);
        return;
      }
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function guardarEdicion(reemplazar: boolean) {
    if (!edicion || !borrador) return;
    setOcupado(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, `/chips/${edicion}`, { method: 'POST', body: JSON.stringify({ ...borrador, reemplazar }) });
      setAviso(reemplazar ? 'Eliminé el otro chip y guardé este.' : 'El chip quedó actualizado.');
      await cargar(pagina, consulta);
    } catch (error: unknown) {
      if (!reemplazar && pideEliminar(error) && window.confirm('Ese IMEI ya está en otro chip. ¿Eliminar el otro y guardar este?')) {
        await pedir(apiUrl, token, `/chips/${edicion}`, { method: 'POST', body: JSON.stringify({ ...borrador, reemplazar: true }) });
        setAviso('Eliminé el otro chip y guardé este.');
        await cargar(pagina, consulta);
        return;
      }
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function archivar(chip: Chip) {
    const siguiente = !chip.archivado;
    if (!window.confirm(siguiente ? '¿Archivar este chip? Sale de la lista activa.' : '¿Restaurar este chip a la lista activa?')) return;
    setOcupado(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, `/chips/${chip.id}/archivar`, { method: 'POST', body: JSON.stringify({ archivado: siguiente }) });
      setAviso(siguiente ? 'El chip quedó archivado.' : 'El chip volvió a la lista.');
      await cargar(pagina, consulta);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function cargarExcel(archivo: File | undefined, reemplazar = false, contenidoListo?: string, nombre?: string) {
    if (!archivo && !contenidoListo) return;
    setOcupado(true);
    setAviso(null);
    try {
      const base64 = contenidoListo ?? (await aBase64(archivo!));
      const carga = await pedir<Carga>(apiUrl, token, '/chips/excel', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre ?? archivo?.name, contenido: base64, reemplazar }),
      });
      if (!reemplazar && carga.conflictos.length > 0 && window.confirm(`Hay ${carga.conflictos.length} IMEI que ya están cargados. ¿Eliminar esos y quedarte con los del Excel?`)) {
        const segunda = await pedir<Carga>(apiUrl, token, '/chips/excel', {
          method: 'POST',
          body: JSON.stringify({ nombre: nombre ?? archivo?.name, contenido: base64, reemplazar: true }),
        });
        setAviso(`Entraron ${segunda.creados} chips nuevos. Se reemplazaron ${segunda.reemplazados}.`);
        await cargar(1, consulta);
        return;
      }
      const fallos = carga.rechazados.slice(0, 8).map((fila) => `Fila ${fila.fila}: ${fila.motivo}`);
      const extra = carga.rechazados.length > 8 ? ` Y ${carga.rechazados.length - 8} más.` : '';
      const choque = carga.conflictos.length ? ` ${carga.conflictos.length} IMEI ya existían y no se tocaron.` : '';
      setAviso([`Entraron ${carga.creados} chips nuevos. Se reemplazaron ${carga.reemplazados}.${choque}`, fallos.length ? `No entraron ${carga.rechazados.length}. ${fallos.join(' ')}${extra}` : null].filter(Boolean).join(' '));
      await cargar(1, consulta);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function consultar() {
    setOcupado(true);
    setAviso(null);
    try {
      setAviso(await consultarEn(apiUrl, token));
      await cargar(1, consulta, archivados, estado);
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  function elegirPeriodo(tipo: 'mes' | 'dia', valor: string) {
    const siguiente = tipo === 'mes'
      ? { mes: periodo.mes === valor ? '' : valor, dia: '' }
      : { mes: '', dia: periodo.dia === valor ? '' : valor };
    const filtro = siguiente.mes || siguiente.dia ? 'ocupado' : estado;
    setPeriodo(siguiente);
    setEstado(filtro);
    void cargar(1, consulta, archivados, filtro, siguiente).catch((error: unknown) => setAviso(texto(error)));
  }

  const desde = total === 0 ? 0 : (pagina - 1) * 40 + 1;
  const hasta = Math.min(pagina * 40, total);

  return (
    <section className="ficha">
      <h2>Chips</h2>
      <p>Carga el Excel o agrega uno. El celular se puede repetir. El IMEI no: si ya existe, hay que eliminar el anterior. Consultar Odoo busca cada celular como número de serie. Si el CHIP ya no está a la mano y pasó a una telemetría, queda ocupado. Si sigue como chip, queda disponible.</p>
      <button id="consultar-odoo" type="button" disabled={ocupado} onClick={() => void consultar()}>
        Consultar Odoo
      </button>
      <form className="chips-alta" onSubmit={(evento) => void agregar(evento)}>
        <label htmlFor="chip-producto">
          Producto
          <input id="chip-producto" value={producto} onChange={(evento) => setProducto(evento.target.value)} required />
        </label>
        <label htmlFor="chip-marca">
          Marca
          <input id="chip-marca" value={marca} onChange={(evento) => setMarca(evento.target.value)} required />
        </label>
        <label htmlFor="chip-imei">
          IMEI
          <input id="chip-imei" value={imei} onChange={(evento) => setImei(evento.target.value)} inputMode="numeric" required />
        </label>
        <label htmlFor="chip-celular">
          Celular
          <input id="chip-celular" value={celular} onChange={(evento) => setCelular(evento.target.value)} inputMode="tel" required />
        </label>
        <button type="submit" className="primario" disabled={ocupado}>
          Agregar
        </button>
      </form>
      <label className="chips-archivo" htmlFor="chip-excel">
        Excel
        <input
          id="chip-excel"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={ocupado}
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            evento.target.value = '';
            void cargarExcel(archivo);
          }}
        />
      </label>
      {aviso ? <p className={aviso.startsWith('No se') || aviso.includes('no es válido') || aviso.includes('ya está') ? 'error' : 'bajada'}>{aviso}</p> : null}
      <form
        className="chips-buscar"
        onSubmit={(evento) => {
          evento.preventDefault();
          void cargar(1, consulta).catch((error: unknown) => setAviso(texto(error)));
        }}
      >
        <input id="buscar-chips" value={consulta} placeholder="Buscar producto, marca, IMEI o celular" onChange={(evento) => setConsulta(evento.target.value)} />
        <button type="submit">Buscar</button>
        <button
          type="button"
          className="secundario"
          onClick={() => {
            const siguiente = !archivados;
            setArchivados(siguiente);
            void cargar(1, consulta, siguiente).catch((error: unknown) => setAviso(texto(error)));
          }}
        >
          {archivados ? 'Ver activos' : 'Ver archivados'}
        </button>
      </form>
      {resumen ? (
        <>
          <p className="meta">
            {resumen.disponibles} disponibles · {resumen.ocupados} ocupados · {resumen.sinDato} sin dato en Odoo
          </p>
          <div className="chips-graficas">
            <Barras
              titulo="Ocupados por mes"
              puntos={resumen.meses.map((mes) => ({ id: mes.mes, etiqueta: etiquetaMes(mes.mes), total: mes.total }))}
              activo={periodo.mes}
              onElegir={(mes) => elegirPeriodo('mes', mes)}
            />
            <Barras
              titulo="Últimos 7 días"
              puntos={(resumen.dias ?? []).map((dia) => ({ id: dia.dia, etiqueta: etiquetaDia(dia.dia), total: dia.total }))}
              activo={periodo.dia}
              onElegir={(dia) => elegirPeriodo('dia', dia)}
            />
          </div>
          {periodo.mes || periodo.dia ? (
            <p className="meta">Lista de chips ocupados {periodo.mes ? `en ${mesDe(periodo.mes)}` : `el ${etiquetaDia(periodo.dia)}`}. Vuelve a pulsar la barra para ver todos.</p>
          ) : null}
        </>
      ) : null}
      <div className="chips-filtros">
        {[['','Todos'],['disponible','Disponibles'],['ocupado','Ocupados']].map(([valor, nombre]) => (
          <button
            key={valor || 'todos'}
            type="button"
            className={estado === valor ? 'activo' : 'secundario'}
            onClick={() => {
              setEstado(valor);
              setPeriodo({ mes: '', dia: '' });
              void cargar(1, consulta, archivados, valor, { mes: '', dia: '' }).catch((error: unknown) => setAviso(texto(error)));
            }}
          >
            {nombre}
          </button>
        ))}
      </div>
      {orden ? <OrdenFabricacion apiUrl={apiUrl} token={token} chip={orden} onCerrar={() => setOrden(null)} /> : null}
      <p className="meta">{total === 0 ? (archivados ? 'No hay chips archivados.' : 'Todavía no hay chips.') : `${desde}–${hasta} de ${total}`}</p>
      {chips.length > 0 ? (
        <table className="tabla-chips">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Marca</th>
              <th>IMEI</th>
              <th>Celular</th>
              <th>En Odoo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chips.map((chip) =>
              edicion === chip.id && borrador ? (
                <tr key={chip.id}>
                  <td><input aria-label="Producto" value={borrador.producto} onChange={(evento) => setBorrador({ ...borrador, producto: evento.target.value })} /></td>
                  <td><input aria-label="Marca" value={borrador.marca} onChange={(evento) => setBorrador({ ...borrador, marca: evento.target.value })} /></td>
                  <td><input aria-label="IMEI" value={borrador.imei} onChange={(evento) => setBorrador({ ...borrador, imei: evento.target.value })} /></td>
                  <td><input aria-label="Celular" value={borrador.celular} onChange={(evento) => setBorrador({ ...borrador, celular: evento.target.value })} /></td>
                  <td>{etiquetaEstado(chip)}</td>
                  <td className="chips-acciones">
                    <button type="button" disabled={ocupado} onClick={() => void guardarEdicion(false)}>Guardar</button>
                    <button type="button" className="secundario" onClick={() => setEdicion(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={chip.id}>
                  <td>{chip.producto}</td>
                  <td>{chip.marca}</td>
                  <td>{chip.imei}</td>
                  <td>
                    {chip.estado === 'ocupado' ? (
                      <button type="button" className="enlace" onClick={() => setOrden(chip)}>
                        {chip.celular}
                      </button>
                    ) : (
                      chip.celular
                    )}
                  </td>
                  <td>{etiquetaEstado(chip)}</td>
                  <td className="chips-acciones">
                    <button
                      type="button"
                      onClick={() => {
                        setEdicion(chip.id);
                        setBorrador({ producto: chip.producto, marca: chip.marca, imei: chip.imei, celular: chip.celular });
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className="secundario" disabled={ocupado} onClick={() => void archivar(chip)}>
                      {chip.archivado ? 'Restaurar' : 'Archivar'}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      ) : null}
      <div className="paginas">
        <button type="button" aria-label="Anterior" disabled={pagina <= 1} onClick={() => void cargar(pagina - 1, consulta).catch((error: unknown) => setAviso(texto(error)))}>
          ‹
        </button>
        <button type="button" aria-label="Siguiente" disabled={pagina >= paginas} onClick={() => void cargar(pagina + 1, consulta).catch((error: unknown) => setAviso(texto(error)))}>
          ›
        </button>
      </div>
    </section>
  );
}

async function pedir<T>(apiUrl: string, token: string, ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string | string[] } | null;
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message[0] : cuerpo?.message;
    const error = new Error(mensaje ?? 'No se pudo completar la operación.');
    if (respuesta.status === 409) error.name = 'ConflictError';
    throw error;
  }
  return (await respuesta.json()) as T;
}

function pideEliminar(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConflictError';
}

async function consultarEn(apiUrl: string, token: string): Promise<string> {
  const resultado = await pedir<{ leidos: number; disponibles: number; ocupados: number; sinDato: number }>(apiUrl, token, '/chips/odoo', { method: 'POST', body: '{}' });
  return `Odoo respondió por ${resultado.leidos} chips: ${resultado.disponibles} disponibles, ${resultado.ocupados} ocupados y ${resultado.sinDato} sin dato.`;
}

function etiquetaEstado(chip: Chip): string {
  if (chip.estado === 'ocupado') return ['Ocupado', chip.telemetria, chip.orden_mo, chip.ocupado_fecha].filter(Boolean).join(' · ');
  if (chip.estado === 'disponible') return 'Disponible';
  return 'Sin dato';
}

type OrdenVista = {
  nombre: string;
  producto: string;
  estado: string;
  pasos: string[];
  ficha: Array<{ nombre: string; valor: string; lado: 'izq' | 'der' }>;
  componentes: Array<{ producto: string; porConsumir: number; consumido: number; unidad: string; desde: string; serie: string }>;
  trazas: Array<{ referencia: string; producto: string; desde: string; hacia: string; cantidad: number | null; fecha: string | null }>;
  notas: Array<{ fecha: string; autor: string; texto: string; imagenes: Array<{ id: string; nombre: string; mime: string; datos?: string }> }>;
  leido_en: string | null;
};

type FotoNota = { id: string; nombre: string; mime: string; datos: string };

function OrdenFabricacion({ apiUrl, token, chip, onCerrar }: { apiUrl: string; token: string; chip: Chip; onCerrar: () => void }) {
  const [orden, setOrdenVista] = useState<OrdenVista | null>(null);
  const [aviso, setAviso] = useState('Leyendo la orden guardada…');
  const [ocupado, setOcupado] = useState(true);
  const [foto, setFoto] = useState<number | null>(null);

  useEffect(() => {
    void cargar(false);
  }, [chip.id]);

  async function cargar(forzar: boolean) {
    setOcupado(true);
    setAviso(forzar ? 'Actualizando desde Odoo…' : 'Leyendo la orden guardada…');
    try {
      const datos = await pedir<OrdenVista>(apiUrl, token, `/chips/${chip.id}/orden`, forzar ? { method: 'POST', body: '{}' } : undefined);
      setOrdenVista(datos);
      setAviso('');
      setOcupado(false);
      const imagenes = await pedir<FotoNota[]>(apiUrl, token, `/chips/${chip.id}/orden/imagenes`).catch(() => []);
      if (imagenes.length > 0) {
        const porId = new Map(imagenes.map((imagen) => [imagen.id, imagen.datos]));
        setOrdenVista({
          ...datos,
          notas: datos.notas.map((nota) => ({
            ...nota,
            imagenes: nota.imagenes.map((imagen) => ({ ...imagen, datos: porId.get(imagen.id) ?? imagen.datos })),
          })),
        });
      }
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  const pasos = orden?.pasos ?? [];
  const fotos: FotoNota[] = (orden?.notas ?? []).flatMap((nota) => nota.imagenes.filter((imagen): imagen is FotoNota => Boolean(imagen.datos)));
  return (
    <article className="odoo-hoja orden-hoja">
      <header className="odoo-cabeza">
        <p className="odoo-kicker">Orden de fabricación · {chip.celular}</p>
        <h3>{orden?.nombre || chip.orden_mo}</h3>
        {pasos.length > 0 ? (
          <div className="odoo-pasos">
            {pasos.map((paso) => (
              <span key={paso} className={paso === orden?.estado ? 'actual' : ''}>
                {ETIQUETA_ORDEN[paso] ?? paso}
              </span>
            ))}
          </div>
        ) : null}
        <div className="bitacora-acciones">
          <button type="button" className="secundario" onClick={onCerrar}>
            Volver
          </button>
          <button type="button" disabled={ocupado} onClick={() => void cargar(true)}>
            Actualizar de Odoo
          </button>
        </div>
      </header>
      {aviso ? <p className={ocupado || orden ? 'bajada' : 'error'}>{aviso}</p> : null}
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
            <h4>Trazabilidad</h4>
            <table className="odoo-lineas">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Producto</th>
                  <th>Fecha</th>
                  <th>Desde</th>
                  <th>A</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {orden.trazas.map((linea, indice) => (
                  <tr key={`${linea.referencia}-${indice}`}>
                    <td>{linea.referencia}</td>
                    <td>{linea.producto}</td>
                    <td>{linea.fecha ? fechaOrden(linea.fecha) : ''}</td>
                    <td>{linea.desde}</td>
                    <td>{linea.hacia}</td>
                    <td>{linea.cantidad ?? ''}</td>
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
                  {nota.imagenes.length > 0 ? (
                    <div className="orden-fotos">
                      {nota.imagenes.map((imagen) =>
                        imagen.datos ? (
                          <button key={imagen.id} type="button" className="miniatura" onClick={() => setFoto(fotos.findIndex((fotoNota) => fotoNota.id === imagen.id))} title="Ver la imagen">
                            <img src={`data:${imagen.mime};base64,${imagen.datos}`} alt={imagen.nombre} />
                          </button>
                        ) : (
                          <span key={imagen.id}>{imagen.nombre}</span>
                        ),
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      ) : null}
      {foto != null && fotos[foto] ? (
        <VisorFoto
          fotos={fotos}
          indice={foto}
          onCerrar={() => setFoto(null)}
          onMover={(paso) => setFoto((actual) => (actual == null ? 0 : (actual + paso + fotos.length) % fotos.length))}
        />
      ) : null}
    </article>
  );
}

function VisorFoto({ fotos, indice, onCerrar, onMover }: { fotos: FotoNota[]; indice: number; onCerrar: () => void; onMover: (paso: number) => void }) {
  const actual = fotos[indice];
  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
      if (evento.key === 'ArrowRight') onMover(1);
      if (evento.key === 'ArrowLeft') onMover(-1);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar, onMover]);
  if (!actual) return null;
  return (
    <div className="foto-modal" role="dialog" aria-modal="true" aria-label={actual.nombre} onClick={onCerrar}>
      <div className="foto-marco" onClick={(evento) => evento.stopPropagation()}>
        <img src={`data:${actual.mime};base64,${actual.datos}`} alt={actual.nombre} />
        <div className="foto-controles">
          {fotos.length > 1 ? (
            <button type="button" className="secundario" onClick={() => onMover(-1)}>
              Anterior
            </button>
          ) : null}
          <span>
            {indice + 1} de {fotos.length}
          </span>
          {fotos.length > 1 ? (
            <button type="button" className="secundario" onClick={() => onMover(1)}>
              Siguiente
            </button>
          ) : null}
          <button type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Barras({ titulo, puntos, activo, onElegir }: { titulo: string; puntos: Array<{ id: string; etiqueta: string; total: number }>; activo: string; onElegir: (id: string) => void }) {
  const maximo = Math.max(1, ...puntos.map((punto) => punto.total));
  return (
    <figure className="barras">
      <figcaption>{titulo}</figcaption>
      {puntos.length === 0 ? <p className="meta">Sin ocupaciones registradas.</p> : null}
      <div className="barras-lienzo">
        {puntos.map((punto) => (
          <button key={punto.id} type="button" className={activo === punto.id ? 'barra activa' : 'barra'} onClick={() => onElegir(punto.id)} title={`${punto.etiqueta}: ${punto.total}`}>
            <span className="barra-valor">{punto.total}</span>
            <span className="barra-pista">
              <span className="barra-columna" style={{ height: `${Math.max(punto.total === 0 ? 3 : 8, (punto.total / maximo) * 100)}%` }} />
            </span>
            <span className="barra-eje">{punto.etiqueta}</span>
          </button>
        ))}
      </div>
    </figure>
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

function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-');
  const cortos = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${cortos[Number(numero) - 1] ?? mes} ${anio.slice(2)}`;
}

function etiquetaDia(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00-05:00`);
  if (Number.isNaN(fecha.getTime())) return dia;
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric' }).format(fecha);
}

function mesDe(mes: string): string {
  const [anio, numero] = mes.split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[Number(numero) - 1] ?? mes} ${anio}`;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

async function aBase64(archivo: File): Promise<string> {
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  let binario = '';
  for (let indice = 0; indice < contenido.length; indice += 0x8000) {
    binario += String.fromCharCode(...contenido.subarray(indice, indice + 0x8000));
  }
  return btoa(binario);
}
