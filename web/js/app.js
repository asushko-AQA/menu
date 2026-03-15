(function () {
  // Путь к content/ относительно текущей страницы (при открытии по HTTP)
  function getContentBase() {
    const href = window.location.href;
    const lastSlash = href.lastIndexOf('/');
    const path = lastSlash >= 0 ? href.slice(0, lastSlash + 1) : href + '/';
    return path + 'content/';
  }
  const CONTENT_BASE = getContentBase();
  const RATINGS_KEY = 'menu-dish-ratings';

  let manifest = null;
  let fileRatings = null; // рейтинги из content/data/ratings.json

  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MEAL_KEYS = ['breakfast', 'lunch', 'snack', 'dinner'];
  const MEAL_HEADERS = ['Завтрак', 'Обед', 'Полдник', 'Ужин'];

  function getHashRoute() {
    const raw = (window.location.hash.slice(1) || '/').replace(/^\/+|\/+$/g, '');
    const parts = raw ? raw.split('/') : [];
    if (parts[0] === 'menu' && parts[1] && parts[2] === 'day' && parts[3] != null)
      return { view: 'day', weekId: parts[1], dayIndex: parseInt(parts[3], 10) };
    if (parts[0] === 'menu' && parts[1]) return { view: 'week', weekId: parts[1] };
    if (parts[0] === 'dish' && parts[1]) return { view: 'dish', slug: parts[1] };
    if (parts[0] === 'list' && parts[1]) return { view: 'list', listId: parts[1] };
    if (parts[0] === 'tips' && parts[1]) return { view: 'tips', tipId: parts[1] };
    return { view: 'home' };
  }

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
      const json = await fetchText('data/ratings.json');
      const data = JSON.parse(json);
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

  async function fetchText(url) {
    const fullUrl = (url.startsWith('http') || url.startsWith('//')) ? url : (CONTENT_BASE + url);
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.text();
  }

  async function loadManifest() {
    if (manifest) return manifest;
    const json = await fetchText('manifest.json');
    manifest = JSON.parse(json);
    return manifest;
  }

  /** Парсит таблицу недели из md: строки с днями Пн–Вс, ячейки с ссылками на блюда */
  function parseWeekTable(md) {
    const lines = md.split('\n');
    const rows = [];
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells[0] === 'День') {
        headerIndex = i;
        continue;
      }
      if (headerIndex >= 0 && cells.length >= 2) {
        const dayName = cells[0].replace(/\*\*/g, '').trim();
        if (!DAY_NAMES.includes(dayName)) continue;
        const mealCells = cells.slice(1);
        const meals = MEAL_KEYS.slice(0, mealCells.length).map((key, idx) => parseLinksFromCell(mealCells[idx]));
        rows.push({ dayName, meals });
      }
    }
    return rows;
  }

  /** Из ячейки извлекает массив { title, slug } из ссылок вида [text](../dishes/slug.md) */
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

  function renderBack(href, label) {
    return `<a class="back-link" href="${href}">← ${label}</a>`;
  }

  /** Разбивает заголовок вида "Меню на 1 неделю (завтрак + ...)" на основную и второстепенную части */
  function splitTitle(title) {
    if (!title || title.indexOf(' (') < 0) return null;
    const idx = title.indexOf(' (');
    return { main: title.slice(0, idx).trim(), sub: title.slice(idx).trim() };
  }

  /** Возвращает HTML заголовка: основная часть крупнее, второстепенная (в скобках) — мельче и бледнее */
  function renderTitleHtml(title) {
    const split = splitTitle(title);
    if (!split) return escapeHtml(title);
    return '<span class="title-main">' + escapeHtml(split.main) + '</span> <span class="title-sub">' + escapeHtml(split.sub) + '</span>';
  }

  function renderTitleBlockHtml(title) {
    const split = splitTitle(title);
    if (!split) return '<span class="title-main">' + escapeHtml(title) + '</span>';
    return '<span class="title-main">' + escapeHtml(split.main) + '</span><span class="title-sub">' + escapeHtml(split.sub) + '</span>';
  }

  function renderRating(slug, current) {
    const v = current != null ? current : 0;
    let html = '<div class="rating-block"><p>Оцените блюдо (учтётся при генерации меню):</p><div class="rating-stars" data-rating="' + v + '" data-slug="' + slug + '">';
    for (let i = 1; i <= 5; i++) {
      html += '<span class="star" data-value="' + i + '" aria-label="' + i + '">★</span>';
    }
    html += '</div><div class="rating-export"><button type="button" id="export-ratings">Скачать рейтинги (ratings.json)</button></div></div>';
    return html;
  }

  function renderHome() {
    const weekMenus = manifest.menus.filter(m => /^nedelya-\d+$/.test(m.id));
    const zakupkiIndex = manifest.menus.find(m => m.id === 'zakupki-na-nedelyu');
    const zakupkiWeeks = manifest.menus.filter(m => /^zakupki-nedelya-\d+$/.test(m.id)).sort(
      (a, b) => parseInt(a.id.replace('zakupki-nedelya-', ''), 10) - parseInt(b.id.replace('zakupki-nedelya-', ''), 10)
    );
    const sections = [
      { id: 'zavtraki', label: 'Завтраки' },
      { id: 'obedy', label: 'Обеды' },
      { id: 'poldnik', label: 'Полдник' },
      { id: 'uzhiny', label: 'Ужины' },
    ];
    let html = '<h1 class="page-title">Меню по неделям</h1><div class="weeks-grid">';
    weekMenus.forEach(m => {
      html += '<a href="#/menu/' + m.id + '" class="week-card">' + renderTitleBlockHtml(m.title) + '</a>';
    });
    html += '</div>';
    if (zakupkiIndex || zakupkiWeeks.length) {
      html += '<div class="section-list"><h2>Закупки на неделю</h2><div class="weeks-grid">';
      if (zakupkiIndex) {
        html += '<a href="#/list/zakupki-na-nedelyu" class="list-card">Все закупки (обзор)</a>';
      }
      zakupkiWeeks.forEach(m => {
        const n = m.id.replace('zakupki-nedelya-', '');
        html += '<a href="#/list/' + m.id + '" class="list-card">Закупки на ' + n + '-ю неделю</a>';
      });
      html += '</div></div>';
    }
    html += '<div class="section-list"><h2>Разделы меню</h2><div class="weeks-grid">';
    sections.forEach(s => {
      html += '<a href="#/list/' + s.id + '" class="list-card">' + escapeHtml(s.label) + '</a>';
    });
    html += '</div></div>';
    return html;
  }

  function renderWeek(weekId, md) {
    const menu = manifest.menus.find(m => m.id === weekId);
    const title = menu ? menu.title : weekId;
    const rows = parseWeekTable(md);
    const zakupkiId = weekId.replace(/^nedelya-/, 'zakupki-nedelya-');
    const hasZakupki = manifest.menus.some(m => m.id === zakupkiId);
    let html = renderBack('#/', 'На главную') + '<h1 class="page-title">' + renderTitleHtml(title) + '</h1>';
    if (hasZakupki) {
      html += '<p class="week-zakupki"><a href="#/list/' + zakupkiId + '">🛒 Закупки на эту неделю</a></p>';
    }
    if (rows.length === 0) {
      html += '<div class="dish-content">' + (window.marked ? marked.parse(md) : escapeHtml(md)) + '</div>';
      return html;
    }
    html += '<div class="week-day-cards">';
    rows.forEach((row, dayIndex) => {
      html += '<div class="week-day-card"><a href="#/menu/' + weekId + '/day/' + dayIndex + '" class="week-day-card-title">' + escapeHtml(row.dayName) + '</a>';
      MEAL_HEADERS.forEach((label, i) => {
        const meals = row.meals[i] || [];
        html += '<div class="week-day-meal"><span class="week-day-meal-label">' + escapeHtml(label) + '</span> ';
        if (meals.length === 0) html += '—';
        else meals.forEach((m, j) => { html += (j ? ', ' : '') + '<a href="#/dish/' + m.slug + '">' + escapeHtml(m.title) + '</a>'; });
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="week-table-wrap"><table class="week-table"><thead><tr><th>День</th>';
    MEAL_HEADERS.forEach(h => { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach((row, dayIndex) => {
      html += '<tr><td><a href="#/menu/' + weekId + '/day/' + dayIndex + '">' + escapeHtml(row.dayName) + '</a></td>';
      row.meals.forEach(meals => {
        html += '<td>';
        if (meals.length === 0) html += '—';
        else {
          html += '<ul>';
          meals.forEach(m => {
            html += '<li><a href="#/dish/' + m.slug + '">' + escapeHtml(m.title) + '</a></li>';
          });
          html += '</ul>';
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    const prepMatch = md.match(/## Что подготовить заранее по дням[\s\S]*?(?=---|\z)/);
    if (prepMatch) {
      html += '<div class="dish-content" style="margin-top:1rem">' + (window.marked ? marked.parse(prepMatch[0]) : escapeHtml(prepMatch[0])) + '</div>';
    }
    return html;
  }

  function renderDay(weekId, dayIndex, md) {
    const menu = manifest.menus.find(m => m.id === weekId);
    const rows = parseWeekTable(md);
    const row = rows[dayIndex];
    const dayName = row ? row.dayName : DAY_NAMES[dayIndex];
    const prev = dayIndex > 0 ? dayIndex - 1 : null;
    const next = dayIndex < 6 ? dayIndex + 1 : null;
    const weekTitle = menu ? menu.title : weekId;
    let html = renderBack('#/menu/' + weekId, 'Меню недели') + '<h1 class="page-title">' + renderTitleHtml(weekTitle) + ' <span class="title-day">— ' + escapeHtml(dayName) + '</span></h1>';
    html += '<div class="day-nav">';
    html += prev !== null ? '<a href="#/menu/' + weekId + '/day/' + prev + '">← ' + DAY_NAMES[prev] + '</a>' : '<span></span>';
    html += next !== null ? '<a href="#/menu/' + weekId + '/day/' + next + '">' + DAY_NAMES[next] + ' →</a>' : '<span></span>';
    html += '</div><div class="day-meals">';
    MEAL_HEADERS.forEach((label, i) => {
      const meals = row && row.meals[i] ? row.meals[i] : [];
      html += '<div class="day-meal"><h3>' + label + '</h3>';
      if (meals.length === 0) html += '—';
      else meals.forEach(m => {
        html += '<div><a href="#/dish/' + m.slug + '">' + escapeHtml(m.title) + '</a></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderDish(slug, md, fromWeekId, fromDayIndex) {
    const backHref = fromWeekId != null && fromDayIndex != null
      ? '#/menu/' + fromWeekId + '/day/' + fromDayIndex
      : '#/';
    const backLabel = fromWeekId != null ? 'День' : 'На главную';
    const rating = getRating(slug);
    let html = renderBack(backHref, backLabel) + '<div class="dish-content">';
    html += (window.marked ? marked.parse(md) : escapeHtml(md));
    html += '</div>' + renderRating(slug, rating);
    return html;
  }

  function renderList(listId, md) {
    const menu = manifest.menus.find(m => m.id === listId);
    const title = menu ? menu.title : listId;
    const isZakupkiWeek = /^zakupki-nedelya-\d+$/.test(listId);
    let html = renderBack('#/', 'На главную');
    if (isZakupkiWeek && manifest.menus.some(m => m.id === 'zakupki-na-nedelyu')) {
      html += ' <a class="back-link" href="#/list/zakupki-na-nedelyu">Все закупки</a>';
    }
    html += '<h1 class="page-title">' + renderTitleHtml(title) + '</h1>';
    html += '<div class="dish-content">' + (window.marked ? marked.parse(md) : escapeHtml(md)) + '</div>';
    return html;
  }

  function renderTips(tipId, md) {
    let html = renderBack('#/', 'На главную') + '<h1 class="page-title">Заготовки</h1>';
    html += '<div class="dish-content">' + (window.marked ? marked.parse(md) : escapeHtml(md)) + '</div>';
    return html;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function bindRatingStars(container) {
    const stars = container.querySelector('.rating-stars');
    if (!stars) return;
    const slug = stars.dataset.slug;
    stars.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const v = parseInt(star.dataset.value, 10);
        setRating(slug, v);
        stars.dataset.rating = String(v);
      });
    });
    document.getElementById('export-ratings')?.addEventListener('click', exportRatingsJson);
  }

  /** Преобразует ссылки из .md в хеш-маршруты: блюда → карточка, меню недели → страница недели, закупки/разделы → list */
  function rewriteContentLinks(container) {
    const weekIds = ['nedelya-1', 'nedelya-2', 'nedelya-3', 'nedelya-4'];
    container.querySelectorAll('a[href*="dishes/"], a[href*="/dishes/"]').forEach(a => {
      const href = a.getAttribute('href');
      const slugMatch = href.match(/dishes\/([^/)]+)\.md/);
      if (slugMatch) {
        a.setAttribute('href', '#/dish/' + slugMatch[1].replace(/\.md$/, ''));
        a.removeAttribute('target');
      }
    });
    container.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http')) return;
      const mdMatch = href.match(/([^/]+)\.md$/);
      if (!mdMatch) return;
      const id = mdMatch[1];
      if (manifest.dishes.some(d => d.slug === id)) {
        a.setAttribute('href', '#/dish/' + id);
      } else if (weekIds.includes(id)) {
        a.setAttribute('href', '#/menu/' + id);
      } else if (manifest.menus.some(m => m.id === id)) {
        a.setAttribute('href', '#/list/' + id);
      }
    });
  }

  async function render() {
    const main = document.getElementById('main');
    const route = getHashRoute();

    if (window.location.protocol === 'file:') {
      main.innerHTML = '<div class="error">' +
        '<p><strong>Приложение не работает по протоколу file://</strong></p>' +
        '<p>Запустите локальный сервер из папки проекта:</p>' +
        '<pre>node server.js</pre>' +
        '<p>Либо: <code>npx serve web</code>, затем откройте в браузере указанный адрес (например http://localhost:3000).</p>' +
        '<p>Перед первым запуском выполните: <code>node scripts/generate-manifest.js</code></p>' +
        '</div>';
      return;
    }

    try {
      await loadManifest();
      if (!fileRatings) await loadFileRatings();
    } catch (e) {
      main.innerHTML = '<div class="error">' +
        '<p><strong>Не удалось загрузить контент.</strong></p>' +
        '<p>' + (e.message || '') + '</p>' +
        '<p>Выполните в папке проекта: <code>node scripts/generate-manifest.js</code></p>' +
        '<p>Сайт должен открываться по HTTP (например через <code>node server.js</code> или <code>npx serve web</code>), а не как file://.</p>' +
        '</div>';
      return;
    }

    if (route.view === 'home') {
      main.innerHTML = renderHome();
      return;
    }

    if (route.view === 'week') {
      main.innerHTML = '<div class="loading">Загрузка…</div>';
      try {
        const menu = manifest.menus.find(m => m.id === route.weekId);
        const md = menu ? await fetchText(menu.file) : '';
        main.innerHTML = renderWeek(route.weekId, md);
        rewriteContentLinks(main);
      } catch (e) {
        main.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      }
      return;
    }

    if (route.view === 'day') {
      main.innerHTML = '<div class="loading">Загрузка…</div>';
      try {
        const menu = manifest.menus.find(m => m.id === route.weekId);
        const md = menu ? await fetchText(menu.file) : '';
        main.innerHTML = renderDay(route.weekId, route.dayIndex, md);
        rewriteContentLinks(main);
      } catch (e) {
        main.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      }
      return;
    }

    if (route.view === 'dish') {
      main.innerHTML = '<div class="loading">Загрузка…</div>';
      const fromWeekId = sessionStorage.getItem('fromWeek');
      const fromDay = sessionStorage.getItem('fromDay');
      const fromDayIndex = fromDay !== null ? parseInt(fromDay, 10) : null;
      try {
        const dish = manifest.dishes.find(d => d.slug === route.slug);
        const md = dish ? await fetchText(dish.file) : '';
        main.innerHTML = renderDish(route.slug, md, fromWeekId, fromDayIndex);
        rewriteContentLinks(main);
        bindRatingStars(main);
      } catch (e) {
        main.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      }
      return;
    }

    if (route.view === 'list') {
      main.innerHTML = '<div class="loading">Загрузка…</div>';
      try {
        const menu = manifest.menus.find(m => m.id === route.listId);
        const md = menu ? await fetchText(menu.file) : '';
        main.innerHTML = renderList(route.listId, md);
        rewriteContentLinks(main);
      } catch (e) {
        main.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      }
      return;
    }

    if (route.view === 'tips') {
      main.innerHTML = '<div class="loading">Загрузка…</div>';
      try {
        const tip = manifest.tips.find(t => t.id === route.tipId);
        const md = tip ? await fetchText(tip.file) : '';
        main.innerHTML = renderTips(route.tipId, md);
        rewriteContentLinks(main);
      } catch (e) {
        main.innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>';
      }
      return;
    }

    main.innerHTML = renderHome();
  }

  // При переходе на карточку блюда из дня — запомнить контекст для кнопки «Назад»
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/dish/"]');
    if (!a) return;
    const path = window.location.hash;
    const dayMatch = path.match(/#\/menu\/([^/]+)\/day\/(\d+)/);
    if (dayMatch) {
      sessionStorage.setItem('fromWeek', dayMatch[1]);
      sessionStorage.setItem('fromDay', dayMatch[2]);
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);

  // Бургер-меню на мобильном: открыть/закрыть и закрыть при переходе по ссылке
  (function initNavToggle() {
    const header = document.querySelector('.header');
    const toggle = document.querySelector('.nav-toggle');
    const overlay = document.getElementById('nav-overlay');
    const nav = document.getElementById('nav');
    if (!header || !toggle) return;
    function closeNav() {
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (overlay) overlay.setAttribute('aria-hidden', 'true');
    }
    function openNav() {
      header.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.setAttribute('aria-hidden', 'false');
    }
    toggle.addEventListener('click', function () {
      if (header.classList.contains('nav-open')) closeNav();
      else openNav();
    });
    if (overlay) overlay.addEventListener('click', closeNav);
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  })();
})();
