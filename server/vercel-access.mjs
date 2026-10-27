import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const COOKIE = '__Host-causa-access';
const TTL = 12 * 60 * 60;
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
const configured = env => typeof env.CAUSA_ACCESS_PASSWORD === 'string' && env.CAUSA_ACCESS_PASSWORD.length >= 32;
const sign = (payload, env) => createHmac('sha256', env.CAUSA_ACCESS_PASSWORD).update(payload).digest('base64url');
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function hasAccess(request, env, now = Date.now()) {
  if (!configured(env)) return false;
  const token = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || token.length > 256) return false;
  const [expires, nonce, signature, extra] = token.split('.');
  const expiry = Number(expires);
  return !extra && !!nonce && !!signature && Number.isFinite(expiry) && expiry > now / 1000 && expiry <= now / 1000 + TTL && equal(signature, sign(`${expires}.${nonce}`, env));
}

function page(message = '', status = 200, cookie) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Causa — Live AI access</title><style>body{font:18px system-ui;background:#f4f3ed;color:#20342b;max-width:480px;margin:12vh auto;padding:24px}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:8px 0}button{background:#20342b;color:white;border:0}a{color:inherit}</style><h1>Live AI access</h1><p>The simulation is public. Enter the private demo access code to use image analysis and model-assisted physical test planning.</p><p role="status">${message}</p><form method="post" action="/api/access"><label for="password">Access code</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button>Unlock live AI</button></form><p>Once unlocked, return to your investigation tab. Your evidence stays there.</p><a href="/">Open Causa</a></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}

export async function handleAccess(request, env = process.env) {
  if (!configured(env)) return page('Live AI access has not been configured.', 503);
  if (request.method === 'GET') return page(hasAccess(request, env) ? 'Live AI is unlocked for this browser.' : '');
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return page('Open this form from Causa to continue.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return page('Unsupported form.', 415);
  const reader = request.body?.getReader();
  if (!reader) return page('Enter the access code.', 400);
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) { await reader.cancel(); return page('Form too large.', 413); }
    chunks.push(Buffer.from(value));
  }
  const password = new URLSearchParams(Buffer.concat(chunks).toString()).get('password') || '';
  if (!equal(password, env.CAUSA_ACCESS_PASSWORD)) return page('Access code did not match.', 401);
  const payload = `${Math.floor(Date.now() / 1000) + TTL}.${randomUUID()}`;
  return page('Live AI is unlocked. Return to your investigation tab.', 200, `${COOKIE}=${payload}.${sign(payload, env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`);
}

export function withVercelAccess(handler) {
  return async (request, env = process.env) => {
    // Client-supplied Sites identity headers are never trusted on Vercel.
    const headers = new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');
    if (request.method !== 'GET') {
      if (!hasAccess(request, env)) return json({ error: { code: 'AUTH_REQUIRED', message: 'Open Live AI access in the footer and enter the demo access code, then retry.' } }, 401);
      headers.set('oai-authenticated-user-id', 'vercel-demo');
    }
    return handler(new Request(request, { headers }), env);
  };
}
