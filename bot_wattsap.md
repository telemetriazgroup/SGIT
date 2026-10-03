El bot no usa la API oficial de Meta (Cloud API). Usa un cliente no oficial que emula WhatsApp Web.

Stack
Pieza	Qué es
whatsapp-web.js ^1.34
Librería Node que controla web.whatsapp.com
Puppeteer + Chromium
Abre Chrome headless, carga WhatsApp Web y automatiza la sesión
LocalAuth
Guarda la sesión en disco (sessions/wwebjs/) para no escanear QR cada reinicio
Código de referencia: src/bot.js — Client + LocalAuth + puppeteer.executablePath (Chromium del contenedor).

Cómo funciona (para un programador)
Arranca Chromium en el servidor.
Navega a WhatsApp Web.
Si no hay sesión → emite evento qr → el teléfono escanea (mismo flujo que vincular WhatsApp Web en el PC).
Si hay sesión en sessions/wwebjs → reutiliza cookies/auth y queda ready.
Entrantes: evento message → handlers.js.
Salientes: client.sendMessage(chatId, texto|media) vía el adapter getSock() / outbox.
Es decir: una sesión de WhatsApp Web remota, no un Business API con tokens de Meta.

Implicaciones importantes
Depende de que WhatsApp Web no cambie el front (puede romper con updates de WA).
Riesgo de ban si se hace blast/spam (por eso el outbox con gaps).
No hay webhooks oficiales: la conexión es persistente (proceso Node + Chromium vivos).
El “número del bot” es el WhatsApp vinculado al QR (cuenta personal o business vinculada a Web).
Para usar el mismo staff en otro proyecto
npm i whatsapp-web.js qrcode
# + Chromium/Chrome en el host o Docker
const { Client, LocalAuth } = require('whatsapp-web.js')
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'mi-bot', dataPath: './sessions/wwebjs' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
})
client.on('qr', qr => { /* mostrar QR */ })
client.on('ready', () => console.log('conectado'))
client.on('message', async msg => { /* inbound */ })
await client.initialize()
// outbound: await client.sendMessage('51999999999@c.us', 'hola')
