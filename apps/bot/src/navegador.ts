import { execFile } from 'child_process';

export function cerrarNavegadorDeSesion(): Promise<number> {
  return new Promise((resolver) => {
    execFile('ps', ['-eo', 'pid,args'], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error || !stdout) {
        resolver(0);
        return;
      }
      let cerrados = 0;
      for (const linea of stdout.split('\n')) {
        if (!linea.includes('session-sgit-lab') || linea.includes('session-zgroup-bot')) continue;
        if (!/chrome|chromium/i.test(linea)) continue;
        const pid = Number(linea.trim().split(/\s+/)[0]);
        if (!pid || pid === process.pid) continue;
        try {
          process.kill(pid, 'SIGKILL');
          cerrados += 1;
        } catch {
          // El navegador ya no está.
        }
      }
      resolver(cerrados);
    });
  });
}
