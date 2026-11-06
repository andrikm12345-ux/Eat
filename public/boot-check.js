// Loaded before the app (a plain file, not part of the bundle, so it still runs when the
// bundle fails to load). If nothing has been drawn after a while, the white screen gets a way
// out: reset the app files (not the data) and reload.
(function () {
  var WAIT_MS = 8000;

  function nothingDrawn() {
    var root = document.getElementById('root');
    return !root || root.childElementCount === 0;
  }

  function resetFiles() {
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (list) {
          return Promise.all(
            list.map(function (r) {
              return r.unregister();
            }),
          );
        }),
      );
    }
    if (window.caches && caches.keys) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (k) {
              return caches.delete(k);
            }),
          );
        }),
      );
    }
    return Promise.all(jobs).then(
      function () {
        location.reload();
      },
      function () {
        location.reload();
      },
    );
  }

  function show() {
    var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    var box = document.createElement('div');
    box.id = 'boot-fix-box';
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font:17px/1.4 -apple-system,system-ui,sans-serif;background:' +
      (dark ? '#111513' : '#f4f1ec') +
      ';color:' +
      (dark ? '#e9eeeb' : '#16201d');
    var text = document.createElement('p');
    text.textContent =
      'Приложение не загрузилось. Нажмите «Обновить приложение»: сохранённые файлы сбросятся и загрузятся заново. Ваши записи при этом не удаляются.';
    text.style.cssText = 'max-width:320px;margin:0';
    var button = document.createElement('button');
    button.id = 'boot-fix-button';
    button.type = 'button';
    button.textContent = 'Обновить приложение';
    button.style.cssText =
      'min-height:48px;padding:0 24px;border:0;border-radius:12px;background:#1f7266;color:#fff;font:600 17px -apple-system,system-ui,sans-serif';
    button.addEventListener('click', function () {
      button.disabled = true;
      resetFiles();
    });
    box.appendChild(text);
    box.appendChild(button);
    document.body.appendChild(box);
    // A very slow network: if the app does appear after all, step out of its way.
    var watch = window.setInterval(function () {
      if (!nothingDrawn()) {
        window.clearInterval(watch);
        if (box.parentNode) box.parentNode.removeChild(box);
      }
    }, 500);
  }

  window.setTimeout(function () {
    if (nothingDrawn() && !document.getElementById('boot-fix-box')) show();
  }, WAIT_MS);
})();
