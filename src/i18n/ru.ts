// All user-facing strings live here (UI language: Russian).
export const ru = {
  appName: 'Дневник',
  nav: {
    label: 'Основная навигация',
    today: 'Сегодня',
    diary: 'Дневник',
    progress: 'Прогресс',
    reports: 'Отчёты',
    more: 'Ещё',
  },
  add: {
    fab: 'Добавить',
    title: 'Добавить',
    close: 'Закрыть',
    soon: 'Скоро',
    tiles: {
      search: 'Поиск',
      barcode: 'Штрихкод',
      photoAi: 'Фото (ИИ)',
      textAi: 'Текст (ИИ)',
      labelAi: 'Этикетка (ИИ)',
      quickKcal: 'Быстро ккал',
      recipe: 'Рецепт',
      template: 'Шаблон',
      repeat: 'Повторить',
    },
  },
  pwa: {
    updateAvailable: 'Доступно обновление',
    updateAction: 'Обновить',
    later: 'Позже',
    offlineReady: 'Приложение готово к работе без сети',
    ok: 'Понятно',
  },
  pages: {
    today: {
      title: 'Сегодня',
      empty: 'Здесь появится сводка дня: калории, БЖУ, вес и поток приёмов пищи.',
    },
    diary: { title: 'Дневник', empty: 'Здесь будет календарь дней с записями.' },
    progress: { title: 'Прогресс', empty: 'Здесь будут график веса, замеры и фото прогресса.' },
    reports: {
      title: 'Отчёты',
      empty: 'Здесь будут еженедельный разбор, расход энергии и микронутриенты.',
    },
    more: { title: 'Ещё', empty: 'Профиль, цели, рецепты, импорт и экспорт, настройки.' },
    notFound: { title: 'Страница не найдена', back: 'На главную' },
  },
  common: {
    loading: 'Загрузка…',
    stageNote: 'Раздел в разработке',
  },
} as const;

export type Ru = typeof ru;
