#!/usr/bin/env node
/**
 * Записывает в каждую карточку блюда строку с оценкой белка
 * в раздел «## Порции и время» (идемпотентно).
 *
 *   node scripts/annotate-protein.js          # записать
 *   node scripts/annotate-protein.js --dry    # только показать
 */
const fs = require('fs');
const path = require('path');
const { DISHES_DIR, dishTotals } = require('./lib/ingredients');

const dry = process.argv.includes('--dry');
const MARK = '- **Белок (оценка):**';
let changed = 0;

for (const f of fs.readdirSync(DISHES_DIR).filter(f => f.endsWith('.md') && f !== 'README.md')) {
  const slug = f.slice(0, -3);
  const file = path.join(DISHES_DIR, f);
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');

  const t = dishTotals(slug);
  const perMeal = t.protein / t.card.days + t.proteinServing;
  if (perMeal < 5) continue;

  const m = text.match(/(## Порции и время\n\n)([\s\S]*?)(?=\n## |\n*$)/);
  if (!m) continue;
  let body = m[2].split('\n')
    .filter(l => !l.startsWith(MARK))
    .map(l => l.replace(/\s*Белок:?\s*~?\d+[^.\n]*\.?/g, '').trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
  const per = Math.round(perMeal / 5);
  const note = t.card.days > 1 ? ' (за одну порцию-приём: блюдо на несколько дней)' : '';
  body += `\n${MARK} ≈ ${Math.round(perMeal)} г на семью за приём${note}; ≈ ${per} г на среднего члена семьи. Оценка по таблице ингредиентов (сырой вес).`;
  const followedBySection = text.slice(m.index + m[0].length).startsWith('\n## ');
  const out = text.slice(0, m.index) + m[1] + body + (followedBySection ? '\n' : '') + text.slice(m.index + m[0].length);
  if (out !== text) {
    changed++;
    if (!dry) fs.writeFileSync(file, out.replace(/\n/g, eol), 'utf8');
  }
}
console.log((dry ? '[dry] ' : '') + 'обновлено карточек: ' + changed);
