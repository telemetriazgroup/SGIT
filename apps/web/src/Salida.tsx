import { FormEvent, useEffect, useState } from 'react';

type FilaWhatsapp = {
  id: string;
  telefono: string;
  cuerpo: string;
  contacto: string;
  aviso: string | null;
  escribioEn: string | null;
  creadoEn: string;
};

type FilaCorreo = {
  id: string;
  direccion: string;
  asunto: string;
  cuerpo: string;
  estado: string;
  error: string | null;
  noEnviarAntes: string | null;
  enviadoEn: string | null;
  creadoEn: string;
};

type Registros = { whatsapp: FilaWhatsapp[]; correos: FilaCorreo[] };

export function PanelSalida({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [whatsapp, setWhatsapp] = useState<FilaWhatsapp[]>([]);
  const [correos, setCorreos] = useState<FilaCorreo[]>([]);
  const [busca, setBusca] = useState('');
  const [contactos, setContactos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState('');

  async function cargar(texto = busca) {
    const lista = await pedir<Registros>(apiUrl, token, `/salida/registros${texto.trim() ? `?q=${encodeURIComponent(texto.trim())}` : ''}`);
    setWhatsapp(lista.whatsapp);
    setCorreos(lista.correos);
    setContactos(Object.fromEntries(lista.whatsapp.map((fila) => [fila.id, fila.contacto])));
  }

  useEffect(() => {
    void cargar('').catch((error: unknown) => setAviso(textoDe(error)));
  }, [apiUrl, token]);

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    void cargar().catch((error: unknown) => setAviso(textoDe(error)));
  }

  function aplicar(lista: Registros) {
    setWhatsapp(lista.whatsapp);
    setCorreos(lista.correos);
    setContactos(Object.fromEntries(lista.whatsapp.map((fila) => [fila.id, fila.contacto])));
  }

  async function guardarContacto(id: string) {
    setOcupado(id);
    setAviso(null);
    try {
      aplicar(await pedir<Registros>(apiUrl, token, `/salida/whatsapp/${id}/contacto`, {
        method: 'POST',
        body: JSON.stringify({ contacto: contactos[id] ?? '' }),
      }));
      setAviso('Quedó el número de la comercial. Si ese WhatsApp escribe, se le envía ese número.');
    } catch (error: unknown) {
      setAviso(textoDe(error));
    } finally {
      setOcupado('');
    }
  }

  async function quitar(fila: FilaWhatsapp) {
    if (!window.confirm(`¿Quitar ${fila.telefono} de la lista? Si el mensaje todavía no salió, no se envía.`)) return;
    setOcupado(fila.id);
    setAviso(null);
    try {
      aplicar(await pedir<Registros>(apiUrl, token, `/salida/whatsapp/${fila.id}/quitar`, { method: 'POST', body: '{}' }));
      setAviso(`${fila.telefono} salió de la lista.`);
    } catch (error: unknown) {
      setAviso(textoDe(error));
    } finally {
      setOcupado('');
    }
  }

  return (
    <section>
      <h2>Salida</h2>
      <p>Mensajes que llegaron por la API. Se puede cargar otro al mismo número o correo cuando el anterior ya salió. Si ese número escribe después de recibir el mensaje, y no es un usuario del sistema, se le envía el número de la comercial de ese envío. No recibe «No estás habilitado».</p>
      <form className="rango" onSubmit={buscar}>
        <label htmlFor="buscar-salida">Buscar</label>
        <input id="buscar-salida" value={busca} placeholder="Número, comercial, correo o texto" onChange={(evento) => setBusca(evento.target.value)} />
        <button type="submit">Buscar</button>
      </form>
      {aviso ? <p className={aviso.startsWith('Quedó') || aviso.includes('salió de la lista') ? 'meta' : 'error'}>{aviso}</p> : null}
      <h3>WhatsApp</h3>
      {whatsapp.length === 0 ? (
        <p>Todavía no hay números cargados por la API.</p>
      ) : (
        <table className="tabla-chips">
          <thead>
            <tr>
              <th>Número</th>
              <th>Comercial</th>
              <th>Mensaje</th>
              <th>Envío</th>
              <th>Escribió</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {whatsapp.map((fila) => (
              <tr key={fila.id}>
                <td>{fila.telefono}</td>
                <td>
                  <input
                    aria-label={`Comercial de ${fila.telefono}`}
                    value={contactos[fila.id] ?? fila.contacto}
                    onChange={(evento) => setContactos((actual) => ({ ...actual, [fila.id]: evento.target.value }))}
                  />
                </td>
                <td>{recorte(fila.cuerpo)}</td>
                <td>{etiquetaAviso(fila.aviso)}<br /><time>{cuando(fila.creadoEn)}</time></td>
                <td>{fila.escribioEn ? cuando(fila.escribioEn) : 'Todavía no'}</td>
                <td>
                  <button type="button" disabled={ocupado === fila.id} onClick={() => void guardarContacto(fila.id)}>Guardar</button>
                  <button type="button" disabled={ocupado === fila.id} onClick={() => void quitar(fila)}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Correos</h3>
      <p>Salen de a uno, con 20 segundos entre cada envío.</p>
      {correos.length === 0 ? (
        <p>Todavía no hay correos cargados por la API.</p>
      ) : (
        <table className="tabla-chips">
          <thead>
            <tr>
              <th>Dirección</th>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Cuando</th>
            </tr>
          </thead>
          <tbody>
            {correos.map((fila) => (
              <tr key={fila.id}>
                <td>{fila.direccion}</td>
                <td>{fila.asunto}<br />{recorte(fila.cuerpo)}</td>
                <td>
                  {etiquetaCorreo(fila.estado)}
                  {fila.error ? <><br />{fila.error}</> : null}
                </td>
                <td>{fila.enviadoEn ? cuando(fila.enviadoEn) : fila.noEnviarAntes ? cuando(fila.noEnviarAntes) : cuando(fila.creadoEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function etiquetaAviso(estado: string | null): string {
  if (estado === 'pendiente') return 'En cola';
  if (estado === 'enviado') return 'Enviado';
  if (estado === 'cerrado') return 'Cerrado';
  return 'Sin envío';
}

function etiquetaCorreo(estado: string): string {
  if (estado === 'pendiente') return 'En cola';
  if (estado === 'enviando') return 'Enviando';
  if (estado === 'enviado') return 'Enviado';
  if (estado === 'fallo') return 'No se envió';
  return estado;
}

function recorte(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > 140 ? `${limpio.slice(0, 139)}…` : limpio;
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

function textoDe(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
