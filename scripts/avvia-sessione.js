// Avvia una sessione di gioco con un solo comando (npm run sessione):
// 1. compila l'app se il codice è cambiato dall'ultima build
// 2. apre un tunnel Cloudflare (link pubblico HTTPS verso questo PC, nessun account)
// 3. avvia il server in produzione e stampa link + QR da condividere con i giocatori
// Ctrl+C chiude tutto (il server salva le stanze prima di uscire).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || '3000';
const TUNNEL_TIMEOUT_MS = 60_000;

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

// cloudflared va installato una volta sola
if (spawnSync('cloudflared', ['--version']).error) {
  fail(
    'cloudflared non è installato. Installalo una volta con:\n\n' +
      `    ${process.platform === 'darwin' ? 'brew install cloudflared' : 'winget install --id Cloudflare.cloudflared'}\n\n` +
      'poi chiudi e riapri il terminale e rilancia: npm run sessione'
  );
}

// La porta deve essere libera: di solito è occupata da un "npm run dev" rimasto aperto
const portCheck = spawnSync(process.execPath, [
  '-e',
  `require('net').createServer().once('error', () => process.exit(1)).listen(${PORT}, function () { this.close(); })`,
]);
if (portCheck.status !== 0) {
  fail(`La porta ${PORT} è già in uso (forse c'è "npm run dev" aperto?). Chiudilo e rilancia: npm run sessione`);
}

// Data dell'ultima modifica tra i file che finiscono nella build
const newestSourceTime = () => {
  let newest = 0;
  const visit = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) fs.readdirSync(target).forEach((name) => visit(path.join(target, name)));
    else newest = Math.max(newest, stat.mtimeMs);
  };
  ['app', 'components', 'lib', 'package.json', 'next.config.mjs', 'tailwind.config.ts'].forEach((p) =>
    visit(path.join(ROOT, p))
  );
  return newest;
};

const buildId = path.join(ROOT, '.next', 'BUILD_ID');
if (!fs.existsSync(buildId) || fs.statSync(buildId).mtimeMs < newestSourceTime()) {
  console.log('▶ Il codice è cambiato: compilo l\'app (circa un minuto)...');
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (build.status !== 0) fail('Compilazione non riuscita: guarda gli errori qui sopra.');
}

console.log('▶ Apro il tunnel Cloudflare...');
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
let server = null;

const timeout = setTimeout(() => {
  tunnel.kill();
  fail('Il tunnel non ha risposto entro 60 secondi. Controlla la connessione a internet e riprova.');
}, TUNNEL_TIMEOUT_MS);

// cloudflared scrive il link pubblico nei suoi log (stderr)
let tunnelLog = '';
const onTunnelOutput = (chunk) => {
  if (server) return;
  tunnelLog += chunk.toString();
  const match = tunnelLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  clearTimeout(timeout);
  startServer(match[0]);
};
tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('exit', (code) => {
  if (!server) fail(`Il tunnel si è chiuso (codice ${code}). Ultimi log:\n${tunnelLog.slice(-1500)}`);
});

function startServer(publicUrl) {
  console.log('▶ Avvio il server...');
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--production'], {
    cwd: ROOT,
    env: { ...process.env, PORT, PUBLIC_URL: publicUrl },
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  let announced = false;
  server.stdout.on('data', async (chunk) => {
    process.stdout.write(chunk);
    if (announced || !chunk.toString().includes('Ready on')) return;
    announced = true;
    const qr = await QRCode.toString(publicUrl, { type: 'terminal', small: true });
    console.log(`
════════════════════════════════════════════════════════════
  ✔ Sessione pronta!

  Link per i giocatori:  ${publicUrl}
  (oppure inquadrate il QR qui sotto, o quello del pulsante
   "Invita" nella stanza del Master)

${qr}
  Master: si apre http://localhost:${PORT} nel browser.
  Per chiudere la sessione: Ctrl+C
════════════════════════════════════════════════════════════
`);
    openBrowser(`http://localhost:${PORT}`);
  });

  server.on('exit', (code) => {
    tunnel.kill();
    process.exit(code ?? 0);
  });
}

function openBrowser(url) {
  const command =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command[0], command[1], { stdio: 'ignore', detached: true }).unref();
}

// Ctrl+C arriva anche al server e al tunnel (stessa console): qui si aspetta solo che il server
// abbia salvato le stanze ed esca (vedi server.on('exit')). Il timer evita di restare appesi.
process.on('SIGINT', () => {
  console.log('\n▶ Chiudo la sessione, salvo le stanze...');
  if (!server) {
    tunnel.kill();
    process.exit(0);
  }
  setTimeout(() => {
    server.kill();
    tunnel.kill();
    process.exit(0);
  }, 5000).unref();
});
