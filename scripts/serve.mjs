import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { handlePerception } from '../server/perception.mjs';
import { handlePlanner } from '../server/planner.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { response.writeHead(403).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, String(value));
      // This dev server binds only to loopback. Hosted identity is supplied by Sites.
      headers.set('oai-authenticated-user-id', 'local-preview');
      const controller = new AbortController();
      response.on('close', () => { if (!response.writableEnded) controller.abort(); });
      const apiRequest = new Request(url, { method: request.method, headers, signal: controller.signal,
        ...(!['GET','HEAD'].includes(request.method) ? { body: Readable.toWeb(request), duplex: 'half' } : {}) });
      const result = await (url.pathname === '/api/planner' ? handlePlanner : handlePerception)(apiRequest, process.env);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text()); return;
    }
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${name}`);
    if (!target.startsWith(root) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(403).end(); return; }
    const file = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : file);
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`CAUSA local preview: http://127.0.0.1:${port}`));
