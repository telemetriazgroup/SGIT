import { useEffect, useState } from 'react';
import type { SesionPublica } from '@sgit/shared';
import { Ingreso } from './Ingreso';
import { leerSesionGuardada, olvidarSesion, guardarSesion } from './sesion';
import { urlDelApi } from './url-api';

export function App() {
  const apiUrl = urlDelApi();
  const [sesion, setSesion] = useState<SesionPublica | null>(() => leerSesionGuardada());

  useEffect(() => {
    if (!sesion || !apiUrl) return;
    let vigente = true;
    fetch(`${apiUrl}/sesion`, {
      headers: { authorization: `Bearer ${sesion.token}` },
    }).then((respuesta) => {
      if (!vigente) return;
      if (!respuesta.ok) {
        olvidarSesion();
        setSesion(null);
      }
    });
    return () => {
      vigente = false;
    };
  }, [apiUrl, sesion]);

  if (sesion) {
    return (
      <main className="inicio">
        <header>
          <div>
            <p className="marca">SGIT</p>
            <h1>Sesión iniciada</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              olvidarSesion();
              setSesion(null);
            }}
          >
            Salir
          </button>
        </header>
        <p>
          {sesion.usuario.nombre} · {sesion.usuario.rol}
        </p>
        <p className="bajada">La bandeja de correos llega en el sprint 1.</p>
      </main>
    );
  }

  return (
    <Ingreso
      apiUrl={apiUrl}
      onSesion={(nueva) => {
        guardarSesion(nueva);
        setSesion(nueva);
      }}
    />
  );
}
