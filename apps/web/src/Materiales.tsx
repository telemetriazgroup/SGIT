import { useEffect, useState } from 'react';

type Material = {
  moveId: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  pedido: boolean;
};

type Publica = {
  orden: string;
  cot: string;
  estado: string;
  chip: string;
  imei: string;
  modemSerie: string;
  materiales: Material[];
};

function tituloDe(material: Material): { codigo: string; nombre: string } {
  const coincidencia = material.nombre.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  const codigo = (coincidencia?.[1] || material.codigo || '').trim();
  let nombre = (coincidencia?.[2] || material.nombre || '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
  if (codigo && nombre.toUpperCase().startsWith(codigo.toUpperCase())) nombre = nombre.slice(codigo.length).trim();
  if (!nombre || nombre.toUpperCase() === codigo.toUpperCase()) nombre = '';
  return { codigo, nombre };
}

export function Materiales({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [datos, setDatos] = useState<Publica | null>(null);
  const [serie, setSerie] = useState('');
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verResto, setVerResto] = useState(() => window.matchMedia('(min-width: 800px)').matches);

  useEffect(() => {
    let vigente = true;
    void fetch(`${apiUrl}/fabricacion/${encodeURIComponent(token)}`)
      .then(async (respuesta) => {
        const cuerpo = (await respuesta.json()) as Publica & { message?: string };
        if (!vigente) return;
        if (!respuesta.ok) {
          setError(cuerpo.message || 'No pude abrir los materiales.');
          return;
        }
        setDatos(cuerpo);
        setSerie(cuerpo.modemSerie ?? '');
      })
      .catch(() => {
        if (vigente) setError('No pude abrir los materiales.');
      });
    return () => {
      vigente = false;
    };
  }, [apiUrl, token]);

  function cambiar(moveId: number, cambio: Partial<Material>) {
    setDatos((actual) => {
      if (!actual) return actual;
      return {
        ...actual,
        materiales: actual.materiales.map((material) => (material.moveId === moveId ? { ...material, ...cambio } : material)),
      };
    });
  }

  async function enviar(evento: { preventDefault(): void }) {
    evento.preventDefault();
    if (!datos) return;
    setEnviando(true);
    setError('');
    try {
      const respuesta = await fetch(`${apiUrl}/fabricacion/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ materiales: datos.materiales, modemSerie: serie }),
      });
      const cuerpo = (await respuesta.json()) as { texto?: string; message?: string };
      if (!respuesta.ok) {
        setError(cuerpo.message || 'No pude guardar la solicitud.');
        return;
      }
      setTexto(cuerpo.texto ?? '');
    } catch {
      setError('No pude guardar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  if (error && !datos) {
    return (
      <main className="materiales">
        <p className="marca">SGIT</p>
        <h1>Insumos</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }
  if (!datos) {
    return (
      <main className="materiales">
        <p className="marca">SGIT</p>
        <h1>Insumos</h1>
        <p>Cargando la lista…</p>
      </main>
    );
  }
  if (texto) {
    return (
      <main className="materiales">
        <p className="marca">SGIT</p>
        <h1>Insumos guardados</h1>
        <p>La solicitud quedó anotada. En WhatsApp escribe ok para confirmar la orden, o enlace si quieres cambiar algo.</p>
        <pre className="materiales-resumen">{texto}</pre>
      </main>
    );
  }
  const cerrada = datos.estado === 'confirmada';
  const pedidos = datos.materiales.filter((material) => material.pedido);
  const resto = datos.materiales.filter((material) => !material.pedido);
  return (
    <main className="materiales">
      <p className="marca">SGIT</p>
      <h1>Insumos</h1>
      <p className="materiales-meta">
        <strong>{datos.orden || 'Sin número de orden'}</strong>
        <span>COT {datos.cot}</span>
      </p>
      <p className="materiales-chip">
        Chip <strong>{datos.chip || 'sin celular'}</strong>
        {datos.imei ? <> · IMEI <strong>{datos.imei}</strong></> : null}
      </p>
      {cerrada ? <p>Esta orden ya está confirmada.</p> : <p className="bajada">Marca lo que se pide y ajusta la cantidad. El chip y el módem ya vienen incluidos.</p>}
      <form onSubmit={enviar}>
        <section>
          <h2>Se piden · {pedidos.length}</h2>
          <ul className="lista-materiales">
            {pedidos.map((material) => (
              <FilaMaterial key={material.moveId} material={material} cerrada={cerrada} alCambiar={cambiar} />
            ))}
          </ul>
        </section>
        <section>
          <h2>No se piden · {resto.length}</h2>
          {verResto ? (
            <ul className="lista-materiales">
              {resto.map((material) => (
                <FilaMaterial key={material.moveId} material={material} cerrada={cerrada} alCambiar={cambiar} />
              ))}
            </ul>
          ) : (
            <button type="button" className="secundario" onClick={() => setVerResto(true)}>
              Ver los {resto.length} materiales que no se piden
            </button>
          )}
        </section>
        <label htmlFor="serie-modem">Serie del módem USR-G786</label>
        <input id="serie-modem" value={serie} disabled={cerrada} onChange={(evento) => setSerie(evento.target.value)} placeholder="Vacío: Odoo elige la serie" />
        {error ? <p role="alert">{error}</p> : null}
        {cerrada ? null : (
          <button type="submit" className="enviar" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar insumos'}
          </button>
        )}
      </form>
    </main>
  );
}

function FilaMaterial({
  material,
  cerrada,
  alCambiar,
}: {
  material: Material;
  cerrada: boolean;
  alCambiar: (moveId: number, cambio: Partial<Material>) => void;
}) {
  const titulo = tituloDe(material);
  function cantidad(siguiente: number) {
    alCambiar(material.moveId, { cantidad: Math.max(0, siguiente) });
  }
  return (
    <li className={material.pedido ? 'material pedido' : 'material'}>
      <label>
        <input
          type="checkbox"
          checked={material.pedido}
          disabled={cerrada}
          onChange={(evento) => alCambiar(material.moveId, { pedido: evento.target.checked })}
        />
        <span>
          <strong>{titulo.codigo}</strong>
          {titulo.nombre ? <span>{titulo.nombre}</span> : null}
        </span>
      </label>
      <div className="material-cant">
        <button type="button" className="paso" disabled={cerrada || !material.pedido || material.cantidad <= 0} onClick={() => cantidad(material.cantidad - 1)} aria-label={`Bajar ${titulo.codigo}`}>
          −
        </button>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          aria-label={`Cantidad ${titulo.codigo}`}
          value={material.cantidad}
          disabled={cerrada || !material.pedido}
          onChange={(evento) => cantidad(Number(evento.target.value))}
        />
        <button type="button" className="paso" disabled={cerrada || !material.pedido} onClick={() => cantidad(material.cantidad + 1)} aria-label={`Subir ${titulo.codigo}`}>
          +
        </button>
        <span>{material.unidad}</span>
      </div>
    </li>
  );
}
