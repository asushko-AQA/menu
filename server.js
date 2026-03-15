/**
 * Простой HTTP-сервер для просмотра сайта меню.
 * Запуск из корня проекта: node server.js
 * Откройте в браузере: http://localhost:3000
 *
 * Перед первым запуском: node scripts/generate-manifest.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const WEB = path.join(__dirname, 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(WEB, req.url === '/' ? 'index.html' : req.url.replace(/^\//, '').split('?')[0]);
  if (!filePath.startsWith(WEB)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(filePath));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Сайт меню: http://localhost:' + PORT);
  console.log('Остановка: Ctrl+C');
});
