import { useEffect, useState } from 'react';
import type { SesionPublica } from '@sgit/shared';
import { Bandeja } from './Bandeja';
import { Ingreso } from './Ingreso';
import { Materiales } from './Materiales';
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
    }).then(async (respuesta) => {
      if (!vigente) return;
      if (!respuesta.ok) {
        olvidarSesion();
        setSesion(null);
        return;
      }
      const cuerpo = (await respuesta.json().catch(() => null)) as { virtual?: SesionPublica['virtual'] } | null;
      setSesion((actual) => {
        if (!actual) return actual;
        const viene = cuerpo?.virtual?.correo ?? '';
        const tenia = actual.virtual?.correo ?? '';
        if (viene === tenia) return actual;
        const siguiente = cuerpo?.virtual ? { ...actual, virtual: cuerpo.virtual } : { token: actual.token, usuario: actual.usuario };
        guardarSesion(siguiente);
        return siguiente;
      });
    });
    return () => {
      vigente = false;
    };
  }, [apiUrl, sesion]);

  const materiales = new URLSearchParams(window.location.search).get('materiales');
  if (materiales && apiUrl) return <Materiales apiUrl={apiUrl} token={materiales} />;

  if (sesion && apiUrl) {
    return (
      <Bandeja
        key={sesion.usuario.correo}
        apiUrl={apiUrl}
        sesion={sesion}
        onSalir={() => {
          olvidarSesion();
          setSesion(null);
        }}
        onSesion={(nueva) => {
          guardarSesion(nueva);
          setSesion(nueva);
        }}
        onNombre={(nombre) => {
          setSesion((actual) => {
            if (!actual) return actual;
            const siguiente = { ...actual, usuario: { ...actual.usuario, nombre } };
            guardarSesion(siguiente);
            return siguiente;
          });
        }}
      />
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
