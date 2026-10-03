export type RolSemilla = 'operador' | 'administrador';

export type Configuracion = {
  port: number;
  webOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  sesionSecreto: string;
  semilla: {
    nombre: string;
    correo: string;
    password: string;
    rol: RolSemilla;
  };
};

const OBLIGATORIAS = [
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'SESION_SECRETO',
  'SEED_OPERATOR_CORREO',
  'SEED_OPERATOR_PASSWORD',
] as const;

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const faltan = OBLIGATORIAS.filter((clave) => !env[clave]?.trim());
  if (faltan.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}. Copia .env.example a .env.`);
  }

  const rol = env.SEED_OPERATOR_ROL === 'administrador' ? 'administrador' : 'operador';

  return {
    port: Number(env.PORT ?? 18003),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:18004',
    databaseUrl: env.DATABASE_URL!.trim(),
    redisUrl: env.REDIS_URL!.trim(),
    s3Endpoint: env.S3_ENDPOINT!.trim(),
    s3Region: env.S3_REGION?.trim() || 'us-east-1',
    s3Bucket: env.S3_BUCKET!.trim(),
    s3AccessKey: env.S3_ACCESS_KEY!.trim(),
    s3SecretKey: env.S3_SECRET_KEY!.trim(),
    sesionSecreto: env.SESION_SECRETO!.trim(),
    semilla: {
      nombre: env.SEED_OPERATOR_NOMBRE?.trim() || 'Operador de prueba',
      correo: env.SEED_OPERATOR_CORREO!.trim().toLowerCase(),
      password: env.SEED_OPERATOR_PASSWORD!,
      rol,
    },
  };
}
