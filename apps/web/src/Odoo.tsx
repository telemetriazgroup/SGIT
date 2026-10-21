import { FormEvent, useEffect, useState } from 'react';

type ConfiguracionOdoo = {
  url: string;
  db: string;
  usuario: string;
  clavePuesta: boolean;
  sesionUsuario: string;
  sesionClavePuesta: boolean;
  modeloVenta: string;
  campoCot: string;
  modeloTarea: string;
  origen: 'pantalla' | 'entorno' | 'sin_conexion';
};

export function PanelOdoo({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [url, setUrl] = useState('');
  const [db, setDb] = useState('');
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [clavePuesta, setClavePuesta] = useState(false);
  const [sesionUsuario, setSesionUsuario] = useState('');
  const [sesionClave, setSesionClave] = useState('');
  const [sesionClavePuesta, setSesionClavePuesta] = useState(false);
  const [modeloVenta, setModeloVenta] = useState('sale.order');
  const [campoCot, setCampoCot] = useState('name');
  const [modeloTarea, setModeloTarea] = useState('project.task');
  const [origen, setOrigen] = useState<ConfiguracionOdoo['origen']>('sin_conexion');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void pedir<ConfiguracionOdoo>(apiUrl, token, '/odoo/configuracion')
      .then(aplicar)
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  function aplicar(config: ConfiguracionOdoo) {
    setUrl(config.url);
    setDb(config.db);
    setUsuario(config.usuario);
    setClave('');
    setClavePuesta(config.clavePuesta);
    setSesionUsuario(config.sesionUsuario || '');
    setSesionClave('');
    setSesionClavePuesta(config.sesionClavePuesta);
    setModeloVenta(config.modeloVenta || 'sale.order');
    setCampoCot(config.campoCot || 'name');
    setModeloTarea(config.modeloTarea || 'project.task');
    setOrigen(config.origen);
  }

  function cuerpo() {
    return { url, db, usuario, clave, sesionUsuario, sesionClave, modeloVenta, campoCot, modeloTarea };
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      aplicar(await pedir<ConfiguracionOdoo>(apiUrl, token, '/odoo/configuracion', { method: 'POST', body: JSON.stringify(cuerpo()) }));
      setAviso('La conexión quedó guardada.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, '/odoo/probar', { method: 'POST', body: JSON.stringify(cuerpo()) });
      setAviso('Odoo aceptó la conexión.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="ficha">
      <h2>Odoo</h2>
      <p>SGIT copia la cotización de Ventas y el ticket de Servicio externo. No escribe en Odoo. Las tareas marcadas se vuelven a leer para ver estado, entregas, facturación y notas.</p>
      {origen === 'entorno' ? <p className="bajada">La conexión está en el entorno. Al guardar queda en esta pantalla.</p> : null}
      {aviso ? <p className={aviso.startsWith('Odoo aceptó') || aviso.startsWith('La conexión') ? 'bajada' : 'error'}>{aviso}</p> : null}
      <form className="cuenta-alta" onSubmit={(evento) => void guardar(evento)}>
        <label htmlFor="odoo-url">
          Dirección
          <input id="odoo-url" value={url} onChange={(evento) => setUrl(evento.target.value)} required />
        </label>
        <label htmlFor="odoo-db">
          Base
          <input id="odoo-db" value={db} onChange={(evento) => setDb(evento.target.value)} required />
        </label>
        <label htmlFor="odoo-usuario">
          Usuario
          <input id="odoo-usuario" value={usuario} onChange={(evento) => setUsuario(evento.target.value)} required />
        </label>
        <label htmlFor="odoo-clave">
          Clave de API
          <input
            id="odoo-clave"
            type="password"
            value={clave}
            placeholder={clavePuesta ? 'Dejar en blanco para conservar' : ''}
            onChange={(evento) => setClave(evento.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label htmlFor="odoo-venta">
          Pedido
          <input id="odoo-venta" value={modeloVenta} onChange={(evento) => setModeloVenta(evento.target.value)} />
        </label>
        <label htmlFor="odoo-campo">
          Campo del número
          <input id="odoo-campo" value={campoCot} onChange={(evento) => setCampoCot(evento.target.value)} />
        </label>
        <label htmlFor="odoo-tarea">
          Servicio externo
          <input id="odoo-tarea" value={modeloTarea} onChange={(evento) => setModeloTarea(evento.target.value)} />
        </label>
        <p className="bajada ancho">Para bajar el reporte PDF hace falta un usuario con clave normal. La clave de API no abre ese archivo. Si la clave ya está guardada, déjala en blanco.</p>
        <label htmlFor="odoo-sesion-usuario">
          Usuario del reporte
          <input id="odoo-sesion-usuario" value={sesionUsuario} onChange={(evento) => setSesionUsuario(evento.target.value)} autoComplete="off" />
        </label>
        <label htmlFor="odoo-sesion-clave">
          Clave del reporte
          <input
            id="odoo-sesion-clave"
            type="password"
            value={sesionClave}
            placeholder={sesionClavePuesta ? 'Dejar en blanco para conservar' : ''}
            onChange={(evento) => setSesionClave(evento.target.value)}
            autoComplete="new-password"
          />
        </label>
        <p className="bajada">El pedido es sale.order y el servicio externo es project.task, como en la cotización y en el ticket. Si Odoo no los cambió, déjalos así.</p>
        <div className="bitacora-acciones">
          <button type="submit" className="primario" disabled={ocupado}>
            Guardar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void probar()}>
            Probar conexión
          </button>
        </div>
      </form>
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
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo?.message[0] : cuerpo?.message;
    throw new Error(mensaje ?? 'No se pudo completar la operación.');
  }
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
