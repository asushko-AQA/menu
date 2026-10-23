(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Базовые пути
   * ------------------------------------------------------------------ */
  const APP_BASE_PATH = detectAppBasePath();

  function detectAppBasePath() {
    const path = window.location.pathname || '/';
    return path.indexOf('/menu') >= 0 ? '/menu' : '';
  }

  function appPath(routePath) {
    const normalized = routePath === '/' ? '/' : '/' + String(routePath || '').replace(/^\/+|\/+$/g, '');
    return (APP_BASE_PATH || '') + normalized;
  }

  function getContentBase() {
    const base = window.location.origin + appPath('/');
    return base.replace(/\/+$/, '/') + 'content/';
  }

  const CONTENT_BASE = getContentBase();
  const RATINGS_KEY = 'menu-dish-ratings';
  const THEME_KEY = 'menu-theme';
  const SITE_TITLE = 'Меню';

  let manifest = null;
  let fileRatings = null; // рейтинги из content/data/ratings.json
  let renderToken = 0;

  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const MEALS = [
    { key: 'breakfast', label: 'Завтрак', icon: '☀️' },
    { key: 'lunch', label: 'Обед', icon: '🍲' },
    { key: 'snack', label: 'Полдник', icon: '🍎' },
    { key: 'dinner', label: 'Ужин', icon: '🌙' },
  ];
  const SECTIONS = [
    { id: 'zavtraki', label: 'Завтраки', icon: '☀️', hint: 'Каши, омлеты, сырники' },
    { id: 'obedy', label: 'Обеды', icon: '🍲', hint: 'Супы и воскресные обеды' },
    { id: 'poldnik', label: 'Полдник', icon: '🍎', hint: 'Белковые перекусы' },
    { id: 'uzhiny', label: 'Ужины', icon: '🌙', hint: 'Мясо, птица, рыба' },
  ];

  /* ------------------------------------------------------------------ *
   * Утилиты
   * ------------------------------------------------------------------ */
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function mdToHtml(md) {
    return window.marked ? window.marked.parse(md) : '<pre>' + escapeHtml(md) + '</pre>';
  }

  function slugifyHeading(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-');
  }

  /* ------------------------------------------------------------------ *
   * Маршрутизация
   * ------------------------------------------------------------------ */
  function getPathRoute() {
    let pathname = window.location.pathname || '/';
    if (APP_BASE_PATH && pathname.startsWith(APP_BASE_PATH)) {
      pathname = pathname.slice(APP_BASE_PATH.length) || '/';
    }
    const raw = pathname.replace(/^\/+|\/+$/g, '');
    const parts = raw ? raw.split('/') : [];
    if (parts[0] === 'menu' && parts[1] && parts[2] === 'day' && parts[3] != null) {
      return { view: 'day', weekId: parts[1], dayIndex: parseInt(parts[3], 10) };
    }
    if (parts[0] === 'menu' && parts[1]) return { view: 'week', weekId: parts[1] };
    if (parts[0] === 'dish' && parts[1]) return { view: 'dish', slug: parts[1] };
    if (parts[0] === 'list' && parts[1]) return { view: 'list', listId: parts[1] };
    if (parts[0] === 'tips' && parts[1]) return { view: 'tips', tipId: parts[1] };
    return { view: 'home' };
  }

  function navigateTo(path, replace) {
    const target = appPath(path);
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (current === target) return;
    if (replace) history.replaceState(null, '', target);
    else history.pushState(null, '', target);
    render({ scroll: true });
  }

  function migrateLegacyHashRoute() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#/')) return;
    navigateTo(hash.slice(1), true);
  }

  /* ------------------------------------------------------------------ *
   * Рейтинги
   * ------------------------------------------------------------------ */
  function getRatings() {
    try {
      return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function setRating(slug, value) {
    const r = getRatings();
    r[slug] = { value, updatedAt: new Date().toISOString() };
    localStorage.setItem(RATINGS_KEY, JSON.stringify(r));
  }

  function getRating(slug) {
    const r = getRatings();
    if (r[slug]) return r[slug].value;
    if (fileRatings && fileRatings[slug] != null) return fileRatings[slug];
    return null;
  }

  async function loadFileRatings() {
    try {
      const data = await fetchJson('data/ratings.json');
      if (data.ratings && Array.isArray(data.ratings)) {
        fileRatings = {};
        data.ratings.forEach(({ slug, rating }) => { if (slug != null) fileRatings[slug] = rating; });
      }
    } catch (_) { fileRatings = null; }
  }

  function exportRatingsJson() {
    const r = getRatings();
    const out = {
      description: 'Рейтинги блюд для учёта при генерации меню. Экспорт из приложения.',
      updatedAt: new Date().toISOString(),
      ratings: Object.entries(r).map(([slug, data]) => ({ slug, rating: data.value, updatedAt: data.updatedAt })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ratings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ------------------------------------------------------------------ *
   * Загрузка данных
   * ------------------------------------------------------------------ */
  async function fetchResource(url) {
    const fullUrl = (url.startsWith('http') || url.startsWith('//')) ? url : (CONTENT_BASE + url);
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const text = await res.text();
    return { text, contentType: res.headers.get('content-type') || '', fullUrl };
  }

  async function fetchText(url) {
    return (await fetchResource(url)).text;
  }

  async function fetchJson(url) {
    const { text, contentType, fullUrl } = await fetchResource(url);
    if (/^\s*</.test(text)) {
      throw new Error('Ожидался JSON, но получен HTML: ' + fullUrl);
    }
    if (contentType && !contentType.toLowerCase().includes('json')) {
      throw new Error('Ожидался JSON, но Content-Type=' + contentType + ': ' + fullUrl);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error('Некорректный JSON в ' + fullUrl + ': ' + (err && err.message ? err.message : 'parse error'));
    }
  }

  async function loadManifest() {
    if (manifest) return manifest;
    manifest = await fetchJson('manifest.json');
    return manifest;
  }

  /* ------------------------------------------------------------------ *
   * Разбор markdown-таблицы недели
   * ------------------------------------------------------------------ */
  /** Строки с днями Пн–Вс; в ячейках — ссылки на блюда. */
  function parseWeekTable(md) {
    const lines = md.split('\n');
    const rows = [];
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells[0] === 'День') {
        if (rows.length > 0) break; // вторая таблица («Белок по дням») — не меню
        headerIndex = i;
        continue;
      }
      if (headerIndex >= 0 && cells.length >= 2) {
        const dayName = cells[0].replace(/\*\*/g, '').trim();
        if (!DAY_NAMES.includes(dayName)) continue;
        const mealCells = cells.slice(1);
        const meals = MEALS.slice(0, mealCells.length).map((_, idx) => parseLinksFromCell(mealCells[idx]));
        rows.push({ dayName, meals });
      }
    }
    return rows;
  }

  /** Из ячейки: [{ title, slug }] по ссылкам вида [text](../dishes/slug.md). */
  function parseLinksFromCell(text) {
    if (!text) return [];
    const re = /\[([^\]]+)\]\((\.\.\/)*dishes\/([^)]+)\.md\)/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ title: m[1].trim(), slug: m[3].replace(/\.md$/, '') });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Шаблоны (HTML-строки)
   * ------------------------------------------------------------------ */
  function splitTitle(title) {
    if (!title || title.indexOf(' (') < 0) return { main: title || '', sub: '' };
    const idx = title.indexOf(' (');
    return {
      main: title.slice(0, idx).trim(),
      sub: title.slice(idx).trim().replace(/^\(\s*/, '').replace(/\s*\)$/, ''),
    };
  }

  function renderCrumbs(items) {
    return '<nav class="crumbs" aria-label="Навигация по страницам">' + items.map(it =>
      '<a class="back-link" href="' + it.href + '"><span aria-hidden="true">←</span> ' + escapeHtml(it.label) + '</a>'
    ).join('') + '</nav>';
  }

  function renderPageHead(opts) {
    const split = splitTitle(opts.title);
    let html = '<header class="page-head">';
    if (opts.eyebrow) html += '<p class="eyebrow">' + escapeHtml(opts.eyebrow) + '</p>';
    html += '<h1 class="page-title">' + escapeHtml(opts.heading || split.main) + '</h1>';
    const sub = opts.sub != null ? opts.sub : split.sub;
    if (sub) html += '<p class="page-sub">' + escapeHtml(sub) + '</p>';
    if (opts.actions) html += '<div class="page-actions">' + opts.actions + '</div>';
    return html + '</header>';
  }

  function renderDishLinks(meals) {
    if (!meals || meals.length === 0) return '<span class="empty">—</span>';
    return '<ul class="meal-dishes">' + meals.map(m =>
      '<li><a href="' + appPath('/dish/' + m.slug) + '">' + escapeHtml(m.title) + '</a></li>'
    ).join('') + '</ul>';
  }

  function renderRating(slug, current) {
    const v = current != null ? current : 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += '<button type="button" class="star" role="radio" data-value="' + i + '" aria-checked="' + (i === v ? 'true' : 'false') +
        '" aria-label="' + i + ' из 5">★</button>';
    }
    return '<section class="rating-block card" aria-labelledby="rating-title">' +
      '<h2 class="rating-title" id="rating-title">Оцените блюдо</h2>' +
      '<p class="rating-hint">Оценка учтётся при генерации меню.</p>' +
      '<div class="rating-stars" role="radiogroup" aria-label="Оценка блюда" data-rating="' + v + '" data-slug="' + escapeHtml(slug) + '">' + stars + '</div>' +
      '<p class="rating-status" id="rating-status" role="status" aria-live="polite">' + (v ? 'Ваша оценка: ' + v + ' из 5' : 'Пока без оценки') + '</p>' +
      '<div class="rating-export"><button type="button" class="btn btn-soft" id="export-ratings">Скачать рейтинги (ratings.json)</button></div>' +
      '</section>';
  }

  function renderNotFound(text) {
    return '<div class="empty-state card"><p class="empty-emoji" aria-hidden="true">🍽️</p>' +
      '<h1 class="page-title">' + escapeHtml(text || 'Страница не найдена') + '</h1>' +
      '<p class="page-sub">Возможно, ссылка устарела или блюдо переименовали.</p>' +
      '<a class="btn btn-primary" href="' + appPath('/') + '">На главную</a></div>';
  }

  function renderHome() {
    const weekMenus = manifest.menus.filter(m => /^nedelya-\d+$/.test(m.id));
    const zakupkiIndex = manifest.menus.find(m => m.id === 'zakupki-na-nedelyu');
    const zakupkiWeeks = manifest.menus.filter(m => /^zakupki-nedelya-\d+$/.test(m.id)).sort(
      (a, b) => parseInt(a.id.replace('zakupki-nedelya-', ''), 10) - parseInt(b.id.replace('zakupki-nedelya-', ''), 10)
    );
    const first = weekMenus[0];

    let html = '<section class="hero" aria-labelledby="hero-title">' +
      '<p class="eyebrow">Семейное меню</p>' +
      '<h1 class="hero-title" id="hero-title">Что сегодня на столе?</h1>' +
      '<p class="hero-lead">Пять недель меню: завтрак, обед, полдник и ужин. К каждому блюду — карточка, к каждой неделе — список закупок.</p>' +
      '<div class="hero-actions">' +
      (first ? '<a class="btn btn-primary" href="' + appPath('/menu/' + first.id) + '">Открыть 1-ю неделю</a>' : '') +
      (zakupkiIndex ? '<a class="btn btn-ghost" href="' + appPath('/list/zakupki-na-nedelyu') + '">🛒 Закупки</a>' : '') +
      '</div></section>';

    html += '<section class="block" aria-labelledby="weeks-title"><h2 class="section-title" id="weeks-title">Меню по неделям</h2><ul class="card-grid">';
    weekMenus.forEach(m => {
      const n = m.id.replace('nedelya-', '');
      const split = splitTitle(m.title);
      html += '<li><a class="week-card" href="' + appPath('/menu/' + m.id) + '">' +
        '<span class="week-num" aria-hidden="true">' + n + '</span>' +
        '<span class="week-body"><span class="title-main">' + escapeHtml(split.main) + '</span>' +
        (split.sub ? '<span class="title-sub">' + escapeHtml(split.sub) + '</span>' : '') + '</span>' +
        '<span class="chev" aria-hidden="true">›</span></a></li>';
    });
    html += '</ul></section>';

    html += '<section class="block" aria-labelledby="sections-title"><h2 class="section-title" id="sections-title">Разделы меню</h2><ul class="tile-grid">';
    SECTIONS.forEach(s => {
      html += '<li><a class="tile" href="' + appPath('/list/' + s.id) + '"><span class="tile-icon" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="tile-label">' + escapeHtml(s.label) + '</span><span class="tile-hint">' + escapeHtml(s.hint) + '</span></a></li>';
    });
    if (manifest.tips && manifest.tips.length) {
      html += '<li><a class="tile" href="' + appPath('/tips/' + manifest.tips[0].id) + '"><span class="tile-icon" aria-hidden="true">🥡</span>' +
        '<span class="tile-label">Заготовки</span><span class="tile-hint">Что подготовить заранее</span></a></li>';
    }
    html += '</ul></section>';

    if (zakupkiIndex || zakupkiWeeks.length) {
      html += '<section class="block" aria-labelledby="shop-title"><h2 class="section-title" id="shop-title">Закупки</h2><ul class="chip-row">';
      if (zakupkiIndex) {
        html += '<li><a class="chip chip-accent" href="' + appPath('/list/zakupki-na-nedelyu') + '">Все закупки (обзор)</a></li>';
      }
      zakupkiWeeks.forEach(m => {
        const n = m.id.replace('zakupki-nedelya-', '');
        html += '<li><a class="chip" href="' + appPath('/list/' + m.id) + '">🛒 ' + n + '-я неделя</a></li>';
      });
      html += '</ul></section>';
    }
    return html;
  }

  /** Сворачиваемый блок: первый заголовок «## …» становится summary. */
  function renderFold(md, open) {
    const m = md.match(/^##\s+(.+?)\s*\n([\s\S]*)$/);
    const summary = m ? m[1] : 'Подробнее';
    const body = m ? m[2] : md;
    return '<details class="fold card"' + (open ? ' open' : '') + '><summary><span>' + escapeHtml(summary) + '</span></summary>' +
      '<div class="prose">' + mdToHtml(body) + '</div></details>';
  }

  function renderWeek(weekId, md) {
    const menu = manifest.menus.find(m => m.id === weekId);
    const title = menu ? menu.title : weekId;
    const rows = parseWeekTable(md);
    const zakupkiId = weekId.replace(/^nedelya-/, 'zakupki-nedelya-');
    const hasZakupki = manifest.menus.some(m => m.id === zakupkiId);

    let html = renderCrumbs([{ href: appPath('/'), label: 'На главную' }]);
    html += renderPageHead({
      title,
      eyebrow: 'Меню на неделю',
      actions: hasZakupki ? '<a class="btn btn-soft" href="' + appPath('/list/' + zakupkiId) + '">🛒 Закупки на эту неделю</a>' : '',
    });

    if (rows.length === 0) {
      return html + '<article class="prose card">' + mdToHtml(md) + '</article>';
    }

    // Мобильный вид: карточки по дням
    html += '<div class="day-cards">';
    rows.forEach((row, dayIndex) => {
      html += '<article class="day-card"><h2 class="day-card-title"><a href="' + appPath('/menu/' + weekId + '/day/' + dayIndex) + '">' +
        escapeHtml(DAY_FULL[DAY_NAMES.indexOf(row.dayName)] || row.dayName) + '<span class="chev" aria-hidden="true">›</span></a></h2><dl class="meal-list">';
      MEALS.forEach((meal, i) => {
        html += '<div class="meal meal--' + meal.key + '"><dt><span aria-hidden="true">' + meal.icon + '</span> ' + meal.label + '</dt><dd>' +
          renderDishLinks(row.meals[i]) + '</dd></div>';
      });
      html += '</dl></article>';
    });
    html += '</div>';

    // Десктоп: таблица
    html += '<div class="week-table-wrap"><table class="week-table"><caption class="sr-only">Меню по дням недели</caption><thead><tr><th scope="col">День</th>';
    MEALS.forEach(meal => {
      html += '<th scope="col" class="meal--' + meal.key + '"><span aria-hidden="true">' + meal.icon + '</span> ' + meal.label + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach((row, dayIndex) => {
      html += '<tr><th scope="row"><a href="' + appPath('/menu/' + weekId + '/day/' + dayIndex) + '">' + escapeHtml(row.dayName) + '</a></th>';
      MEALS.forEach((_, i) => { html += '<td>' + renderDishLinks(row.meals[i]) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    const prepMatch = md.match(/## Что подготовить заранее по дням[\s\S]*?(?=\n---|\n## |$)/);
    if (prepMatch) html += renderFold(prepMatch[0], true);
    const proteinMatch = md.match(/## Белок по дням[\s\S]*?(?=\n---|\n## |$)/);
    if (proteinMatch) html += renderFold(proteinMatch[0], false);
    return html;
  }

  function renderDay(weekId, dayIndex, md) {
    const menu = manifest.menus.find(m => m.id === weekId);
    const rows = parseWeekTable(md);
    const row = rows[dayIndex];
    const dayName = row ? row.dayName : DAY_NAMES[dayIndex];
    const dayFull = DAY_FULL[DAY_NAMES.indexOf(dayName)] || dayName;
    const weekTitle = menu ? menu.title : weekId;
    const split = splitTitle(weekTitle);
    const prev = dayIndex > 0 ? dayIndex - 1 : null;
    const next = dayIndex < 6 ? dayIndex + 1 : null;

    let html = renderCrumbs([{ href: appPath('/menu/' + weekId), label: 'Меню недели' }]);
    html += renderPageHead({ title: weekTitle, heading: dayFull, eyebrow: split.main, sub: split.sub });

    html += '<nav class="day-tabs" aria-label="Дни недели">';
    DAY_NAMES.forEach((d, i) => {
      html += '<a class="day-tab" href="' + appPath('/menu/' + weekId + '/day/' + i) + '"' + (i === dayIndex ? ' aria-current="page"' : '') + '>' + d + '</a>';
    });
    html += '</nav>';

    html += '<div class="meal-cards">';
    MEALS.forEach((meal, i) => {
      const meals = row && row.meals[i] ? row.meals[i] : [];
      html += '<section class="meal-card meal--' + meal.key + '"><h2 class="meal-card-title"><span class="meal-icon" aria-hidden="true">' + meal.icon + '</span>' + meal.label + '</h2>';
      if (meals.length === 0) html += '<p class="empty">—</p>';
      else {
        html += '<ul class="dish-list">' + meals.map(m =>
          '<li><a class="dish-link" href="' + appPath('/dish/' + m.slug) + '"><span>' + escapeHtml(m.title) + '</span><span class="chev" aria-hidden="true">›</span></a></li>'
        ).join('') + '</ul>';
      }
      html += '</section>';
    });
    html += '</div>';

    html += '<nav class="pager" aria-label="Соседние дни">' +
      (prev !== null ? '<a class="btn btn-soft" href="' + appPath('/menu/' + weekId + '/day/' + prev) + '"><span aria-hidden="true">←</span> ' + DAY_FULL[prev] + '</a>' : '<span></span>') +
      (next !== null ? '<a class="btn btn-soft" href="' + appPath('/menu/' + weekId + '/day/' + next) + '">' + DAY_FULL[next] + ' <span aria-hidden="true">→</span></a>' : '<span></span>') +
      '</nav>';
    return html;
  }

  function renderDish(slug, md, fromWeekId, fromDayIndex) {
    const fromDay = fromWeekId != null && fromDayIndex != null && !isNaN(fromDayIndex);
    const crumb = fromDay
      ? { href: appPath('/menu/' + fromWeekId + '/day/' + fromDayIndex), label: 'К дню' }
      : { href: appPath('/'), label: 'На главную' };
    return renderCrumbs([crumb]) +
      '<article class="prose card dish">' + mdToHtml(md) + '</article>' +
      renderRating(slug, getRating(slug));
  }

  function renderList(listId, md) {
    const menu = manifest.menus.find(m => m.id === listId);
    const title = menu ? menu.title : listId;
    const isZakupki = /^zakupki-/.test(listId);
    const isZakupkiWeek = /^zakupki-nedelya-\d+$/.test(listId);
    const crumbs = [{ href: appPath('/'), label: 'На главную' }];
    if (isZakupkiWeek && manifest.menus.some(m => m.id === 'zakupki-na-nedelyu')) {
      crumbs.push({ href: appPath('/list/zakupki-na-nedelyu'), label: 'Все закупки' });
    }
    const section = SECTIONS.find(s => s.id === listId);
    return renderCrumbs(crumbs) +
      renderPageHead({
        title,
        eyebrow: isZakupki ? 'Список покупок' : (section ? 'Раздел меню' : ''),
        actions: isZakupki ? '<button type="button" class="btn btn-soft" data-action="print">🖨️ Распечатать</button>' : '',
      }) +
      '<article class="prose card">' + mdToHtml(md) + '</article>';
  }

  function renderTips(md) {
    return renderCrumbs([{ href: appPath('/'), label: 'На главную' }]) +
      renderPageHead({ title: 'Заготовки', eyebrow: 'Подготовка заранее', sub: 'Что сделать заранее, чтобы будни были проще' }) +
      '<article class="prose card">' + mdToHtml(md) + '</article>';
  }

  /* ------------------------------------------------------------------ *
   * Пост-обработка вставленного markdown
   * ------------------------------------------------------------------ */
  /** Ссылки из .md → маршруты приложения. */
  function rewriteContentLinks(container) {
    const weekIds = ['nedelya-1', 'nedelya-2', 'nedelya-3', 'nedelya-4', 'nedelya-5'];
    container.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) return;
      const mdMatch = href.match(/([^/]+)\.md$/);
      if (!mdMatch) return;
      const id = mdMatch[1];
      if (/(^|\/)dishes\//.test(href) || manifest.dishes.some(d => d.slug === id)) {
        a.setAttribute('href', appPath('/dish/' + id));
      } else if (weekIds.includes(id)) {
        a.setAttribute('href', appPath('/menu/' + id));
      } else if (manifest.menus.some(m => m.id === id)) {
        a.setAttribute('href', appPath('/list/' + id));
      } else if (manifest.tips && manifest.tips.some(t => t.id === id)) {
        a.setAttribute('href', appPath('/tips/' + id));
      }
    });
  }

  function enhanceContent(container) {
    rewriteContentLinks(container);

    // Таблицы — в прокручиваемую обёртку
    container.querySelectorAll('.prose table').forEach(table => {
      if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Таблица (прокручивается по горизонтали)');
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    // Якоря у заголовков (для ссылок вида #воскресный-обед)
    const used = new Set();
    container.querySelectorAll('.prose h1, .prose h2, .prose h3').forEach(h => {
      if (h.id) return;
      let id = slugifyHeading(h.textContent || '');
      if (!id) return;
      let unique = id;
      let n = 2;
      while (used.has(unique) || document.getElementById(unique)) unique = id + '-' + n++;
      used.add(unique);
      h.id = unique;
    });

    // Внешние ссылки — в новой вкладке
    container.querySelectorAll('a[href^="http"]').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  function bindRatingStars(container) {
    const group = container.querySelector('.rating-stars');
    if (!group) return;
    const slug = group.dataset.slug;
    const status = container.querySelector('#rating-status');
    group.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const v = parseInt(star.dataset.value, 10);
        setRating(slug, v);
        group.dataset.rating = String(v);
        group.querySelectorAll('.star').forEach(s => {
          s.setAttribute('aria-checked', s.dataset.value === String(v) ? 'true' : 'false');
        });
        if (status) status.textContent = 'Ваша оценка: ' + v + ' из 5';
      });
    });
    const exportBtn = container.querySelector('#export-ratings');
    if (exportBtn) exportBtn.addEventListener('click', exportRatingsJson);
  }

  /* ------------------------------------------------------------------ *
   * Рендер
   * ------------------------------------------------------------------ */
  function showError(main, e) {
    main.innerHTML = '<div class="error" role="alert"><p><strong>Не удалось загрузить страницу.</strong></p><p>' +
      escapeHtml(e && e.message ? e.message : e) + '</p></div>';
  }

  function skeleton() {
    return '<div class="skeleton" aria-busy="true" aria-live="polite"><span class="sr-only">Загрузка…</span>' +
      '<div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>';
  }

  function activeNavKey(route) {
    if (route.view === 'home' || route.view === 'week' || route.view === 'day') return 'home';
    if (route.view === 'list') return /^zakupki-/.test(route.listId) ? 'zakupki' : route.listId;
    if (route.view === 'tips') return route.tipId;
    return null;
  }

  function updateNav(route) {
    const key = activeNavKey(route);
    document.querySelectorAll('#nav a[data-nav]').forEach(a => {
      const on = a.dataset.nav === key;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /** Возвращает { html, title, after } для маршрута. */
  async function buildView(route) {
    if (route.view === 'week') {
      const menu = manifest.menus.find(m => m.id === route.weekId);
      if (!menu) return { html: renderNotFound('Неделя не найдена'), title: 'Не найдено' };
      const md = await fetchText(menu.file);
      return { html: renderWeek(route.weekId, md), title: splitTitle(menu.title).main };
    }
    if (route.view === 'day') {
      const menu = manifest.menus.find(m => m.id === route.weekId);
      if (!menu) return { html: renderNotFound('Неделя не найдена'), title: 'Не найдено' };
      const md = await fetchText(menu.file);
      const idx = DAY_NAMES[route.dayIndex] ? route.dayIndex : 0;
      return {
        html: renderDay(route.weekId, idx, md),
        title: DAY_FULL[idx] + ' — ' + splitTitle(menu.title).main,
      };
    }
    if (route.view === 'dish') {
      const dish = manifest.dishes.find(d => d.slug === route.slug);
      if (!dish) return { html: renderNotFound('Блюдо не найдено'), title: 'Не найдено' };
      const md = await fetchText(dish.file);
      const fromWeekId = sessionStorage.getItem('fromWeek');
      const fromDay = sessionStorage.getItem('fromDay');
      const heading = (md.match(/^#\s+(.+)$/m) || [])[1];
      return {
        html: renderDish(route.slug, md, fromWeekId, fromDay !== null ? parseInt(fromDay, 10) : null),
        title: heading || 'Блюдо',
        after: bindRatingStars,
      };
    }
    if (route.view === 'list') {
      const menu = manifest.menus.find(m => m.id === route.listId);
      if (!menu) return { html: renderNotFound('Раздел не найден'), title: 'Не найдено' };
      const md = await fetchText(menu.file);
      return { html: renderList(route.listId, md), title: splitTitle(menu.title).main };
    }
    if (route.view === 'tips') {
      const tip = manifest.tips.find(t => t.id === route.tipId);
      if (!tip) return { html: renderNotFound('Раздел не найден'), title: 'Не найдено' };
      const md = await fetchText(tip.file);
      return { html: renderTips(md), title: 'Заготовки' };
    }
    return { html: renderHome(), title: '' };
  }

  async function render(opts) {
    const options = opts || {};
    const main = document.getElementById('main');
    const route = getPathRoute();
    const token = ++renderToken;
    updateNav(route);

    if (window.location.protocol === 'file:') {
      main.innerHTML = '<div class="error" role="alert">' +
        '<p><strong>Приложение не работает по протоколу file://</strong></p>' +
        '<p>Запустите локальный сервер из папки проекта:</p>' +
        '<pre>node server.js</pre>' +
        '<p>Либо: <code>npx serve web</code>, затем откройте в браузере указанный адрес (например http://localhost:3000).</p>' +
        '<p>Перед первым запуском выполните: <code>node scripts/generate-manifest.js</code></p>' +
        '</div>';
      return;
    }

    try {
      if (!manifest) main.innerHTML = skeleton();
      await loadManifest();
      if (!fileRatings) await loadFileRatings();
    } catch (e) {
      main.innerHTML = '<div class="error" role="alert">' +
        '<p><strong>Не удалось загрузить контент.</strong></p>' +
        '<p>' + escapeHtml(e.message || '') + '</p>' +
        '<p>Выполните в папке проекта: <code>node scripts/generate-manifest.js</code></p>' +
        '<p>Сайт должен открываться по HTTP (например через <code>node server.js</code> или <code>npx serve web</code>), а не как file://.</p>' +
        '</div>';
      return;
    }
    if (token !== renderToken) return;

    if (route.view !== 'home') main.innerHTML = skeleton();

    let view;
    try {
      view = await buildView(route);
    } catch (e) {
      if (token === renderToken) showError(main, e);
      return;
    }
    if (token !== renderToken) return; // устаревший рендер

    main.innerHTML = '<div class="view">' + view.html + '</div>';
    enhanceContent(main);
    if (view.after) view.after(main);

    document.title = view.title ? view.title + ' · ' + SITE_TITLE : SITE_TITLE + ' — семейное меню на 5 недель';
    if (options.scroll) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------ *
   * Глобальные обработчики
   * ------------------------------------------------------------------ */
  // Единый обработчик кликов: якоря, контекст «назад из дня», SPA-навигация.
  document.addEventListener('click', e => {
    const printBtn = e.target.closest('[data-action="print"]');
    if (printBtn) {
      window.print();
      return;
    }

    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;

    const href = a.getAttribute('href');
    if (!href) return;

    // Якорь внутри страницы: прокрутка без повторного рендера
    if (href.startsWith('#')) {
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', window.location.pathname + window.location.search + href);
      }
      return;
    }

    if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (!(href.startsWith('/') || href.startsWith('./') || href.startsWith('../'))) return;

    const url = new URL(href, window.location.origin + window.location.pathname);
    if (url.origin !== window.location.origin) return;
    const appBase = APP_BASE_PATH || '';
    if (appBase && !url.pathname.startsWith(appBase + '/') && url.pathname !== appBase) return;

    const routePath = url.pathname.slice(appBase.length) || '/';

    // Контекст для кнопки «назад» на карточке блюда: помним только переход из дня
    if (/^\/dish\/[^/]+/.test(routePath)) {
      const dayMatch = window.location.pathname.match(/\/menu\/([^/]+)\/day\/(\d+)/);
      if (dayMatch) {
        sessionStorage.setItem('fromWeek', dayMatch[1]);
        sessionStorage.setItem('fromDay', dayMatch[2]);
      } else {
        sessionStorage.removeItem('fromWeek');
        sessionStorage.removeItem('fromDay');
      }
    }

    e.preventDefault();
    navigateTo(routePath, false);
  });

  window.addEventListener('popstate', () => render());
  window.addEventListener('load', () => {
    migrateLegacyHashRoute();
    render();
  });

  /* ------------------------------------------------------------------ *
   * Шапка: ссылки, бургер, тема, тень при прокрутке
   * ------------------------------------------------------------------ */
  (function initHeader() {
    const header = document.getElementById('header');
    const toggle = document.getElementById('nav-toggle');
    const overlay = document.getElementById('nav-overlay');
    const nav = document.getElementById('nav');
    const themeBtn = document.getElementById('theme-toggle');
    if (!header || !nav) return;

    // Реальные href с учётом базового пути (локально и на Pages)
    document.querySelectorAll('[data-route]').forEach(a => {
      a.setAttribute('href', appPath(a.dataset.route));
    });

    function setNav(open) {
      document.documentElement.classList.toggle('nav-open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      }
      if (overlay) overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    if (toggle) toggle.addEventListener('click', () => setNav(!document.documentElement.classList.contains('nav-open')));
    if (overlay) overlay.addEventListener('click', () => setNav(false));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.documentElement.classList.contains('nav-open')) {
        setNav(false);
        if (toggle) toggle.focus();
      }
    });

    // Тема
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function isDark() {
      const t = document.documentElement.getAttribute('data-theme');
      return t ? t === 'dark' : !!(mq && mq.matches);
    }
    function syncThemeUi() {
      const dark = isDark();
      if (themeBtn) {
        themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        themeBtn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      }
    }
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = isDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* приватный режим */ }
        syncThemeUi();
      });
    }
    if (mq && mq.addEventListener) mq.addEventListener('change', syncThemeUi);
    syncThemeUi();

    // Тень шапки при прокрутке
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header.classList.toggle('is-scrolled', window.scrollY > 4);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  })();
})();
