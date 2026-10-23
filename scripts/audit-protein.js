/**
 * Оценка белка по карточкам блюд и по дням недель.
 * Запуск: node scripts/audit-protein.js [--cards] [--unmapped]
 *
 * Белок считается по таблицам ингредиентов (сырые продукты, средние значения диапазонов) —
 * это ориентир для планирования, а не лабораторный анализ.
 */
const fs = require('fs');
const path = require('path');
const { MENUS_DIR, DISHES_DIR, dishTotals } = require('./lib/ingredients');

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MEALS = ['Завтрак', 'Обед', 'Полдник', 'Ужин'];
// Ориентиры на всю семью (5 чел.) за один приём пищи, г белка
const TARGET = { Завтрак: 70, Обед: 70, Полдник: 35, Ужин: 110 };
const TARGET_DAY = 390; // сырой вес с запасом; реальная потребность семьи ≈ 250–300 г

const cache = {};
function family(slug) {
  if (!cache[slug]) {
    const t = dishTotals(slug);
    cache[slug] = { title: t.card.title, perDay: t.protein / t.card.days + t.proteinServing, total: t.protein, days: t.card.days, unmapped: t.unmapped };
  }
  return cache[slug];
}

function parseWeek(file) {
  const md = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const rows = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    const day = (cells[0] || '').replace(/\*\*/g, '');
    if (!DAYS.includes(day)) continue;
    if (rows.length >= 7) break; // дальше идёт таблица «Белок по дням»
    const meals = cells.slice(1, 5).map(c => [...c.matchAll(/dishes\/([^)]+?)\.md/g)].map(m => m[1]));
    rows.push({ day, meals });
  }
  return rows;
}

const args = process.argv.slice(2);
const slugs = fs.readdirSync(DISHES_DIR).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => f.slice(0, -3)).sort();

if (args.includes('--unmapped')) {
  const un = new Set();
  slugs.forEach(s => family(s).unmapped.forEach(u => un.add(s + ' :: ' + u)));
  console.log([...un].join('\n'));
  process.exit(0);
}

if (args.includes('--cards')) {
  const list = slugs.map(s => ({ s, ...family(s) })).sort((a, b) => a.perDay - b.perDay);
  list.forEach(x => console.log(String(Math.round(x.perDay)).padStart(4) + ' г/день-семья | ' + x.s + ' | ' + x.title));
  process.exit(0);
}

const out = {};
let summary = [];
for (let w = 1; w <= 5; w++) {
  const file = path.join(MENUS_DIR, `nedelya-${w}.md`);
  if (!fs.existsSync(file)) continue;
  const rows = parseWeek(file);
  console.log(`\n=== Неделя ${w} ===`);
  let weekSum = 0;
  rows.forEach(r => {
    const per = r.meals.map(sl => sl.reduce((a, s) => a + family(s).perDay, 0));
    const day = per.reduce((a, b) => a + b, 0);
    weekSum += day;
    const flags = per.map((p, i) => (p < TARGET[MEALS[i]] * 0.85 ? '!' : ' '));
    console.log(r.day + ' | ' + per.map((p, i) => MEALS[i][0] + ':' + String(Math.round(p)).padStart(3) + flags[i]).join(' ') + ' | день ' + String(Math.round(day)).padStart(3) + ' г семья / ' + Math.round(day / 5) + ' г на чел.' + (day < TARGET_DAY * 0.9 ? '  <-- мало' : ''));
  });
  summary.push(`Неделя ${w}: среднее ${Math.round(weekSum / rows.length)} г/день на семью (${Math.round(weekSum / rows.length / 5)} г на чел.)`);
}
console.log('\n' + summary.join('\n'));
console.log('Ориентир: ' + TARGET_DAY + ' г/день на семью в сыром весе (потребность ≈ 250–300 г; помечается день < 90% ориентира).');
