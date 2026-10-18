const ZONA = 'America/Lima';

export type TareaBarrido = {
  estado: string;
  seguimiento: boolean;
  recordarEn: Date | null;
};

export function barridoCorre(instante: Date, feriados: ReadonlySet<string>): boolean {
  const partes = partesLima(instante);
  if (partes.semana === 0 || partes.semana === 6) return false;
  if (feriados.has(partes.fecha)) return false;
  const minutos = partes.hora * 60 + partes.minuto;
  return minutos >= 8 * 60 && minutos < 18 * 60;
}

export function claveHora(instante: Date): string {
  const partes = partesLima(instante);
  return `${partes.fecha}T${String(partes.hora).padStart(2, '0')}`;
}

export function turnoCorre(instante: Date, feriados: ReadonlySet<string>): boolean {
  const partes = partesLima(instante);
  if (partes.semana === 0 || partes.semana === 6) return false;
  if (feriados.has(partes.fecha)) return false;
  const minutos = partes.hora * 60 + partes.minuto;
  return minutos >= 8 * 60 + 30 && minutos < 18 * 60;
}

export function entraHoraria(tarea: TareaBarrido, instante: Date, feriados: ReadonlySet<string>): boolean {
  if (!barridoCorre(instante, feriados)) return false;
  if (tarea.estado !== 'detectada' || tarea.seguimiento) return false;
  if (tarea.recordarEn && tarea.recordarEn.getTime() > instante.getTime()) return false;
  return true;
}

export function snoozeDispara(recordarEn: Date | null, instante: Date): boolean {
  if (!recordarEn) return false;
  return recordarEn.getTime() <= instante.getTime();
}

export function partesLima(instante: Date): { fecha: string; hora: number; minuto: number; semana: number } {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  const horaTexto = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instante);
  const [hora, minuto] = horaTexto.split(':').map(Number);
  const semana = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'short' }).format(instante);
  const indice = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(semana);
  return { fecha, hora, minuto, semana: indice };
}
