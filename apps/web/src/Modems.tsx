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
};

type Pagina = {
  modems: Modem[];
  total: number;
  pagina: number;
  paginas: number;
  resumen: { disponibles: number; fabricados: number; salidas: number; producto: string };
};

type Detalle = Modem & {
  movimientos: Array<{ fecha: string | null; referencia: string; desde: string; hacia: string; cantidad: number | null; estado: string }>;
};

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
      setElegido(await pedir<Detalle>(apiUrl, token, `/modems/${modem.id}`));
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
        USR-G786-G Global Frequency Industrial M2M. Consultar Odoo trae cada número de serie y sus movimientos: los que siguen en existencia, los que entraron a una orden de fabricación y los que salieron a un cliente. En una orden fabricada queda también el número del chip de esa telemetría.
      </p>
      <button id="consultar-modems" type="button" disabled={ocupado} onClick={() => void consultar()}>
        Consultar Odoo
      </button>
      {aviso ? <p className={aviso.startsWith('No se') || aviso.includes('no tiene') ? 'error' : 'bajada'}>{aviso}</p> : null}
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
      {elegido ? (
        <article className="odoo-hoja">
          <header className="odoo-cabeza">
            <p className="odoo-kicker">{ESTADOS[elegido.estado] ?? elegido.estado}</p>
            <h3>{elegido.serie}</h3>
            <p className="meta">
              {[elegido.orden_mo, elegido.chip ? `Chip ${elegido.chip}` : '', elegido.salida].filter(Boolean).join(' · ')}
            </p>
            <button type="button" className="secundario" onClick={() => setElegido(null)}>
              Volver
            </button>
          </header>
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
              {elegido.movimientos.map((movimiento, indice) => (
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
        </article>
      ) : null}
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
            </tr>
          </thead>
          <tbody>
            {modems.map((modem) => (
              <tr key={modem.id}>
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

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
