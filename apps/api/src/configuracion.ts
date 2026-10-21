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
  claveCifrado: string;
  iniciarSync: boolean;
  gmail: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    correo: string;
  } | null;
  odoo: LecturaOdoo | null;
};

export type LecturaOdoo = {
  url: string;
  db: string;
  usuario: string;
  clave: string;
  venta: { modelo: string; campo: string };
  tarea: { modelo: string };
  sesion?: { usuario: string; clave: string };
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
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const port = Number(env.PORT ?? 18003);

  return {
    port,
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
    claveCifrado: env.CLAVE_CIFRADO?.trim() || env.SESION_SECRETO!.trim(),
    iniciarSync: env.INICIAR_SYNC === 'true',
    gmail:
      clientId && clientSecret
        ? {
            clientId,
            clientSecret,
            redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || `http://localhost:${port}/buzon/oauth/callback`,
            correo: (env.GMAIL_CORREO?.trim() || 'telemetria@zgroup.com.pe').toLowerCase(),
          }
        : null,
    odoo: lecturaOdoo(env),
  };
}

function lecturaOdoo(env: NodeJS.ProcessEnv): LecturaOdoo | null {
  const url = env.ODOO_URL?.trim().replace(/\/$/, '') ?? '';
  const db = env.ODOO_DB?.trim() ?? '';
  const usuario = env.ODOO_USUARIO?.trim() ?? '';
  const clave = env.ODOO_CLAVE?.trim() ?? '';
  if (!url || !db || !usuario || !clave) return null;
  const modeloVenta = env.ODOO_MODELO_VENTA?.trim() ?? '';
  const campoCot = env.ODOO_CAMPO_COT?.trim() ?? '';
  const modeloTarea = env.ODOO_MODELO_TICKET?.trim() ?? '';
  return {
    url,
    db,
    usuario,
    clave,
    venta: {
      modelo: /^[a-z][a-z0-9_.]*\.[a-z0-9_.]+$/i.test(modeloVenta) ? modeloVenta : 'sale.order',
      campo: /^[a-z_][a-z0-9_]*$/i.test(campoCot) ? campoCot : 'name',
    },
    tarea: { modelo: /^[a-z][a-z0-9_.]*\.[a-z0-9_.]+$/i.test(modeloTarea) ? modeloTarea : 'project.task' },
  };
}
