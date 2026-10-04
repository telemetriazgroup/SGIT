import { useEffect, useState } from 'react';
import type { SesionPublica } from '@sgit/shared';
import { Bandeja } from './Bandeja';
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

  if (sesion && apiUrl) {
    return (
      <Bandeja
        apiUrl={apiUrl}
        sesion={sesion}
        onSalir={() => {
          olvidarSesion();
          setSesion(null);
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
