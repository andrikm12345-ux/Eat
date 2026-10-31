# Дневник

Личный offline-first PWA-трекер питания и веса. Без бэкенда: все данные хранятся локально в IndexedDB.

## Разработка

```bash
npm ci          # Node >= 22.12
npm run dev     # http://localhost:5173
npm run lint    # ESLint + Prettier
npm test        # Vitest
npm run build   # tsc + vite build + проверка бюджета бандла (≤ 300 КБ gzip)
npm run preview # прод-сборка локально (service worker работает только тут, не в dev)
```

Иконки генерируются скриптом без зависимостей: `npm run icons` (результат закоммичен в `public/icons`).

## Деплой на Vercel

`vercel.json` уже настроен (SPA-rewrites, `sw.js` без кэша, `assets/` — immutable).

```bash
npx vercel --prod
```

или подключите репозиторий в панели Vercel — фреймворк определится как Vite.

Полная инструкция по установке на iPhone/Android появится на этапе 11.
