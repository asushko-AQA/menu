#!/usr/bin/env node
/**
 * Собирает списки закупок docs/menus/zakupki-nedelya-N.md
 * по таблицам меню nedelya-N.md и ингредиентам карточек блюд.
 *
 *   node scripts/build-shopping.js            # все недели
 *   node scripts/build-shopping.js 3          # только 3-я
 *   node scripts/build-shopping.js --dry      # без записи, печать сводки
 *
 * Логика: блюдо на несколько дней (суп на 15 порций, печенье на 2–3 дня)
 * считается один раз на «партию»; новая партия начинается, когда
 * предыдущая уже не покрывает день (см. поле days в карточке).
 */
const fs = require('fs');
const path = require('path');
const { MENUS_DIR, CAT, CAT_ORDER, dishTotals } = require('./lib/ingredients');

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.find(a => /^\d$/.test(a));

function parseWeek(n) {
  const md = fs.readFileSync(path.join(MENUS_DIR, `nedelya-${n}.md`), 'utf8').replace(/\r/g, '');
  const rows = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    const day = (cells[0] || '').replace(/\*\*/g, '');
    if (!DAYS.includes(day)) continue;
    if (rows.length >= 7) break;
    const meals = cells.slice(1, 5).map(c => [...c.matchAll(/dishes\/([^)]+?)\.md/g)].map(m => m[1]));
    rows.push({ day, idx: DAYS.indexOf(day), meals });
  }
  return rows;
}

const shortTitle = t => {
  let s = t.replace(/\s*\([^)]*\)/g, '').trim();
  if (s.length > 34) {
    const m = s.slice(8).search(/ с | в | и | на | \+ |, /);
    if (m >= 0) s = s.slice(0, m + 8);
  }
  return s;
};

function dayLabel(idxs) {
  const a = [...new Set(idxs)].sort((x, y) => x - y);
  const out = [];
  let i = 0;
  while (i < a.length) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    if (j - i >= 2) out.push(DAYS[a[i]] + '–' + DAYS[a[j]]);
    else for (let k = i; k <= j; k++) out.push(DAYS[a[k]]);
    i = j + 1;
  }
  return out.join(', ');
}

function num(v, d = 2) {
  return String(+v.toFixed(d)).replace('.', ',');
}
function fmtG(v) {
  if (v >= 1000) {
    const r = Math.round(v / 50) * 50;
    return num(r / 1000) + ' кг';
  }
  const step = v < 100 ? 5 : v < 300 ? 10 : 50;
  return Math.max(step, Math.round(v / step) * step) + ' г';
}
function fmtMl(v) {
  if (v >= 1000) return num(Math.round(v / 50) * 50 / 1000) + ' л';
  const step = v < 100 ? 10 : 50;
  return Math.max(step, Math.round(v / step) * step) + ' мл';
}
function range(lo, hi, f) {
  const a = f(lo), b = f(hi);
  if (a === b || hi / lo < 1.08) return f((lo + hi) / 2);
  const ua = a.split(' ').pop(), ub = b.split(' ').pop();
  if (ua === ub) return a.slice(0, a.length - ua.length - 1) + '–' + b;
  return a + '–' + b;
}

const LIQ = new Set(['Молоко БЛ', 'Сливки БЛ', 'Масло растительное', 'Соевый соус']);

// «штучные» продукты: показываем и штуки, и вес
const PCS = {
  'Морковь': 90, 'Лук репчатый': 100, 'Помидоры': 100, 'Перец сладкий': 100, 'Огурцы': 100,
  'Авокадо': 110, 'Бананы': 130, 'Яблоки': 150, 'Лимоны': 100, 'Кабачок': 300, 'Баклажан': 175,
};

function formatQty(key, unit, lo, hi) {
  if (unit === 'pcs') {
    const a = Math.ceil(lo), b = Math.ceil(hi);
    return a === b ? a + ' шт.' : a + '–' + b + ' шт.';
  }
  if (key === 'Чеснок') {
    const a = Math.max(1, Math.ceil(lo / 40)), b = Math.max(a, Math.ceil(hi / 40));
    return a === b ? a + ' гол.' : a + '–' + b + ' гол.';
  }
  if (key === 'Зелень') {
    const a = Math.max(1, Math.ceil(lo / 40)), b = Math.max(a, Math.ceil(hi / 40));
    return a === b ? a + ' пуч.' : a + '–' + b + ' пуч.';
  }
  if (PCS[key]) {
    const w = PCS[key];
    const a = Math.max(1, Math.round(lo / w)), b = Math.max(a, Math.round(hi / w));
    const pcs = a === b ? a + ' шт.' : a + '–' + b + ' шт.';
    return pcs + ' (≈ ' + range(lo, hi, fmtG) + ')';
  }
  return range(lo, hi, unit === 'ml' ? fmtMl : fmtG);
}

function build(n) {
  const rows = parseWeek(n);
  // slug → список индексов дней
  const occ = new Map();
  rows.forEach(r => r.meals.forEach(m => m.forEach(s => {
    if (!occ.has(s)) occ.set(s, []);
    occ.get(s).push(r.idx);
  })));

  // партии
  const agg = new Map(); // key → {cat, lo, hi, unit, dishes: Map(slug → idx[])}
  const unmapped = new Set();
  for (const [slug, idxs] of occ) {
    const t = dishTotals(slug);
    t.unmapped.forEach(u => unmapped.add(slug + ': ' + u));
    const span = Math.max(1, Math.floor(t.card.days));
    const sorted = [...idxs].sort((a, b) => a - b);
    let batches = 0, start = -99;
    for (const d of sorted) { if (d - start >= span) { batches++; start = d; } }
    for (const it of t.items) {
      // единицы приводим к одной на продукт: яйца — штуки, жидкости — мл, остальное — г
      let unit = it.unit, lo = it.lo, hi = it.hi;
      if (it.key === 'Яйца') {
        if (unit !== 'pcs') { lo /= 55; hi /= 55; unit = 'pcs'; }
      } else if (LIQ.has(it.key)) unit = 'ml';
      else unit = 'g';
      const k = it.key;
      if (!agg.has(k)) agg.set(k, { key: it.key, cat: it.cat, unit, lo: 0, hi: 0, dishes: new Map() });
      const a = agg.get(k);
      a.lo += lo * batches;
      a.hi += hi * batches;
      if (!a.dishes.has(slug)) a.dishes.set(slug, { title: shortTitle(t.card.title), idx: [] });
      a.dishes.get(slug).idx.push(...sorted);
    }
  }

  // слить варианты одной сущности с разными unit (яйца: штуки; прочее: г)
  const byCat = {};
  for (const a of agg.values()) {
    if (a.hi < 5 && a.unit !== 'pcs') continue;
    (byCat[a.cat] = byCat[a.cat] || []).push(a);
  }

  const lunchSoups = [];
  [0, 3].forEach(i => {
    const slug = rows[i].meals[1][0];
    lunchSoups.push([shortTitle(dishTotals(slug).card.title), i === 0 ? 'Пн–Ср' : 'Чт–Сб']);
  });
  const sunday = shortTitle(dishTotals(rows[6].meals[1][0]).card.title);

  const L = [];
  L.push(`# Закупки на ${n}-ю неделю`, '');
  L.push(`Список продуктов на семью **5 человек** по меню [Меню на ${n}-ю неделю](nedelya-${n}.md). Обеды: ${lunchSoups.map(x => x[0].toLowerCase() + ' (' + x[1] + ')').join(', ')}; воскресенье — ${sunday.toLowerCase()}. Молочное — только **БЛ**. Количества рассчитаны автоматически по карточкам блюд (`+ '`node scripts/build-shopping.js`' + `), округлены до удобных для покупки; суп и печенье на несколько дней учтены один раз.`, '');
  L.push('← [Все закупки по неделям](zakupki-na-nedelyu.md)', '', '---', '');

  for (const cat of CAT_ORDER) {
    const list = byCat[cat];
    const extra = [];
    if (cat === 'fruit') extra.push(['**Фрукты на перекусы детям**', '**1,5–2 кг**', 'Вне основных приёмов пищи']);
    if (cat === 'pantry') extra.push(['Соль, перец, лавровый лист, специи', 'по дому', 'Все блюда']);
    if (!list && !extra.length) continue;
    L.push(`### ${CAT[cat]}`, '', '| Продукт | Количество | На что |', '|---------|------------|--------|');
    (list || []).sort((x, y) => (y.hi + y.lo) - (x.hi + x.lo)).forEach(a => {
      const parts = [...a.dishes.values()].map(d => `${d.title} (${dayLabel(d.idx)})`);
      const on = parts.length > 5 ? parts.slice(0, 4).join('; ') + '; и др. (' + (parts.length - 4) + ')' : parts.join('; ');
      L.push(`| ${a.key} | ${formatQty(a.key, a.unit, a.lo, a.hi)} | ${on} |`);
    });
    extra.forEach(e => L.push(`| ${e.join(' | ')} |`));
    L.push('');
  }
  return { text: L.join('\n'), unmapped: [...unmapped] };
}

for (let n = 1; n <= 5; n++) {
  if (only && String(n) !== only) continue;
  const { text, unmapped } = build(n);
  if (!dry) fs.writeFileSync(path.join(MENUS_DIR, `zakupki-nedelya-${n}.md`), text.replace(/\n/g, '\r\n'), 'utf8');
  console.log(`неделя ${n}: ${dry ? 'расчёт' : 'записано'}, строк ${text.split('\n').length}` + (unmapped.length ? `; не распознано: ${unmapped.length}` : ''));
  if (dry || args.includes('--unmapped')) unmapped.forEach(u => console.log('   ? ' + u));
}
