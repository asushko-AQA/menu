/**
 * Генерирует manifest.json для сайта меню и копирует docs в web/content.
 * Запуск: node scripts/generate-manifest.js
 * После добавления новых .md в docs/ запустите скрипт снова — они появятся в манифесте и в content.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const WEB_CONTENT = path.join(ROOT, 'web', 'content');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listMd(dir, excludeReadme = true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && (!excludeReadme || f.toLowerCase() !== 'readme.md'))
    .sort();
}

function copyDir(src, dest) {
  ensureDir(dest);
  const names = fs.readdirSync(src);
  for (const name of names) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else if (name.endsWith('.md')) {
      fs.copyFileSync(s, d);
    }
  }
}

function getFirstLineTitle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : path.basename(filePath, '.md');
}

// Меню по неделям: nedelya-1 ... nedelya-4 и прочие
const menusDir = path.join(DOCS, 'menus');
const menuFiles = listMd(menusDir);
const menus = menuFiles.map(f => {
  const id = path.basename(f, '.md');
  const fullPath = path.join(menusDir, f);
  const title = getFirstLineTitle(fullPath);
  return { id, title, file: `menus/${f}` };
});

// Карточки блюд
const dishesDir = path.join(DOCS, 'dishes');
const dishFiles = listMd(dishesDir);
const dishes = dishFiles.map(f => {
  const slug = path.basename(f, '.md');
  return { slug, file: `dishes/${f}` };
});

// Подсказки
const tipsDir = path.join(DOCS, 'tips');
const tipFiles = listMd(tipsDir);
const tips = tipFiles.map(f => {
  const id = path.basename(f, '.md');
  return { id, file: `tips/${f}` };
});

// Копируем docs в web/content (только нужные папки и .md)
const contentMenus = path.join(WEB_CONTENT, 'menus');
const contentDishes = path.join(WEB_CONTENT, 'dishes');
const contentTips = path.join(WEB_CONTENT, 'tips');
ensureDir(contentMenus);
ensureDir(contentDishes);
ensureDir(contentTips);

for (const f of menuFiles) {
  fs.copyFileSync(path.join(menusDir, f), path.join(contentMenus, f));
}
for (const f of dishFiles) {
  fs.copyFileSync(path.join(dishesDir, f), path.join(contentDishes, f));
}
for (const f of tipFiles) {
  fs.copyFileSync(path.join(tipsDir, f), path.join(contentTips, f));
}

// Копируем data/ (например ratings.json) для загрузки в приложении
const dataDir = path.join(DOCS, 'data');
const contentData = path.join(WEB_CONTENT, 'data');
if (fs.existsSync(dataDir)) {
  ensureDir(contentData);
  fs.readdirSync(dataDir).forEach(f => {
    if (f.endsWith('.json') || f.endsWith('.md')) {
      fs.copyFileSync(path.join(dataDir, f), path.join(contentData, f));
    }
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  menus,
  dishes,
  tips,
};

fs.writeFileSync(
  path.join(WEB_CONTENT, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);

console.log('Manifest generated:', manifest.menus.length, 'menus', manifest.dishes.length, 'dishes', manifest.tips.length, 'tips');
console.log('Content copied to web/content/');
