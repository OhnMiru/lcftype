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
    () => {
      const savedDraft = loadDraftFromStorage();
      if (savedDraft && !isDraftEmpty(savedDraft)) {
        if (confirm('У вас есть несохраненный черновик. Продолжить работу над ним?')) {
          openEditor();
          return;
        } else {
          clearDraft();
        }
      }
      openEditor();
    }
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
      
      checkDraftOnStartup();
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


// =========================================================
// Проверка черновика при запуске
// =========================================================

function checkDraftOnStartup() {
  try {
    const savedDraft = loadDraftFromStorage();
    
    if (savedDraft && !isDraftEmpty(savedDraft)) {
      showDraftNotification(savedDraft);
    }
  } catch (e) {
    console.warn('checkDraftOnStartup error:', e);
  }
}


// =========================================================
// Показать уведомление о черновике
// =========================================================

function showDraftNotification(draft) {
  const notification = document.createElement('div');
  notification.className = 'draft-notification chrome';
  
  let preview = '';
  if (draft.title && draft.title.trim()) {
    preview = draft.title.trim();
  } else if (draft.blocks && draft.blocks.length) {
    const firstText = draft.blocks.find(b => b.type === 'text' && b.html && b.html.replace(/<[^>]+>/g, '').trim());
    if (firstText) {
      preview = firstText.html.replace(/<[^>]+>/g, '').trim().slice(0, 60);
      if (preview.length > 60) preview += '…';
    }
  }
  
  if (!preview) {
    preview = 'Новый черновик';
  }
  
  notification.innerHTML = `
    <div class="draft-notification-content">
      <div class="draft-notification-text">
        <div class="draft-notification-title">У вас есть черновик</div>
        <div class="draft-notification-preview">${escapeHtml(preview)}</div>
      </div>
    </div>
    <div class="draft-notification-actions">
      <button class="btn btn-secondary draft-notification-btn" id="draftRestoreBtn">Восстановить</button>
      <button class="btn btn-ghost draft-notification-btn" id="draftDiscardBtn">Удалить</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('visible');
  });
  
  document.getElementById('draftRestoreBtn').addEventListener('click', () => {
    notification.remove();
    openEditor();
  });
  
  document.getElementById('draftDiscardBtn').addEventListener('click', () => {
    if (confirm('Удалить черновик безвозвратно?')) {
      clearDraft();
      notification.remove();
      showToast('Черновик удален');
    }
  });
  
  notification.addEventListener('click', (e) => {
    if (e.target === notification) {
      notification.remove();
    }
  });
}
