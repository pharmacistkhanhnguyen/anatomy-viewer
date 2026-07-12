// Simple static file server - run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const BASE = __dirname;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.json': 'application/json', '.glb': 'application/octet-stream',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
};

http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('404 Not Found');
  }
}).listen(PORT, () => {
  console.log(`Anatomy Viewer: http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
