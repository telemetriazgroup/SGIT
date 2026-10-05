export type AvisoSalida = { id: string; destino: string; cuerpo: string };

export function crearClienteBot(base: string, clave: string) {
  const cabeza = { 'content-type': 'application/json', 'x-bot-clave': clave };

  return {
    async reclamar(dueno: string): Promise<boolean> {
      const respuesta = await fetch(`${base}/bot/lider`, { method: 'POST', headers: cabeza, body: JSON.stringify({ dueno }) });
      return respuesta.ok;
    },
    async soltar(dueno: string): Promise<void> {
      await fetch(`${base}/bot/lider/soltar`, { method: 'POST', headers: cabeza, body: JSON.stringify({ dueno }) });
    },
    async publicar(estado: string): Promise<void> {
      await fetch(`${base}/bot/sesion`, { method: 'POST', headers: cabeza, body: JSON.stringify({ estado }) });
    },
    async pedirReinicio(): Promise<boolean> {
      const respuesta = await fetch(`${base}/bot/reinicio`, { headers: { 'x-bot-clave': clave } });
      if (!respuesta.ok) return false;
      const cuerpo = (await respuesta.json()) as { reiniciar?: boolean };
      return Boolean(cuerpo.reiniciar);
    },
    async tomar(): Promise<AvisoSalida | null> {
      const respuesta = await fetch(`${base}/bot/salida`, { headers: { 'x-bot-clave': clave } });
      if (respuesta.status === 204) return null;
      if (!respuesta.ok) return null;
      return (await respuesta.json()) as AvisoSalida;
    },
    async confirmar(id: string): Promise<void> {
      const respuesta = await fetch(`${base}/bot/salida/${id}/enviado`, { method: 'POST', headers: { 'x-bot-clave': clave } });
      if (!respuesta.ok) throw new Error(`confirmar ${respuesta.status}`);
    },
    async entrar(
      telefono: string,
      texto: string,
      archivo: { nombre: string; mime: string; contenido: string } | null,
    ): Promise<{ respuesta: string; archivo?: { nombre: string; mime: string; contenido: string } | null }> {
      const respuesta = await fetch(`${base}/bot/entrar`, {
        method: 'POST',
        headers: cabeza,
        body: JSON.stringify({ telefono, texto, archivo }),
      });
      if (!respuesta.ok) return { respuesta: '' };
      return (await respuesta.json()) as { respuesta: string; archivo?: { nombre: string; mime: string; contenido: string } | null };
    },
  };
}
