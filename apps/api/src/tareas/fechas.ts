import { evaluarCita, type Cita } from './cita';
import { normalizarFecha, normalizarHora } from './texto';

export type FormaFecha = {
  nombre: string;
  ejemplo: string;
  queda: string;
  nota: string;
};

/** Formas que el lector de citas acepta. El ejemplo tiene que seguir saliendo en `queda`. */
export const FORMAS_FECHA: FormaFecha[] = [
  { nombre: 'Día, mes y año con barras', ejemplo: '12/09/2026', queda: '12/09/2026', nota: 'También vale con un solo dígito: 2/9/2026.' },
  { nombre: 'Con guiones', ejemplo: '12-09-2026', queda: '12/09/2026', nota: 'El separador puede ser guion.' },
  { nombre: 'Con puntos', ejemplo: '12.09.2026', queda: '12/09/2026', nota: 'El separador puede ser punto.' },
  { nombre: 'Año en dos dígitos', ejemplo: '12/09/26', queda: '12/09/2026', nota: 'El año corto se lee como 20xx.' },
  { nombre: 'Día y mes escrito', ejemplo: '12 de septiembre de 2026', queda: '12/09/2026', nota: 'Acepta “setiembre”. El “de” puede faltar: 12 septiembre 2026.' },
  { nombre: 'Día y mes, sin año', ejemplo: '12/09', queda: '12/09/2026', nota: 'Usa el año del correo. También 12-09 y 12.09.' },
  { nombre: 'Día y mes escrito, sin año', ejemplo: '12 de septiembre', queda: '12/09/2026', nota: 'Usa el año del correo.' },
  { nombre: 'Hora de la mañana', ejemplo: '10 AM', queda: '10:00', nota: 'También 10:00 a.m. y 10:00 am.' },
  { nombre: 'Hora en reloj de 24 horas', ejemplo: '22:00', queda: '22:00', nota: 'Si no dice a.m. ni p.m., se toma tal cual.' },
  { nombre: 'Hora de la tarde', ejemplo: '3:30 p.m.', queda: '15:30', nota: '12 a.m. queda en 00:00 y 12 p.m. en 12:00.' },
];

export type FormaReconocida = FormaFecha & { reconocida: boolean };

export function catalogoFechas(anio = 2026): FormaReconocida[] {
  return FORMAS_FECHA.map((forma) => {
    const hora = normalizarHora(forma.ejemplo);
    const fecha = normalizarFecha(forma.ejemplo, anio).valor;
    const leida = hora && forma.queda.includes(':') ? hora : fecha;
    return { ...forma, reconocida: leida === forma.queda };
  });
}

export function plegarCita(vigente: Cita, propuesta: Cita): Cita {
  const efecto = evaluarCita(vigente, propuesta);
  return {
    fecha: efecto.fecha ?? vigente.fecha,
    hora: efecto.hora ?? vigente.hora,
    direccion: efecto.direccion ?? vigente.direccion,
  };
}
