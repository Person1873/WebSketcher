import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const DUMP_FILE = path.resolve('./debug-state.json')

const sketchDebugPlugin = {
  name: 'sketch-debug',
  configureServer(server) {
    server.middlewares.use('/debug-state', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.end(); return; }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', d => body += d)
        req.on('end', () => { fs.writeFileSync(DUMP_FILE, body); res.end('ok'); })
      } else {
        try { res.setHeader('Content-Type','application/json'); res.end(fs.readFileSync(DUMP_FILE,'utf8')); }
        catch { res.statusCode = 404; res.end('{}'); }
      }
    })
  }
}

export default defineConfig({
  plugins: [react(), sketchDebugPlugin],
  base: process.env.GITHUB_PAGES === 'true' ? '/WebSketcher/' : '/',
})
