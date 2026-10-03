import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

function ignorado(ruta: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', ruta], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('sessions y .env quedan fuera del índice', () => {
  assert.equal(ignorado('.env'), true);
  assert.equal(ignorado('sessions/wwebjs/session'), true);
  assert.equal(ignorado('sessions/qr.png'), true);
  assert.equal(ignorado('sessions/estado.json'), true);
  assert.equal(ignorado('package.json'), false);
});
