import { FormEvent, ReactNode, useEffect, useState } from 'react';

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
  copia?: string;
  copiaOculta?: string;
  asunto: string;
  cuerpo: string;
  estado: string;
  error: string | null;
  noEnviarAntes: string | null;
  enviadoEn: string | null;
  creadoEn: string;
};

type Casilla = { correo: string; conectado: boolean };

type Registros = { whatsapp: FilaWhatsapp[]; correos: FilaCorreo[]; casilla?: Casilla };

type ResultadoCorreo = { direccion: string; estado: string; motivo?: string };

export function PanelSalida({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [whatsapp, setWhatsapp] = useState<FilaWhatsapp[]>([]);
  const [correos, setCorreos] = useState<FilaCorreo[]>([]);
  const [busca, setBusca] = useState('');
  const [contactos, setContactos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState('');
  const [casilla, setCasilla] = useState<Casilla>({ correo: '', conectado: false });
  const [abierto, setAbierto] = useState(false);
  const [para, setPara] = useState('');
  const [copia, setCopia] = useState('');
  const [oculta, setOculta] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [errorModal, setErrorModal] = useState<string | null>(null);

  async function cargar(texto = busca) {
    const lista = await pedir<Registros>(apiUrl, token, `/salida/registros${texto.trim() ? `?q=${encodeURIComponent(texto.trim())}` : ''}`);
    setWhatsapp(lista.whatsapp);
    setCorreos(lista.correos);
    setContactos(Object.fromEntries(lista.whatsapp.map((fila) => [fila.id, fila.contacto])));
    if (lista.casilla) setCasilla(lista.casilla);
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
    if (lista.casilla) setCasilla(lista.casilla);
  }

  async function enviarCorreo(evento: FormEvent) {
    evento.preventDefault();
    setOcupado('correo');
    setErrorModal(null);
    try {
      const resultado = await pedir<{ correos: ResultadoCorreo[] }>(apiUrl, token, '/salida', {
        method: 'POST',
        body: JSON.stringify({ correo: { direccion: para, copia, copiaOculta: oculta, asunto, cuerpo } }),
      });
      const puesto = resultado.correos[0];
      if (!puesto || puesto.estado !== 'en_cola') {
        setErrorModal(puesto?.motivo ?? 'No se pudo encolar el correo.');
        return;
      }
      setPara('');
      setCopia('');
      setOculta('');
      setAsunto('');
      setCuerpo('');
      setAbierto(false);
      const de = casilla.correo || 'la casilla sincronizada';
      setAviso(`Quedó en cola para ${puesto.direccion}. Sale de ${de}.`);
      await cargar();
    } catch (error: unknown) {
      setErrorModal(textoDe(error));
    } finally {
      setOcupado('');
    }
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
      <p>Mensajes que llegaron por la API, y correos escritos desde aquí. Se puede cargar otro al mismo número o correo cuando el anterior ya salió. El correo sale con la casilla sincronizada. Si ese número escribe después de recibir el mensaje, y no es un usuario del sistema, se le envía el número de la comercial de ese envío. No recibe «No estás habilitado».</p>
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
      <div className="salida-correo-cabecera">
        <h3>Correos</h3>
        <button type="button" onClick={() => { setErrorModal(null); setAbierto(true); }}>Enviar correo</button>
      </div>
      <p>{textoCasilla(casilla)} Salen de a uno, con 20 segundos entre cada envío.</p>
      {correos.length === 0 ? (
        <p>Todavía no hay correos en la cola.</p>
      ) : (
        <table className="tabla-chips">
          <thead>
            <tr>
              <th>Para</th>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Cuando</th>
            </tr>
          </thead>
          <tbody>
            {correos.map((fila) => (
              <tr key={fila.id}>
                <td>
                  {fila.direccion}
                  {fila.copia ? <><br />Copia: {fila.copia}</> : null}
                  {fila.copiaOculta ? <><br />Copia oculta: {fila.copiaOculta}</> : null}
                </td>
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
      {abierto ? (
        <CuadroCorreo
          alCerrar={() => {
            if (ocupado !== 'correo') setAbierto(false);
          }}
        >
          <form onSubmit={(evento) => void enviarCorreo(evento)}>
            <p className="meta">{textoCasilla(casilla)} Se encola y sale de a uno.</p>
            <label htmlFor="correo-para">Para</label>
            <textarea id="correo-para" className="corto" required value={para} placeholder="cliente@ejemplo.com" onChange={(evento) => setPara(evento.target.value)} />
            <p className="meta">Varios correos, separados por coma o por línea.</p>
            <label htmlFor="correo-copia">Copia</label>
            <textarea id="correo-copia" className="corto" value={copia} placeholder="Opcional" onChange={(evento) => setCopia(evento.target.value)} />
            <label htmlFor="correo-oculta">Copia oculta</label>
            <textarea id="correo-oculta" className="corto" value={oculta} placeholder="Opcional" onChange={(evento) => setOculta(evento.target.value)} />
            <label htmlFor="correo-asunto">Asunto</label>
            <input id="correo-asunto" type="text" required maxLength={180} value={asunto} onChange={(evento) => setAsunto(evento.target.value)} />
            <label htmlFor="correo-cuerpo">Cuerpo</label>
            <textarea id="correo-cuerpo" required value={cuerpo} onChange={(evento) => setCuerpo(evento.target.value)} />
            {errorModal ? <p className="error">{errorModal}</p> : null}
            <div className="modal-acciones">
              <button type="button" disabled={ocupado === 'correo'} onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="submit" className="primario" disabled={ocupado === 'correo'}>{ocupado === 'correo' ? 'Encolando…' : 'Encolar'}</button>
            </div>
          </form>
        </CuadroCorreo>
      ) : null}
    </section>
  );
}

function textoCasilla(casilla: Casilla): string {
  if (casilla.conectado && casilla.correo) return `Sale de ${casilla.correo}, la casilla sincronizada.`;
  if (casilla.correo) return `${casilla.correo} no está vinculada. El correo se encola, pero no sale hasta volver a vincular Gmail.`;
  return 'No hay una casilla vinculada. El correo se encola, pero no sale hasta vincular Gmail.';
}

function CuadroCorreo({ alCerrar, children }: { alCerrar: () => void; children: ReactNode }) {
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
      <div className="modal modal-correo" role="dialog" aria-modal="true" aria-labelledby="titulo-correo" onMouseDown={(evento) => evento.stopPropagation()}>
        <h3 id="titulo-correo">Enviar correo</h3>
        {children}
      </div>
    </div>
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
