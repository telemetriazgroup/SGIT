import path from 'path';

export function raizDelRepo(): string {
  return path.resolve(__dirname, '../../..');
}

export function rutaDeSesion(): string {
  const relativa = process.env.BOT_SESSION_PATH?.trim() || 'sessions/wwebjs';
  return path.isAbsolute(relativa) ? relativa : path.resolve(raizDelRepo(), relativa);
}

export function directorioDeEstado(): string {
  return path.resolve(raizDelRepo(), 'sessions');
}
