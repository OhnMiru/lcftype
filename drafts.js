// =========================================================
// Летопись — список черновиков
// =========================================================


// =========================================================
// Рендер списка черновиков
// =========================================================

function renderDraftsList() {
  state.view = 'drafts';
  state.currentId = null;

  setBackButton(true, renderFeed);

  const main = document.getElementById('main');
  if (!main) return;

  const drafts = getDraftsFromStorage();
  const nonEmptyDrafts = drafts.filter(d => !isEmptyDraft(d));
  const emptyDrafts = drafts.filter(d => isEmptyDraft(d));

  main.innerHTML = `
    <div class="drafts-page">
      <div class="drafts-header">
        <h2 class="drafts-title">Мои черновики</h2>
        <span class="drafts-count">${drafts.length} из ${MAX_DRAFTS}</span>
      </div>

      ${drafts.length >= DRAFTS_WARNING_THRESHOLD ? `
        <div class="drafts-warning chrome">
          Осталось ${MAX_DRAFTS - drafts.length} место для черновиков. 
          Чтобы создать новый, удалите старые.
        </div>
      ` : ''}

      ${drafts.length === 0 ? `
        <div class="drafts-empty">
          <p>У вас пока нет черновиков</p>
          <button class="btn btn-primary" id="createFirstDraftBtn">
            + Создать черновик
          </button>
        </div>
      ` : ''}

      <div class="drafts-list">
        ${nonEmptyDrafts.map(draft => renderDraftCard(draft)).join('')}
        ${emptyDrafts.map(draft => renderDraftCard(draft, true)).join('')}
      </div>

      ${drafts.length < MAX_DRAFTS ? `
        <button class="btn btn-primary drafts-new-btn" id="newDraftFromListBtn">
          + Новый черновик
        </button>
      ` : ''}

      ${drafts.length >= MAX_DRAFTS ? `
        <div class="drafts-limit-reached">
          Достигнут лимит черновиков (${MAX_DRAFTS})
        </div>
      ` : ''}
    </div>
  `;

  // =======================================================
  // Привязываем события
  // =======================================================

  // Создать новый черновик
  document.getElementById('createFirstDraftBtn')?.addEventListener('click', () => {
    const draft = createNewDraft();
    if (draft) {
      openEditor(draft.id);
    }
  });

  document.getElementById('newDraftFromListBtn')?.addEventListener('click', () => {
    const draft = createNewDraft();
    if (draft) {
      openEditor(draft.id);
    }
  });

  // Карточки черновиков
  document.querySelectorAll('.draft-card').forEach(card => {
    const draftId = card.dataset.draftId;

    // Клик по карточке — открыть редактор
    card.addEventListener('click', (e) => {
      // Игнорируем клики по кнопкам внутри карточки
      if (e.target.closest('.draft-card-btn')) return;
      openEditor(draftId);
    });

    // Кнопка "Редактировать"
    card.querySelector('.draft-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditor(draftId);
    });

    // Кнопка "Опубликовать" (только для непустых черновиков)
    card.querySelector('.draft-publish-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const draft = getDraftById(draftId);
      if (draft) {
        state.draft = JSON.parse(JSON.stringify(draft));
        state.activeDraftId = draft.id;
        state.hasDraft = !isEmptyDraft(draft);
        publishDraft();
      }
    });

    // Кнопка "Удалить"
    card.querySelector('.draft-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Удалить черновик безвозвратно?')) {
        deleteDraftById(draftId);
        renderDraftsList();
        updateDraftsButtonVisibility();
        showToast('Черновик удалён');
      }
    });
  });

  // Обновляем видимость кнопки в топбаре
  updateDraftsButtonVisibility();
}


// =========================================================
// Рендер одной карточки черновика
// =========================================================

function renderDraftCard(draft, isEmpty = false) {
  const id = draft.id;
  const title = draft.title || 'Без названия';
  const shortTitle = title.length > 40 ? title.slice(0, 40) + '…' : title;

  const wordCount = countWords(draft.blocks.map(b => b.html || '').join(' '));
  const imageCount = countImages(draft.blocks);
  const updatedAt = fmtDateShort(draft.updatedAt);

  let stats = [];
  if (wordCount > 0) stats.push(wordCount + ' слов');
  if (imageCount > 0) stats.push(imageCount + ' изображений');
  if (isEmpty) stats = ['Пусто'];

  const statsText = stats.length > 0 ? stats.join(' · ') : '';

  return `
    <div class="draft-card ${isEmpty ? 'draft-card-empty' : ''}" data-draft-id="${escapeHtml(id)}">
      <div class="draft-card-content">
        <div class="draft-card-title">
          ${escapeHtml(shortTitle)}
        </div>
        <div class="draft-card-meta">
          <span class="draft-card-date">${escapeHtml(updatedAt)}</span>
          ${statsText ? ` · <span class="draft-card-stats">${escapeHtml(statsText)}</span>` : ''}
        </div>
      </div>

      <div class="draft-card-actions">
        <button class="btn btn-secondary draft-card-btn draft-edit-btn" type="button">
          Редактировать
        </button>

        ${!isEmpty ? `
          <button class="btn btn-primary draft-card-btn draft-publish-btn" type="button">
            Опубликовать
          </button>
        ` : ''}

        <button class="btn btn-danger draft-card-btn draft-delete-btn" type="button">
          Удалить
        </button>
      </div>
    </div>
  `;
}
