export type Cita = {
  fecha: string | null;
  hora: string | null;
  direccion: string | null;
};

export type EfectoCita = {
  reprograma: boolean;
  fecha: string | null;
  hora: string | null;
  direccion: string | null;
  anterior: Cita | null;
};

export function evaluarCita(vigente: Cita, propuesta: Cita): EfectoCita {
  const fecha = fechaUtil(vigente, propuesta.fecha, propuesta.hora);
  const hora = textoUtil(propuesta.hora);
  const direccion = direccionUtil(propuesta.direccion);
  const cambiaFecha = Boolean(fecha && vigente.fecha && fecha !== vigente.fecha);
  const cambiaHora = Boolean(hora && vigente.hora && hora !== vigente.hora);
  const cambiaDireccion = Boolean(direccion && vigente.direccion && plano(direccion) !== plano(vigente.direccion));
  const reprograma = cambiaFecha || cambiaHora || cambiaDireccion;
  return {
    reprograma,
    fecha: fecha && fecha !== vigente.fecha ? fecha : null,
    hora: hora && hora !== vigente.hora ? hora : null,
    direccion: direccion && plano(direccion) !== plano(vigente.direccion ?? '') ? direccion : null,
    anterior: reprograma ? { fecha: vigente.fecha, hora: vigente.hora, direccion: vigente.direccion } : null,
  };
}

function fechaUtil(vigente: Cita, fecha: string | null, hora: string | null): string | null {
  if (!fecha) return null;
  if (vigente.fecha && vigente.hora && !hora) return null;
  return fecha;
}

function textoUtil(valor: string | null): string | null {
  const limpio = valor?.trim() ?? '';
  return limpio || null;
}

function direccionUtil(valor: string | null): string | null {
  const limpio = (valor ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[<>*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—.:]+/, '')
    .trim();
  if (limpio.length < 8) return null;
  return limpio;
}

function plano(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim().toLowerCase();
}
