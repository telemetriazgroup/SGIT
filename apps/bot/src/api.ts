export type CapturaMensaje = {
  tipoProceso: string;
  tipoWhatsapp: string;
  tieneMedia: boolean;
  mime: string;
  nombre: string;
  texto: string;
  leyenda: string;
  ruta: boolean;
  claveMedia: boolean;
  etapa: string;
  bytes: number;
  esPdf: boolean;
  error: string;
  decision: string;
  claves: string;
};

export type AvisoSalida = {
  id: string;
  destino: string;
  cuerpo: string;
  imagenes?: Array<{ nombre: string; mime: string; contenido: string }>;
};

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
    async pedirReinicio(): Promise<{ reiniciar: boolean; olvidar: boolean }> {
      const respuesta = await fetch(`${base}/bot/reinicio`, { headers: { 'x-bot-clave': clave } });
      if (!respuesta.ok) return { reiniciar: false, olvidar: false };
      const cuerpo = (await respuesta.json()) as { reiniciar?: boolean; olvidar?: boolean };
      return { reiniciar: Boolean(cuerpo.reiniciar), olvidar: Boolean(cuerpo.olvidar) };
    },
    async bitacora(nivel: 'info' | 'fallo', texto: string): Promise<void> {
      await fetch(`${base}/bot/bitacora`, { method: 'POST', headers: cabeza, body: JSON.stringify({ nivel, texto }) });
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
    async soltarAviso(id: string): Promise<void> {
      await fetch(`${base}/bot/salida/${id}/soltar`, { method: 'POST', headers: { 'x-bot-clave': clave } });
    },
    async fallo(texto: string): Promise<void> {
      await fetch(`${base}/bot/fallo`, { method: 'POST', headers: cabeza, body: JSON.stringify({ texto }) });
    },
    async entrar(
      telefono: string,
      texto: string,
      archivo: { nombre: string; mime: string; contenido: string } | null,
      archivos: Array<{ nombre: string; mime: string; contenido: string }> = [],
      captura: CapturaMensaje | null = null,
    ): Promise<{ respuesta: string; archivo?: { nombre: string; mime: string; contenido: string } | null }> {
      const respuesta = await fetch(`${base}/bot/entrar`, {
        method: 'POST',
        headers: cabeza,
        body: JSON.stringify({ telefono, texto, archivo, archivos, captura }),
      });
      if (!respuesta.ok) return { respuesta: '' };
      return (await respuesta.json()) as { respuesta: string; archivo?: { nombre: string; mime: string; contenido: string } | null };
    },
    async capturarImpresion(telefono: string, captura: CapturaMensaje): Promise<void> {
      await fetch(`${base}/bot/impresion/captura`, {
        method: 'POST',
        headers: cabeza,
        body: JSON.stringify({ telefono, captura }),
      });
    },
  };
}
