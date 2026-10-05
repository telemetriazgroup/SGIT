import { FormEvent, useEffect, useState } from 'react';

type Cuenta = {
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
  telefono: string | null;
};

export function PanelEquipo({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [rol, setRol] = useState<'administrador' | 'tecnico'>('tecnico');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cuenta = cuentas.find((item) => item.correo === elegida) ?? null;

  async function cargar() {
    const lista = await pedir<Cuenta[]>(apiUrl, token, '/usuarios');
    setCuentas(lista);
    setElegida((actual) => actual ?? lista[0]?.correo ?? null);
  }

  useEffect(() => {
    void cargar().catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      const lista = await pedir<Cuenta[]>(apiUrl, token, '/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nombre, correo, contrasena, rol }),
      });
      setCuentas(lista);
      setElegida(correo.trim().toLowerCase());
      setNombre('');
      setCorreo('');
      setContrasena('');
      setAviso('La cuenta quedó creada.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ficha cuentas">
      <h2>Cuentas</h2>
      <p>El administrador ve y corrige las tareas. El técnico las recibe en WhatsApp y solo anota seguimientos e incidentes.</p>
      <form className="cuenta-alta" onSubmit={(evento) => void crear(evento)}>
        <label htmlFor="cuenta-nombre">
          Nombre
          <input id="cuenta-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} required />
        </label>
        <label htmlFor="cuenta-correo">
          Correo
          <input id="cuenta-correo" type="email" value={correo} onChange={(evento) => setCorreo(evento.target.value)} required />
        </label>
        <label htmlFor="cuenta-clave">
          Contraseña
          <input id="cuenta-clave" type="password" value={contrasena} onChange={(evento) => setContrasena(evento.target.value)} minLength={8} required />
        </label>
        <label htmlFor="cuenta-rol">
          Tipo
          <select id="cuenta-rol" value={rol} onChange={(evento) => setRol(evento.target.value === 'administrador' ? 'administrador' : 'tecnico')}>
            <option value="tecnico">Técnico</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        <button type="submit" className="primario" disabled={guardando}>
          {guardando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      {aviso ? <p className={aviso.startsWith('La cuenta') || aviso.startsWith('Los datos') || aviso.startsWith('La contraseña') ? 'meta' : 'error'}>{aviso}</p> : null}
      <div className="cuentas-cuerpo">
        <ul className="cuenta-lista">
          {cuentas.map((item) => (
            <li key={item.correo}>
              <button type="button" className={item.correo === elegida ? 'cuenta-tarjeta activa' : 'cuenta-tarjeta'} onClick={() => setElegida(item.correo)}>
                <span className="cuenta-avatar" aria-hidden="true">
                  {iniciales(item.nombre)}
                </span>
                <span>
                  <strong>{item.nombre}</strong>
                  <small>{item.correo}</small>
                </span>
                <em>{etiquetaRol(item.rol)}</em>
              </button>
            </li>
          ))}
        </ul>
        {cuenta ? (
          <Editor
            apiUrl={apiUrl}
            token={token}
            cuenta={cuenta}
            alGuardar={(lista, mensaje) => {
              setCuentas(lista);
              setAviso(mensaje);
            }}
            alFallar={setAviso}
          />
        ) : null}
      </div>
    </section>
  );
}

function Editor({
  apiUrl,
  token,
  cuenta,
  alGuardar,
  alFallar,
}: {
  apiUrl: string;
  token: string;
  cuenta: Cuenta;
  alGuardar: (cuentas: Cuenta[], mensaje: string) => void;
  alFallar: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [rol, setRol] = useState(cuenta.rol);
  const [activo, setActivo] = useState(cuenta.activo);
  const [telefono, setTelefono] = useState(cuenta.telefono ?? '');
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const superusuario = cuenta.rol === 'superusuario';

  useEffect(() => {
    setNombre(cuenta.nombre);
    setRol(cuenta.rol);
    setActivo(cuenta.activo);
    setTelefono(cuenta.telefono ?? '');
    setClave('');
  }, [cuenta]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    try {
      await pedir<Cuenta>(apiUrl, token, '/usuarios/datos', {
        method: 'POST',
        body: JSON.stringify({ correo: cuenta.correo, nombre, rol, activo, telefono }),
      });
      alGuardar(await pedir<Cuenta[]>(apiUrl, token, '/usuarios'), 'Los datos quedaron guardados.');
    } catch (error: unknown) {
      alFallar(texto(error));
    } finally {
      setGuardando(false);
    }
  }

  async function reiniciar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    try {
      await pedir(apiUrl, token, '/usuarios/contrasena', {
        method: 'POST',
        body: JSON.stringify({ correo: cuenta.correo, contrasena: clave }),
      });
      setClave('');
      alGuardar(await pedir<Cuenta[]>(apiUrl, token, '/usuarios'), 'La contraseña quedó reiniciada.');
    } catch (error: unknown) {
      alFallar(texto(error));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <article className="cuenta-ficha">
      <header>
        <span className="cuenta-avatar grande" aria-hidden="true">
          {iniciales(nombre || cuenta.nombre)}
        </span>
        <div>
          <h3>{cuenta.nombre}</h3>
          <p>{cuenta.correo}</p>
        </div>
      </header>
      <form className="cuenta-campos" onSubmit={(evento) => void guardar(evento)}>
        <label htmlFor="editar-nombre">
          Nombre
          <input id="editar-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} required />
        </label>
        <label htmlFor="editar-correo">
          Correo
          <input id="editar-correo" value={cuenta.correo} disabled />
        </label>
        <label htmlFor="editar-rol">
          Tipo
          <select id="editar-rol" value={rol} disabled={superusuario} onChange={(evento) => setRol(evento.target.value)}>
            <option value="tecnico">Técnico</option>
            <option value="administrador">Administrador</option>
            <option value="operador">Operador</option>
            {superusuario ? <option value="superusuario">Superusuario</option> : null}
          </select>
        </label>
        <label htmlFor="editar-telefono">
          WhatsApp
          <input id="editar-telefono" inputMode="tel" value={telefono} placeholder="51900000000" onChange={(evento) => setTelefono(evento.target.value)} />
        </label>
        <label className="cuenta-activa" htmlFor="editar-activo">
          <input id="editar-activo" type="checkbox" checked={activo} disabled={superusuario} onChange={(evento) => setActivo(evento.target.checked)} />
          Cuenta activa
        </label>
        <button type="submit" className="primario" disabled={guardando}>
          Guardar datos
        </button>
      </form>
      <form className="cuenta-campos" onSubmit={(evento) => void reiniciar(evento)}>
        <h3>Reiniciar contraseña</h3>
        <label htmlFor="reiniciar-clave">
          Nueva contraseña
          <input id="reiniciar-clave" type="password" value={clave} minLength={8} onChange={(evento) => setClave(evento.target.value)} required />
        </label>
        <button type="submit" disabled={guardando}>
          Reiniciar contraseña
        </button>
      </form>
    </article>
  );
}

export function MiCuenta({
  apiUrl,
  token,
  alCambiarNombre,
}: {
  apiUrl: string;
  token: string;
  alCambiarNombre: (nombre: string) => void;
}) {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void pedir<Cuenta>(apiUrl, token, '/cuenta')
      .then((propia) => {
        setCuenta(propia);
        setNombre(propia.nombre);
        setTelefono(propia.telefono ?? '');
      })
      .catch((error: unknown) => setAviso(texto(error)));
  }, [apiUrl, token]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      const propia = await pedir<Cuenta>(apiUrl, token, '/cuenta', {
        method: 'POST',
        body: JSON.stringify({ nombre, telefono }),
      });
      setCuenta(propia);
      setTelefono(propia.telefono ?? '');
      alCambiarNombre(propia.nombre);
      setAviso('Tus datos quedaron guardados.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiar(evento: FormEvent) {
    evento.preventDefault();
    if (nueva !== repetir) {
      setAviso('La contraseña nueva no coincide.');
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      await pedir(apiUrl, token, '/cuenta/contrasena', {
        method: 'POST',
        body: JSON.stringify({ actual, nueva }),
      });
      setActual('');
      setNueva('');
      setRepetir('');
      setAviso('Tu contraseña quedó cambiada.');
    } catch (error: unknown) {
      setAviso(texto(error));
    } finally {
      setGuardando(false);
    }
  }

  if (!cuenta) return <section className="ficha">{aviso ? <p className="error">{aviso}</p> : <p>Cargando tu cuenta…</p>}</section>;

  return (
    <section className="ficha cuentas">
      <article className="cuenta-ficha propia">
        <header>
          <span className="cuenta-avatar grande" aria-hidden="true">
            {iniciales(nombre || cuenta.nombre)}
          </span>
          <div>
            <h2>{cuenta.nombre}</h2>
            <p>{etiquetaRol(cuenta.rol)}</p>
          </div>
        </header>
        <form className="cuenta-campos" onSubmit={(evento) => void guardar(evento)}>
          <label htmlFor="perfil-nombre">
            Nombre
            <input id="perfil-nombre" value={nombre} onChange={(evento) => setNombre(evento.target.value)} required />
          </label>
          <label htmlFor="perfil-correo">
            Correo
            <input id="perfil-correo" value={cuenta.correo} disabled />
          </label>
          <label htmlFor="perfil-telefono">
            WhatsApp
            <input id="perfil-telefono" inputMode="tel" value={telefono} placeholder="51900000000" onChange={(evento) => setTelefono(evento.target.value)} />
          </label>
          <p className="meta">Si eres técnico, con este número recibes las tareas y anotas desde el chat.</p>
          <button type="submit" className="primario" disabled={guardando}>
            Guardar datos
          </button>
        </form>
        <form className="cuenta-campos" onSubmit={(evento) => void cambiar(evento)}>
          <h3>Cambiar contraseña</h3>
          <label htmlFor="clave-actual">
            Contraseña actual
            <input id="clave-actual" type="password" value={actual} onChange={(evento) => setActual(evento.target.value)} required />
          </label>
          <label htmlFor="clave-nueva">
            Contraseña nueva
            <input id="clave-nueva" type="password" value={nueva} minLength={8} onChange={(evento) => setNueva(evento.target.value)} required />
          </label>
          <label htmlFor="clave-repetir">
            Repetir contraseña
            <input id="clave-repetir" type="password" value={repetir} minLength={8} onChange={(evento) => setRepetir(evento.target.value)} required />
          </label>
          <button type="submit" disabled={guardando}>
            Cambiar contraseña
          </button>
        </form>
        {aviso ? <p className={aviso.startsWith('Tu') ? 'meta' : 'error'}>{aviso}</p> : null}
      </article>
    </section>
  );
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '');
  return (letras || '?').toUpperCase();
}

function etiquetaRol(rol: string): string {
  if (rol === 'superusuario') return 'Superusuario';
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'tecnico') return 'Técnico';
  return 'Operador';
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
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string | string[] } | null;
    const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message.join(' ') : cuerpo?.message;
    throw new Error(mensaje ?? 'No se pudo completar la operación.');
  }
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

function texto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
