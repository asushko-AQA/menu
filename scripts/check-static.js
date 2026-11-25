/**
 * Лёгкая проверка статики после generate-manifest.js.
 * Без зависимостей: JSON.parse, файлы из манифеста, относительные href/src в HTML.
 * Запуск: node scripts/check-static.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const content = path.join(web, 'content');
const errors = [];

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(web, []);
const jsonFiles = files.filter((f) => f.endsWith('.json'));
if (jsonFiles.length === 0) errors.push('no JSON files under web/');

for (const file of jsonFiles) {
  const rel = path.relative(root, file);
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push('invalid JSON ' + rel + ': ' + err.message);
  }
}

const manifestPath = path.join(content, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  errors.push('cannot read manifest.json: ' + err.message);
  manifest = null;
}

if (manifest) {
  for (const key of ['menus', 'dishes', 'tips']) {
    if (!Array.isArray(manifest[key]) || manifest[key].length === 0) {
      errors.push('manifest.' + key + ' must be a non-empty array');
    }
  }
  const entries = [].concat(manifest.menus || [], manifest.dishes || [], manifest.tips || []);
  for (const item of entries) {
    if (!item || typeof item.file !== 'string' || item.file.length === 0) {
      errors.push('manifest entry missing file');
      continue;
    }
    if (item.file.includes('..') || path.isAbsolute(item.file)) {
      errors.push('manifest file path is not relative: ' + item.file);
      continue;
    }
    const target = path.join(content, item.file);
    if (!fs.existsSync(target)) errors.push('missing content file ' + item.file);
  }
}

const attrRe = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
for (const file of files.filter((f) => f.endsWith('.html'))) {
  const text = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(root, file);
  let match;
  while ((match = attrRe.exec(text))) {
    let url = match[1].trim();
    if (
      !url ||
      url.startsWith('#') ||
      url.startsWith('/') ||
      url.startsWith('data:') ||
      url.startsWith('mailto:') ||
      url.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(url)
    ) {
      continue;
    }
    url = url.split('#')[0].split('?')[0];
    if (!url) continue;
    const resolved = path.resolve(path.dirname(file), url);
    const rel = path.relative(web, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      errors.push('relative link escapes web/: ' + match[1] + ' in ' + relFile);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push('broken relative link ' + match[1] + ' in ' + relFile);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('OK:', jsonFiles.length, 'JSON files, manifest links and HTML relative links');
