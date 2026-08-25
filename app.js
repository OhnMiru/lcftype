// =========================================================
// Летопись — запуск приложения
// =========================================================


// =========================================================
// Главная
// =========================================================

document
  .getElementById('homeLink')
  ?.addEventListener(
    'click',
    renderFeed
  );


// =========================================================
// Новая статья
// =========================================================

document
  .getElementById('newArticleBtn')
  ?.addEventListener(
    'click',
    openEditor
  );


// =========================================================
// Профиль
// =========================================================

document
  .getElementById('profileBtn')
  ?.addEventListener(
    'click',
    openProfile
  );


// =========================================================
// Запуск приложения
// =========================================================

(async function init() {
  try {

    const startParam =
      tg?.initDataUnsafe
        ?.start_param;

    if (startParam) {

      await openReader(
        startParam
      );

    } else {

      await renderFeed();
    }

  } catch (e) {

    console.error(
      'Init:',
      e
    );

    showToast(
      'Ошибка запуска приложения'
    );
  }
})();
