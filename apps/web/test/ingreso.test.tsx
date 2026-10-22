import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Ingreso } from '../src/Ingreso';
import { urlDelApi } from '../src/url-api';

describe('pantalla de ingreso', () => {
  test('abre el formulario cuando el API está configurado', () => {
    render(<Ingreso apiUrl="http://localhost:3000" onSesion={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'SGIT' })).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeTruthy();
    expect(screen.queryByText(/VITE_API_URL/)).toBeNull();
  });

  test('avisa si falta la dirección del API', () => {
    render(<Ingreso apiUrl={null} onSesion={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toMatch(/VITE_API_URL/);
    expect(screen.queryByRole('button', { name: 'Ingresar' })).toBeNull();
  });

  test('un usuario inexistente no entra y el operador de prueba sí', async () => {
    const usuario = userEvent.setup();
    const onSesion = vi.fn();
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url: string, opciones?: RequestInit) => {
      const cuerpo = JSON.parse(String(opciones?.body)) as { correo: string };
      if (cuerpo.correo === 'operador@sgit.local') {
        return new Response(
          JSON.stringify({
            token: 'token-de-prueba',
            usuario: { nombre: 'Operador de prueba', correo: cuerpo.correo, rol: 'operador' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ message: 'Correo o contraseña incorrectos.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    function Pantalla() {
      const [nombre, setNombre] = useState<string | null>(null);
      if (nombre) return <p>Sesión iniciada {nombre}</p>;
      return (
        <Ingreso
          apiUrl="http://localhost:3000"
          onSesion={(sesion) => {
            onSesion(sesion);
            setNombre(sesion.usuario.nombre);
          }}
        />
      );
    }

    try {
      render(<Pantalla />);
      await usuario.type(screen.getByLabelText('Correo'), 'nadie@sgit.local');
      await usuario.type(screen.getByLabelText('Contraseña'), 'no-existe');
      await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
      expect((await screen.findByRole('alert')).textContent).toContain('Correo o contraseña incorrectos.');
      expect(onSesion).not.toHaveBeenCalled();

      await usuario.clear(screen.getByLabelText('Correo'));
      await usuario.clear(screen.getByLabelText('Contraseña'));
      await usuario.type(screen.getByLabelText('Correo'), 'operador@sgit.local');
      await usuario.type(screen.getByLabelText('Contraseña'), 'operador-prueba');
      await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
      expect(await screen.findByText('Sesión iniciada Operador de prueba')).toBeTruthy();
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

test('la URL del API queda definida', () => {
  const url = urlDelApi();
  expect(url).toMatch(/^https?:\/\/.+/);
});

test('en este equipo el API sigue en localhost', () => {
  expect(urlDelApi({ protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:18003/SGIT');
});

test('desde otro equipo el ingreso sale por la misma pantalla', () => {
  expect(urlDelApi({ protocol: 'http:', hostname: '161.132.53.51', port: '18004' })).toBe(
    'http://161.132.53.51:18004/servicio',
  );
});
