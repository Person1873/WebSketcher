import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { appendFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const LOG  = join(ROOT, 'debug.log');
const PORT = 3000;

const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript',
  '.css':'text/css', '.wasm':'application/wasm', '.png':'image/png',
  '.json':'application/json', '.map':'application/json',
};

// Clear log on startup
writeFileSync(LOG, `=== dev server started ${new Date().toISOString()} ===\n`);

createServer(async (req, res) => {
  // CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Log endpoint
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const line = `[${new Date().toISOString()}] ${body}\n`;
      appendFileSync(LOG, line);
      process.stdout.write(line);
      res.writeHead(204); res.end();
    });
    return;
  }

  // Static files
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';
  const file = join(ROOT, path);
  try {
    const data = await readFile(file);
    const mime = MIME[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}`);
  console.log(`Logging to ${LOG}`);
});
