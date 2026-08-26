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
      // Проверяем, есть ли уже черновики
      const drafts = getDraftsFromStorage();
      
      if (drafts.length > 0) {
        // Если есть черновики — показываем список
        renderDraftsList();
      } else {
        // Если черновиков нет — создаём новый
        openEditor();
      }
    }
  );


// =========================================================
// Черновики (кнопка появляется только если есть черновики)
// =========================================================

// Создаём кнопку в топбаре, но скрываем её по умолчанию
const draftsBtn = document.createElement('button');
draftsBtn.className = 'btn btn-secondary drafts-btn';
draftsBtn.id = 'draftsBtn';
draftsBtn.textContent = 'Черновики';
draftsBtn.style.display = 'none';
draftsBtn.addEventListener('click', renderDraftsList);

// Вставляем кнопку между "Новая статья" и "Профиль"
const newArticleBtn = document.getElementById('newArticleBtn');
const profileBtn = document.getElementById('profileBtn');
if (newArticleBtn && profileBtn) {
  newArticleBtn.parentNode.insertBefore(draftsBtn, profileBtn);
}


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
    // Миграция старого черновика
    const hasMigrated = migrateOldDraft();
    if (hasMigrated) {
      console.log('Старый черновик перенесён в новую систему');
    }

    const startParam =
      tg?.initDataUnsafe
        ?.start_param;

    if (startParam) {
      await openReader(startParam);
    } else {
      await renderFeed();
      checkDraftsOnStartup();
    }

    // Обновляем видимость кнопки "Черновики"
    updateDraftsButtonVisibility();

  } catch (e) {
    console.error('Init:', e);
    showToast('Ошибка запуска приложения');
  }
})();


// =========================================================
// Проверка черновиков при запуске
// =========================================================

function checkDraftsOnStartup() {
  try {
    const drafts = getDraftsFromStorage();
    const nonEmptyDrafts = drafts.filter(d => !isEmptyDraft(d));
    
    if (nonEmptyDrafts.length > 0) {
      // Если есть непустые черновики — показываем уведомление
      if (nonEmptyDrafts.length === 1) {
        // Один черновик — показываем уведомление как раньше
        showDraftNotification(nonEmptyDrafts[0]);
      } else {
        // Несколько черновиков — показываем общее уведомление
        showMultipleDraftsNotification(nonEmptyDrafts.length);
      }
    }
  } catch (e) {
    console.warn('checkDraftsOnStartup error:', e);
  }
}


// =========================================================
// Показать уведомление об одном черновике
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
    openEditor(draft.id);
  });
  
  document.getElementById('draftDiscardBtn').addEventListener('click', () => {
    if (confirm('Удалить черновик безвозвратно?')) {
      deleteDraftById(draft.id);
      notification.remove();
      updateDraftsButtonVisibility();
      showToast('Черновик удалён');
    }
  });
  
  notification.addEventListener('click', (e) => {
    if (e.target === notification) {
      notification.remove();
    }
  });
}


// =========================================================
// Показать уведомление о нескольких черновиках
// =========================================================

function showMultipleDraftsNotification(count) {
  const notification = document.createElement('div');
  notification.className = 'draft-notification chrome';
  
  notification.innerHTML = `
    <div class="draft-notification-content">
      <div class="draft-notification-text">
        <div class="draft-notification-title">У вас есть ${count} черновика</div>
        <div class="draft-notification-preview">Нажмите, чтобы перейти к списку</div>
      </div>
    </div>
    <div class="draft-notification-actions">
      <button class="btn btn-secondary draft-notification-btn" id="draftsListBtn">Перейти к черновикам</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('visible');
  });
  
  document.getElementById('draftsListBtn').addEventListener('click', () => {
    notification.remove();
    renderDraftsList();
  });
  
  notification.addEventListener('click', (e) => {
    if (e.target === notification) {
      notification.remove();
    }
  });
}


// =========================================================
// Обновить видимость кнопки "Черновики"
// =========================================================

function updateDraftsButtonVisibility() {
  const btn = document.getElementById('draftsBtn');
  if (!btn) return;

  const drafts = getDraftsFromStorage();
  const hasNonEmpty = drafts.some(d => !isEmptyDraft(d));

  btn.style.display = hasNonEmpty ? 'inline-flex' : 'none';
}


// =========================================================
// Экспортируем функцию обновления для использования в других модулях
// =========================================================

// Сохраняем ссылку на функцию в глобальном объекте
window.updateDraftsButtonVisibility = updateDraftsButtonVisibility;
