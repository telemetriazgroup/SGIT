import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { PanelQr } from '../src/Qr';

describe('pestaña de código QR', () => {
  test('pide enlace y logo, y la descarga espera a que se genere', async () => {
    const usuario = userEvent.setup();
    render(<PanelQr />);
    expect(screen.getByRole('heading', { name: 'Código QR' })).toBeTruthy();
    await usuario.type(screen.getByLabelText('Enlace'), 'https://ztrack.app/SGIT');
    await usuario.click(screen.getByRole('button', { name: 'Generar' }));
    expect(screen.getByRole('alert').textContent).toMatch(/logo/i);
    expect((screen.getByRole('button', { name: 'Descargar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
