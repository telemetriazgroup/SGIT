import puppeteer from 'puppeteer-core';

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome';
const web = process.env.WEB_URL || 'http://localhost:18004';
const correo = process.env.SEED_OPERATOR_CORREO || 'operador@sgit.local';
const contrasena = process.env.SEED_OPERATOR_PASSWORD || 'operador-prueba';

const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const pagina = await navegador.newPage();
  await pagina.goto(web, { waitUntil: 'networkidle0' });
  await pagina.waitForSelector('h1');
  const titulo = await pagina.$eval('h1', (nodo) => nodo.textContent);
  if (titulo !== 'SGIT') {
    throw new Error(`La pantalla de ingreso no cargó. Título: ${titulo}`);
  }
  const alertaConfig = await pagina.$eval('body', (nodo) => nodo.textContent?.includes('VITE_API_URL') ?? false);
  if (alertaConfig) {
    throw new Error('La web cargó con error de configuración.');
  }

  await pagina.type('#correo', 'nadie@sgit.local');
  await pagina.type('#contrasena', 'no-existe');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('[role="alert"]');

  await pagina.click('#correo', { clickCount: 3 });
  await pagina.type('#correo', correo);
  await pagina.click('#contrasena', { clickCount: 3 });
  await pagina.type('#contrasena', contrasena);
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(() => document.body.textContent?.includes('Sesión iniciada'));
  const texto = await pagina.$eval('body', (nodo) => nodo.textContent ?? '');
  if (!texto.includes('Operador de prueba')) {
    throw new Error(`El operador no quedó en sesión. Texto: ${texto}`);
  }
  console.log('Ingreso verificado en el navegador.');
} finally {
  await navegador.close();
}
