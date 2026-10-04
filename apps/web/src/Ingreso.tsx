import { FormEvent, useState } from 'react';
import type { SesionPublica } from '@sgit/shared';
import { Logo } from './Logo';
import { entrar } from './sesion';

type Props = {
  apiUrl: string | null;
  onSesion: (sesion: SesionPublica) => void;
};

export function Ingreso({ apiUrl, onSesion }: Props) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!apiUrl) return;
    setEnviando(true);
    setError(null);
    try {
      onSesion(await entrar(apiUrl, correo, contrasena));
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo ingresar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="ingreso">
      <p className="marca">ZGroup · Desarrollo</p>
      <Logo palabra={false} />
      <h1>SGIT</h1>
      <p className="bajada">Sistema de gestión de instalación de telemetrías</p>
      {apiUrl === null ? (
        <p className="error" role="alert">
          Falta configurar la dirección del API (VITE_API_URL).
        </p>
      ) : (
        <form onSubmit={alEnviar}>
          <label htmlFor="correo">Correo</label>
          <input
            id="correo"
            name="correo"
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            required
          />
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            name="contrasena"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
            required
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      )}
    </main>
  );
}
