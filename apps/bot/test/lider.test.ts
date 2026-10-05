import assert from 'node:assert/strict';
import test from 'node:test';
import { puedeTomar } from '../src/lider';

test('un segundo proceso no toma la sesión mientras el líder sigue vigente', () => {
  const ahora = Date.parse('2026-10-05T12:00:00-05:00');
  assert.equal(puedeTomar(null, 'uno', ahora), true);
  assert.equal(puedeTomar({ dueno: 'uno', vence: ahora + 30_000 }, 'dos', ahora + 1000), false);
  assert.equal(puedeTomar({ dueno: 'uno', vence: ahora + 30_000 }, 'uno', ahora + 10_000), true);
  assert.equal(puedeTomar({ dueno: 'uno', vence: ahora + 30_000 }, 'dos', ahora + 30_000), true);
});
