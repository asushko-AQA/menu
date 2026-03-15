# Как опубликовать сайт меню (доступ из любого места)

Перед первой публикацией выполните в корне проекта:

```bash
node scripts/generate-manifest.js
```

Так в `web/content/` попадёт актуальный контент и манифест. После любых правок в `docs/` снова запускайте этот скрипт и переопубликовывайте (или настройте автоматическую сборку ниже).

---

## Вариант 1: Netlify (рекомендуется)

Бесплатный хостинг, простая настройка, автосборка из Git.

1. Зарегистрируйтесь на [netlify.com](https://netlify.com) (можно через GitHub).
2. Создайте репозиторий на GitHub и загрузите туда проект (папку Menu).
3. В Netlify: **Add new site → Import an existing project** → выберите GitHub и репозиторий.
4. В настройках сборки укажите:
   - **Build command:** `node scripts/generate-manifest.js`
   - **Publish directory:** `web`
   - **Base directory:** оставьте пустым (корень репо).
5. Нажмите **Deploy**. Сайт получит адрес вида `https://случайное-имя.netlify.app`.
6. В **Site settings → Domain management** можно задать своё имя или поддомен (например `menu.netlify.app`).

При каждом пуше в репозиторий Netlify заново запустит `generate-manifest.js` и опубликует папку `web`.

---

## Вариант 2: Vercel

1. Зарегистрируйтесь на [vercel.com](https://vercel.com), привяжите GitHub.
2. **Add New → Project** → выберите репозиторий с меню.
3. В настройках:
   - **Root Directory:** оставьте `.` (корень).
   - **Build Command:** `node scripts/generate-manifest.js`
   - **Output Directory:** `web`
4. **Deploy**. Сайт будет по адресу вида `https://ваш-проект.vercel.app`.

---

## Вариант 3: Cloudflare Pages

1. Зайдите на [pages.cloudflare.com](https://pages.cloudflare.com), привяжите GitHub.
2. **Create a project → Connect to Git** → выберите репозиторий.
3. В настройках сборки:
   - **Framework preset:** None
   - **Build command:** `node scripts/generate-manifest.js`
   - **Build output directory:** `web`
4. **Save and Deploy**. Сайт получит адрес вида `https://имя-проекта.pages.dev`.

---

## Вариант 4: GitHub Pages (вручную)

GitHub Pages раздаёт файлы из репозитория. Удобнее всего держать готовый сайт в отдельной ветке или в папке `docs/` (тогда сайт будет по адресу `username.github.io/RepoName/`).

### Способ A: ветка `gh-pages` с содержимым папки `web`

1. В корне проекта выполните:
   ```bash
   node scripts/generate-manifest.js
   ```
2. Скопируйте всё содержимое папки `web/` (включая `content/`) во временную папку.
3. Переключитесь на ветку `gh-pages` (или создайте её), замените её содержимое файлами из `web/`, сделайте коммит и пуш.
4. В репозитории: **Settings → Pages** → Source: **Deploy from a branch** → ветка `gh-pages`, папка `/ (root)`.
5. Сайт будет доступен по адресу `https://username.github.io/ИмяРепозитория/`.

Если репозиторий называется `Menu`, откройте в браузере:  
`https://username.github.io/Menu/` (или `.../Menu/index.html`).

### Способ B: GitHub Actions (автосборка при пуше)

В репозитории создайте файл `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node scripts/generate-manifest.js
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web
  deploy-pages:
    needs: deploy
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

В настройках репозитория: **Settings → Pages** → Source: **GitHub Actions**. После пуша в `main` сайт будет собираться и публиковаться автоматически.

---

## Сменить удалённый репозиторий (другой пользователь)

Чтобы пушить в репозиторий другого пользователя или другой репозиторий:

1. **Посмотреть текущий remote:**
   ```bash
   git remote -v
   ```

2. **Заменить URL на новый** (подставьте свой логин и имя репо):
   ```bash
   git remote set-url origin https://github.com/НОВЫЙ_ПОЛЬЗОВАТЕЛЬ/ИМЯ_РЕПО.git
   ```
   Через SSH: `git remote set-url origin git@github.com:НОВЫЙ_ПОЛЬЗОВАТЕЛЬ/ИМЯ_РЕПО.git`

3. **Проверить:** снова выполните `git remote -v`.

4. **Первый push в новый remote:**
   ```bash
   git push -u origin main
   ```
   Если в удалённом репо уже есть коммиты (например, README при создании), сначала:
   ```bash
   git pull origin main --allow-unrelated-histories
   # при необходимости разрешить конфликты, затем:
   git push -u origin main
   ```

---

## Поддомен или свой домен

- **Netlify / Vercel / Cloudflare:** в настройках сайта укажите свой домен (например `menu.ваш-сайт.ru`) и выполните инструкции по добавлению CNAME или A-записи у регистратора.
- **GitHub Pages:** в **Settings → Pages** можно задать кастомный домен; в корне репо для Pages часто добавляют файл `CNAME` с именем домена.

---

## Доступ с телефона

После публикации откройте выданный URL на смартфоне. В мобильном браузере можно использовать **«Добавить на экран дома»** / **«Add to Home Screen»** — сайт будет открываться как приложение без панели браузера (за счёт meta `apple-mobile-web-app-capable` и аналогов).
