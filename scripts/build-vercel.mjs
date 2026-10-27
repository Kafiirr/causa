import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist-vercel', { recursive: true });
await cp('public', 'dist-vercel', { recursive: true });
const html = await readFile('public/index.html', 'utf8');
await writeFile('dist-vercel/index.html', html.replace('</footer>', '<a href="/api/access" target="_blank" rel="noopener">Live AI access ↗</a></footer>'));
console.log('Vercel static assets prepared; API handlers run as Node functions.');
