import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAccess, hasAccess, withVercelAccess } from '../server/vercel-access.mjs';
const env = { CAUSA_ACCESS_PASSWORD: 'test-only-credential-with-at-least-32-characters' };
const origin = 'https://causa.example';
const login = (password, source = origin) => new Request(`${origin}/api/access`, { method: 'POST', headers: { origin: source, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }) });

test('Vercel live API rejects forged platform identity and missing access configuration', async () => {
  let called = false;
  const handler = withVercelAccess(() => { called = true; return new Response('ok'); });
  const request = new Request(`${origin}/api/planner`, { method: 'POST', headers: { 'oai-authenticated-user-id': 'forged' }, body: '{}' });
  assert.equal((await handler(request, env)).status, 401);
  assert.equal(called, false);
  assert.equal((await handleAccess(login(env.CAUSA_ACCESS_PASSWORD), {})).status, 503);
});

test('Access code checks origin and password; signed cookie expires and resists tampering', async () => {
  assert.equal((await handleAccess(login('wrong'), env)).status, 401);
  assert.equal((await handleAccess(login(env.CAUSA_ACCESS_PASSWORD, 'https://other.example'), env)).status, 403);
  const response = await handleAccess(login(env.CAUSA_ACCESS_PASSWORD), env);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const request = new Request(`${origin}/api/planner`, { method: 'POST', headers: { cookie: cookie.split(';')[0] }, body: '{}' });
  assert.equal(hasAccess(request, env), true);
  assert.equal(hasAccess(request, env, Date.now() + 13 * 3600 * 1000), false);
  assert.equal(hasAccess(request, { CAUSA_ACCESS_PASSWORD: 'a-different-credential-at-least-32-characters' }), false);
  let identity;
  const handler = withVercelAccess(req => { identity = req.headers.get('oai-authenticated-user-id'); return new Response('ok'); });
  assert.equal((await handler(request, env)).status, 200);
  assert.equal(identity, 'vercel-demo');
});

test('Public status strips untrusted identity and login bounds its body', async () => {
  const handler = withVercelAccess(req => Response.json({ identity: req.headers.get('oai-authenticated-user-id') }));
  const response = await handler(new Request(`${origin}/api/planner`, { headers: { 'oai-authenticated-user-id': 'forged' } }), env);
  assert.deepEqual(await response.json(), { identity: null });
  assert.equal((await handleAccess(login('x'.repeat(2000)), env)).status, 413);
});
