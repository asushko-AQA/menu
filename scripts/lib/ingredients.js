/**
 * Общая библиотека: разбор таблиц ингредиентов в карточках блюд, оценка белка, категории закупок.
 * Используется scripts/audit-protein.js и scripts/build-shopping.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DISHES_DIR = path.join(ROOT, 'docs', 'dishes');
const MENUS_DIR = path.join(ROOT, 'docs', 'menus');

const CAT = {
  meat: 'Мясо и птица',
  fish: 'Рыба',
  eggs: 'Яйца',
  dairy: 'Молочное (БЛ)',
  grain: 'Крупы, макароны, мука',
  legume: 'Бобовые',
  veg: 'Овощи и зелень',
  frozen: 'Овощи замороженные',
  fruit: 'Фрукты и ягоды',
  dry: 'Сухофрукты, орехи и семена',
  pantry: 'Бакалея и соусы',
  bread: 'Хлеб и лаваш',
};
const CAT_ORDER = ['meat', 'fish', 'eggs', 'dairy', 'grain', 'legume', 'veg', 'frozen', 'fruit', 'dry', 'pantry', 'bread'];

/**
 * Правила сопоставления названия продукта: [regex, key, cat, белок г/100 г, опции]
 * opts: pcs — вес 1 шт. в г; tbsp / tsp — г в ложке; unit — 'g' | 'ml' | 'pcs' (для закупок)
 * Первое совпадение выигрывает. skip — не учитывать (специи, вода и т.п.).
 */
const RULES = [
  [/^(соль|перец чёрный|перец,|лавров|специи|сода|разрыхл|ванил|корица|паприка|зира|куркума|барбарис|прованск|базилик|укроп сушён|чай |чай$|кипяток|вода|уксус|овсяное печенье|сушёные травы|орегано|горчица|мюсли? \(|зелёный лук \(при|добавки)/i, null],
  [/томаты (консерв|в соб|в соку)|томаты в|томаты или томатная|томатн\w* соус/i, 'Томаты консервированные', 'pantry', 1.2, { unit: 'g' }],
  [/томатная паста/i, 'Томатная паста', 'pantry', 4, { unit: 'g', tbsp: 25 }],
  [/куриная печень|печень/i, 'Печень куриная', 'meat', 19, { unit: 'g' }],
  [/голен/i, 'Куриные голени', 'meat', 14, { unit: 'g', pcs: 130 }],
  [/куриное филе|куриная грудка|грудка куриная|филе кур|куриные бёдр|куриные бедр/i, 'Куриное филе (бёдра б/к)', 'meat', 21, { unit: 'g' }],
  [/^курица/i, 'Курица (тушка/бёдра)', 'meat', 16, { unit: 'g' }],
  [/ветчин/i, 'Ветчина / грудка индейки (нарезка)', 'meat', 17, { unit: 'g' }],
  [/индейк/i, 'Индейка (фарш/филе)', 'meat', 20, { unit: 'g' }],
  [/^фарш/i, 'Фарш мясной', 'meat', 17.5, { unit: 'g' }],
  [/говядин/i, 'Говядина', 'meat', 18.5, { unit: 'g' }],
  [/свинин/i, 'Свинина', 'meat', 17, { unit: 'g' }],
  [/копчёност|копченост/i, 'Копчёности', 'meat', 12, { unit: 'g' }],
  [/тунец/i, 'Тунец в с/с (консервы)', 'fish', 25, { unit: 'g' }],
  [/скумбри/i, 'Скумбрия', 'fish', 18, { unit: 'g' }],
  [/треск|минтай|хек|белой рыбы|судак/i, 'Белая рыба (филе)', 'fish', 17, { unit: 'g' }],
  [/лосос|форел|красная рыба/i, 'Красная рыба (лосось/форель)', 'fish', 20, { unit: 'g' }],
  [/рыб/i, 'Белая рыба (филе)', 'fish', 17, { unit: 'g' }],
  [/^яйц/i, 'Яйца', 'eggs', 12.6, { unit: 'pcs', pcs: 55 }],
  [/сливки/i, 'Сливки БЛ', 'dairy', 2.5, { unit: 'ml' }],
  [/сметан/i, 'Сметана БЛ', 'dairy', 2.5, { unit: 'g', tbsp: 20 }],
  [/йогурт/i, 'Йогурт БЛ', 'dairy', 5, { unit: 'g', tbsp: 20 }],
  [/творог|творож/i, 'Творог БЛ', 'dairy', 17, { unit: 'g' }],
  [/сыр бл|^сыр|сыр \(|сыр твёрдый/i, 'Сыр БЛ', 'dairy', 25, { unit: 'g' }],
  [/молоко/i, 'Молоко БЛ', 'dairy', 3, { unit: 'ml' }],
  [/сливочное масло|масло бл(?!.*растительн)|масло \(?бл/i, 'Масло сливочное БЛ', 'dairy', 0.6, { unit: 'g', tbsp: 18, tsp: 6 }],
  [/гречнев\w* мук/i, 'Мука гречневая', 'grain', 12, { unit: 'g', tbsp: 25 }],
  [/мука/i, 'Мука пшеничная', 'grain', 10, { unit: 'g', tbsp: 25 }],
  [/овсяные хлопья|хлопья/i, 'Овсяные хлопья', 'grain', 12.5, { unit: 'g' }],
  [/рисов\w* лапш/i, 'Рисовая лапша', 'grain', 6, { unit: 'g' }],
  [/лапша|вермишел/i, 'Лапша яичная / вермишель', 'grain', 12, { unit: 'g' }],
  [/лазань/i, 'Листы лазаньи', 'grain', 12, { unit: 'g' }],
  [/макарон|паста|спагетти/i, 'Макароны / паста', 'grain', 12, { unit: 'g' }],
  [/булгур/i, 'Булгур', 'grain', 12, { unit: 'g' }],
  [/^рис|рис круглый|рис длинн/i, 'Рис', 'grain', 7, { unit: 'g' }],
  [/греч/i, 'Гречка', 'grain', 12.6, { unit: 'g' }],
  [/пшено/i, 'Пшено', 'grain', 11.5, { unit: 'g' }],
  [/манка|манная/i, 'Манка', 'grain', 11, { unit: 'g' }],
  [/кукурузн\w* круп/i, 'Кукурузная крупа', 'grain', 8, { unit: 'g' }],
  [/кукурузн\w* хлопь/i, 'Кукурузные хлопья (без сахара)', 'grain', 7, { unit: 'g' }],
  [/крахмал/i, 'Крахмал', 'grain', 0.2, { unit: 'g', tbsp: 12 }],
  [/сухари/i, 'Сухари панировочные', 'grain', 11, { unit: 'g' }],
  [/горох/i, 'Горох колотый', 'legume', 23, { unit: 'g' }],
  [/чечевиц/i, 'Чечевица', 'legume', 24, { unit: 'g' }],
  [/хумус/i, 'Хумус', 'legume', 8, { unit: 'g' }],
  [/нут/i, 'Нут консервированный', 'legume', 7, { unit: 'g' }],
  [/фасол\w* (консерв|красн|белая|в с)/i, 'Фасоль консервированная', 'legume', 7, { unit: 'g' }],
  [/фасоль/i, 'Фасоль консервированная', 'legume', 7, { unit: 'g' }],
  [/картофел/i, 'Картофель', 'veg', 2, { unit: 'g' }],
  [/морков/i, 'Морковь', 'veg', 1.3, { unit: 'g', pcs: 90 }],
  [/лук зелён|зелёный лук/i, 'Зелёный лук', 'veg', 1.5, { unit: 'g' }],
  [/лук репчат/i, 'Лук репчатый', 'veg', 1.4, { unit: 'g', pcs: 100 }],
  [/цветная капуста/i, 'Капуста цветная', 'veg', 2.5, { unit: 'g' }],
  [/капуст/i, 'Капуста белокочанная', 'veg', 1.8, { unit: 'g' }],
  [/брокколи/i, 'Брокколи', 'veg', 3, { unit: 'g' }],
  [/кабач/i, 'Кабачок', 'veg', 0.6, { unit: 'g', pcs: 300 }],
  [/баклажан/i, 'Баклажан', 'veg', 1, { unit: 'g', pcs: 175 }],
  [/свёкл|свекл/i, 'Свёкла', 'veg', 1.5, { unit: 'g' }],
  [/тыкв/i, 'Тыква', 'veg', 1, { unit: 'g' }],
  [/помидор|томат|черри/i, 'Помидоры', 'veg', 1, { unit: 'g', pcs: 100 }],
  [/перец сладк|перец крупн/i, 'Перец сладкий', 'veg', 1.3, { unit: 'g', pcs: 100 }],
  [/огур/i, 'Огурцы', 'veg', 0.8, { unit: 'g', pcs: 100 }],
  [/авокадо/i, 'Авокадо', 'veg', 2, { unit: 'g', pcs: 110 }],
  [/чеснок/i, 'Чеснок', 'veg', 6.5, { unit: 'g', pcs: 40 }],
  [/имбир/i, 'Имбирь', 'veg', 1.8, { unit: 'g' }],
  [/зелень|укроп|петрушк|кинза/i, 'Зелень', 'veg', 2.5, { unit: 'g' }],
  [/овощ\w* (замороженн|смесь)|овощи \(перец|овощи замор|овощи\s*\(/i, 'Овощная смесь замороженная', 'frozen', 2, { unit: 'g' }],
  [/овощи для гарнира/i, 'Овощи для гарнира (по сезону)', 'veg', 1.5, { unit: 'g' }],
  [/ягод/i, 'Ягоды (свежие/замороженные)', 'fruit', 0.8, { unit: 'g' }],
  [/банан/i, 'Бананы', 'fruit', 1.1, { unit: 'g', pcs: 130 }],
  [/яблок|яблоки/i, 'Яблоки', 'fruit', 0.4, { unit: 'g', pcs: 150 }],
  [/лимон/i, 'Лимоны', 'fruit', 0.9, { unit: 'g', pcs: 100 }],
  [/груш|мандарин|киви|персик|манго|фрукт/i, 'Фрукты (сезонные)', 'fruit', 0.7, { unit: 'g' }],
  [/финик/i, 'Финики', 'dry', 2.5, { unit: 'g' }],
  [/изюм|сухофрукт|курага|чернослив/i, 'Сухофрукты (изюм, курага)', 'dry', 3, { unit: 'g' }],
  [/орех|миндал|кешью/i, 'Орехи', 'dry', 15, { unit: 'g' }],
  [/семеч|семена|кунжут/i, 'Семечки (подсолнечник, тыква)', 'dry', 20, { unit: 'g' }],
  [/чиа/i, 'Семена чиа', 'dry', 17, { unit: 'g', tbsp: 12 }],
  [/мёд|мед /i, 'Мёд', 'dry', 0.3, { unit: 'g', tbsp: 30, tsp: 10 }],
  [/сироп/i, 'Мёд / сироп', 'dry', 0, { unit: 'g', tbsp: 30 }],
  [/шоколад/i, 'Шоколад без молока', 'dry', 5, { unit: 'g' }],
  [/сахар/i, 'Сахар', 'pantry', 0, { unit: 'g', tbsp: 25, tsp: 8 }],
  [/какао/i, 'Какао-порошок', 'pantry', 20, { unit: 'g', tbsp: 10 }],
  [/соев/i, 'Соевый соус', 'pantry', 8, { unit: 'ml', tbsp: 15 }],
  [/кетчуп|тартар|соус для подачи|соус\)/i, 'Кетчуп / соус для подачи', 'pantry', 1, { unit: 'g', tbsp: 20 }],
  [/масло/i, 'Масло растительное', 'pantry', 0, { unit: 'ml', tbsp: 15, tsp: 5 }],
  [/лаваш|лепёшк/i, 'Лаваш тонкий', 'bread', 9, { unit: 'g', pcs: 80 }],
  [/булочк|булка|батон|хлеб|тост|гренк/i, 'Хлеб / батон / булочки', 'bread', 8, { unit: 'g', pcs: 30 }],
  [/кукуруз/i, 'Кукуруза консервированная', 'pantry', 3, { unit: 'g' }],
  [/пюре|гарнир/i, 'Гарнир (см. карточку)', 'grain', 3, { unit: 'g' }],
];

function toNum(s) {
  return parseFloat(String(s).replace(',', '.'));
}

const UNIT_RE = '(кг|г|мл|л|шт|ст\\.\\s?л|ч\\.\\s?л|зубчик\\w*|ломтик\\w*|головк\\w*|пучок|пучк\\w*|банк\\w*|щепотк\\w*|порци\\w*|дольк\\w*|веточк\\w*)';
const QTY_RE = new RegExp('(\\d+(?:[.,]\\d+)?)(?:\\s*[–-]\\s*(\\d+(?:[.,]\\d+)?))?\\s*' + UNIT_RE + '(?![\\wа-яё])', 'gi');

/** Достаёт все пары (число/диапазон + единица) из строки количества. */
function allQty(s) {
  const out = [];
  let m;
  QTY_RE.lastIndex = 0;
  while ((m = QTY_RE.exec(s)) !== null) {
    const lo = toNum(m[1]);
    const hi = m[2] ? toNum(m[2]) : lo;
    let unit = m[3].toLowerCase().replace(/\s+/g, '');
    out.push({ lo, hi, unit, idx: m.index });
  }
  return out;
}

function rule(product) {
  // сначала по названию без скобок («Картофель на пюре (… или гречки)» — это картофель)
  const name = product.split('(')[0].trim();
  for (const r of RULES) {
    if (r[0].test(name)) return r;
  }
  for (const r of RULES) {
    if (r[0].test(product)) return r;
  }
  return null;
}

/** Возвращает { lo, hi, unit: 'g'|'ml'|'pcs' } либо null. */
function parseQty(product, qtyStr, r) {
  if (!r || r[1] === null) return null;
  const opts = r[4] || {};
  const q = allQty(qtyStr);
  if (!q.length) return null;
  const massQ = q.filter(x => ['г', 'кг', 'мл', 'л'].includes(x.unit));
  const grams = massQ.length ? massQ[massQ.length - 1] : null; // итог обычно в скобках в конце
  let primary = q[0];
  const hasMassUnit = ['г', 'кг', 'мл', 'л'].includes(primary.unit);
  let use = primary;
  if (!hasMassUnit && grams) use = grams; // «1 шт. (100 г)», «5 порций по 125–150 г (600–750 г)»
  else if (hasMassUnit && /на порцию|на 1 порцию/.test(qtyStr) && grams) use = grams;
  let { lo, hi, unit } = use;
  let outUnit;
  if (unit === 'кг') { lo *= 1000; hi *= 1000; outUnit = 'g'; }
  else if (unit === 'г') outUnit = 'g';
  else if (unit === 'л') { lo *= 1000; hi *= 1000; outUnit = 'ml'; }
  else if (unit === 'мл') outUnit = 'ml';
  else if (unit.startsWith('ст.л')) {
    const t = opts.tbsp || 15; lo *= t; hi *= t; outUnit = opts.unit === 'ml' ? 'ml' : (opts.unit === 'pcs' ? 'pcs' : opts.unit || 'g');
  } else if (unit.startsWith('ч.л')) {
    const t = opts.tsp || (opts.tbsp ? opts.tbsp / 3 : 5); lo *= t; hi *= t; outUnit = opts.unit === 'ml' ? 'ml' : opts.unit || 'g';
  } else if (unit.startsWith('зубчик')) { lo *= 5; hi *= 5; outUnit = 'g'; }
  else if (unit.startsWith('головк')) { lo *= 40; hi *= 40; outUnit = 'g'; }
  else if (unit.startsWith('ломтик')) { const w = opts.pcs || 30; lo *= w; hi *= w; outUnit = 'g'; }
  else if (unit === 'шт') {
    if (opts.unit === 'pcs') outUnit = 'pcs';
    else { const w = opts.pcs || 100; lo *= w; hi *= w; outUnit = opts.unit === 'ml' ? 'ml' : 'g'; }
  } else return null; // щепотка, пучок, банка без граммов и т.п.
  // шт для яиц: оставляем штуки
  return { lo, hi, unit: outUnit };
}

function readCard(slug) {
  const f = path.join(DISHES_DIR, slug + '.md');
  const t = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
  const title = (t.match(/^# (.+)/m) || [])[1] || slug;
  const m = t.match(/## Ингредиенты([^\n]*)\n([\s\S]*?)\n## /);
  const header = m ? m[1].trim() : '';
  const rows = [];
  if (m) {
    for (const line of m[2].split('\n')) {
      if (!line.startsWith('|')) continue;
      if (/^\|[-| ]+\|$/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map(s => s.trim());
      if (cells.length < 2 || cells[0] === 'Продукт') continue;
      rows.push({ product: cells[0], qty: cells[1] });
    }
  }
  // сколько «человеко-приёмов» в таблице и на сколько дней рассчитано блюдо
  let days = 1;
  if (/15 порций/.test(header)) days = 3;
  else if (/2[–-]3 дня/.test(header)) days = 3;
  else if (/3[–-]4 дня/.test(header)) days = 3.5;
  else if (/несколько дней/.test(header)) days = 4;
  // «ПРОТЕИН»-метка (необязательная) — на что делить: servings
  return { slug, title, header, rows, days, text: t };
}

function dishTotals(slug) {
  const card = readCard(slug);
  const items = [];
  let protein = 0;
  let proteinServing = 0;
  const unmapped = [];
  for (const row of card.rows) {
    const r = rule(row.product);
    if (!r) { unmapped.push(row.product); continue; }
    if (r[1] === null) continue;
    const q = parseQty(row.product, row.qty, r);
    if (!q) continue;
    const mid = (q.lo + q.hi) / 2;
    const grams = q.unit === 'pcs' ? mid * ((r[4] && r[4].pcs) || 100) : mid;
    const perServing = /подач|на порцию/i.test(row.product + ' ' + row.qty);
    if (perServing) proteinServing += grams * r[3] / 100; else protein += grams * r[3] / 100;
    items.push({ key: r[1], cat: r[2], lo: q.lo, hi: q.hi, unit: q.unit, product: row.product, perServing });
  }
  return { card, items, protein, proteinServing, unmapped };
}

module.exports = { ROOT, DISHES_DIR, MENUS_DIR, CAT, CAT_ORDER, RULES, readCard, dishTotals, rule, parseQty };
