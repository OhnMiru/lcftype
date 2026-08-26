// =========================================================
// Летопись — редактор статей (с поддержкой нескольких черновиков)
// Исправленная версия: безопасное форматирование, iOS-фиксы
// =========================================================


function bindTapButton(btn, onActivate) {
  let handledByPointer = false;
  let resetTimer = null;

  // iOS/Android Telegram WebView: сохраняем выделение ДО того,
  // как браузер начнёт обрабатывать касание кнопки.
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      saveCurrentSelection();
      e.preventDefault();
    }
  }, { passive: false });

  btn.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      e.preventDefault();
      handledByPointer = true;

      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        handledByPointer = false;
      }, 700);

      onActivate(e);
    }
  }, { passive: false });

  // Fallback для старых WebView без pointer events.
  btn.addEventListener('touchstart', (e) => {
    saveCurrentSelection();
    e.preventDefault();
  }, { passive: false });

  btn.addEventListener('touchend', (e) => {
    if (handledByPointer) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    handledByPointer = true;

    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      handledByPointer = false;
    }, 700);

    onActivate(e);
  }, { passive: false });

  // Desktop.
  btn.addEventListener('mousedown', (e) => {
    saveCurrentSelection();
    e.preventDefault();
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (handledByPointer) return;
    onActivate(e);
  });
}


// =========================================================
// Открыть редактор с черновиком по ID
// =========================================================

async function openEditor(draftId) {
  try {
    if (!tg?.initData) {
      showToast('Откройте приложение внутри Telegram');
      return;
    }

    const p = await ensureProfile(true);
    if (!p) return;

    state.view = 'editor';
    state.currentId = null;

    // Миграция старого черновика при первом запуске
    const hasMigrated = migrateOldDraft();
    if (hasMigrated) {
      showToast('Старый черновик перенесён в список');
    }

    // Если передан ID — загружаем конкретный черновик
    if (draftId) {
      const draft = getDraftById(draftId);
      if (draft) {
        state.draft = JSON.parse(JSON.stringify(draft));
        state.activeDraftId = draft.id;
        state.hasDraft = !isEmptyDraft(draft);
      } else {
        showToast('Черновик не найден');
        renderFeed();
        return;
      }
    } else {
      // Если ID не передан — создаём новый черновик
      const newDraft = createNewDraft();
      if (!newDraft) {
        // Лимит достигнут — открываем список черновиков
        renderDraftsList();
        return;
      }
      state.draft = JSON.parse(JSON.stringify(newDraft));
      state.activeDraftId = newDraft.id;
      state.hasDraft = false;
    }

    setBackButton(true, () => {
      // Сохраняем текущий черновик перед выходом
      saveBlocksContent();
      if (state.draft && !isEmptyDraft(state.draft)) {
        saveDraft(state.draft);
        state.hasDraft = true;
      }
      renderFeed();
    });

    renderEditor();

  } catch (e) {
    console.error('openEditor error:', e);
    showToast(e.message || 'Не удалось открыть редактор');
  }
}


// =========================================================
// Редактирование существующей статьи (создаёт черновик)
// =========================================================

function editArticle(article) {
  if (!isArticleOwner(article)) {
    showToast('Вы не являетесь автором этой статьи');
    return;
  }

  // Проверяем лимит черновиков
  const drafts = getDraftsFromStorage();
  if (drafts.length >= MAX_DRAFTS) {
    showToast('Достигнут лимит черновиков (10). Удалите ненужные.');
    return;
  }

  state.view = 'editor';
  state.currentId = article.id;

  // Создаём черновик из статьи
  const draft = {
    id: generateDraftId(),
    title: article.title || '',
    cover: article.cover || null,
    blocks: JSON.parse(JSON.stringify(article.blocks || [])),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _isEdit: true,
    _originalId: article.id
  };

  if (!draft.blocks.length) {
    draft.blocks = [{ type: 'text', html: '' }];
  }

  // Сохраняем черновик
  saveDraft(draft);
  state.draft = JSON.parse(JSON.stringify(draft));
  state.activeDraftId = draft.id;
  state.hasDraft = !isEmptyDraft(draft);

  setBackButton(true, () => {
    saveBlocksContent();
    if (state.draft && !isEmptyDraft(state.draft)) {
      saveDraft(state.draft);
      state.hasDraft = true;
    }
    openReader(article.id);
  });

  renderEditor();
}


// =========================================================
// Рендер редактора
// =========================================================

function renderEditor() {
  const main = document.getElementById('main');
  const d = state.draft;

  if (!d) {
    main.innerHTML = '<div class="empty-state"><p>Черновик не найден</p></div>';
    return;
  }

  // Проверяем, есть ли другие черновики для кнопки "К черновикам"
  const drafts = getDraftsFromStorage();
  const hasOtherDrafts = drafts.length > 1;

  // Считаем слова
  const wordCount = countWords(d.blocks.map(b => b.html || '').join(' '));
  const imageCount = countImages(d.blocks);

  // Баннер черновика
  const draftBanner = state.hasDraft && !isEmptyDraft(d) ? `
    <div class="draft-banner chrome" id="draftBanner">
      <span>Черновик сохранён</span>
      <span class="draft-banner-stats">
        ${wordCount > 0 ? wordCount + ' слов' : ''}
        ${wordCount > 0 && imageCount > 0 ? ' · ' : ''}
        ${imageCount > 0 ? imageCount + ' изображений' : ''}
      </span>
      <button class="draft-banner-close" id="clearDraftBtn">×</button>
    </div>
  ` : '';

  // Кнопка "К черновикам" (только если есть другие черновики)
  const draftsBtn = hasOtherDrafts ? `
    <button class="btn btn-secondary" id="goToDraftsBtn" type="button">
      К черновикам
    </button>
  ` : '';

  const title = d.title || 'Без названия';
  const shortTitle = title.length > 30 ? title.slice(0, 30) + '…' : title;

  main.innerHTML = `
    <div class="editor-header">
      <div class="editor-header-left">
        <span class="editor-draft-title">${escapeHtml(shortTitle)}</span>
      </div>
      <div class="editor-header-right">
        ${draftsBtn}
        <span class="editor-save-status" id="saveStatus">● Сохранено</span>
      </div>
    </div>

    ${draftBanner}

    <input
      class="editor-title-input"
      id="titleInput"
      placeholder="Заголовок статьи"
      value="${escapeHtml(d.title)}"
    >

    <div class="cover-editor" id="coverEditor">
      <div class="cover-editor-header">
        <div>
          <div class="cover-editor-title">Обложка</div>
          <div class="cover-editor-subtitle">Она будет видна на главной, но не внутри статьи.</div>
        </div>
        ${d.cover ? `
          <button class="cover-remove-btn" id="removeCoverBtn" type="button">
            Убрать
          </button>
        ` : ''}
      </div>

      ${d.cover ? `
        <div class="cover-preview">
          <img src="${escapeHtml(d.cover)}" alt="">
          <button class="cover-change-btn" id="changeCoverBtn" type="button">
            Заменить обложку
          </button>
        </div>
      ` : `
        <button class="cover-empty" id="addCoverBtn" type="button">
          <span class="cover-empty-icon">＋</span>
          <span>Добавить обложку</span>
        </button>
      `}
    </div>

    <div id="blocksHost"></div>

    <div class="editor-actions">
      <button class="btn btn-secondary" id="saveDraftBtn" type="button">
        Сохранить черновик
      </button>
      <button class="btn btn-primary publish-btn" id="publishBtn" type="button">
        ${d._isEdit ? 'Сохранить изменения' : 'Опубликовать'}
      </button>
    </div>

    <input type="file" accept="image/*" id="coverInput" style="display:none">
    <input type="file" accept="image/*" multiple id="fileInput" style="display:none">

    <div class="hint chrome" id="editorHint"></div>

    <!-- Плавающая панель форматирования -->
    <div id="floatingToolbar" class="floating-toolbar">
      <button data-cmd="bold" title="Жирный"><strong>B</strong></button>
      <button data-cmd="italic" title="Курсив"><em>i</em></button>
      <button data-cmd="underline" title="Подчёркнутый"><u>U</u></button>
      <button data-cmd="strikeThrough" title="Зачеркнутый">
        <span style="text-decoration:line-through;">S</span>
      </button>
      <span class="toolbar-divider"></span>
      <button data-cmd="mono" title="Моноширинный"><code>mono</code></button>
      <button data-cmd="blockquote" title="Цитировать">❝</button>
      <button data-cmd="spoiler" title="Скрытый">◼</button>
      <span class="toolbar-divider"></span>
      <button data-cmd="removeFormat" title="Обычный текст" class="remove-format-btn">T</button>
    </div>
  `;

  // =======================================================
  // Заголовок
  // =======================================================

  document.getElementById('titleInput').oninput = e => {
    d.title = e.target.value;
    autoSaveDraft();
    updateDraftTitle();
  };

  // =======================================================
  // Кнопка "К черновикам"
  // =======================================================

  document.getElementById('goToDraftsBtn')?.addEventListener('click', () => {
    saveBlocksContent();
    if (d && !isEmptyDraft(d)) {
      saveDraft(d);
      state.hasDraft = true;
    }
    renderDraftsList();
  });

  // =======================================================
  // Плавающая панель форматирования
  //
  // ВАЖНО: mousedown/touchstart с preventDefault() —
  // не даём кнопке украсть фокус у contenteditable-блока.
  // Без этого на iOS Safari фокус/выделение теряются ДО
  // срабатывания click, и форматирование/выделение
  // применяется не туда (в т.ч. слипание абзацев).
  // =======================================================

  document.querySelectorAll('#floatingToolbar button').forEach(btn => {
    // iOS: кнопка toolbar не должна сама становиться выделяемым текстом.
    btn.style.webkitUserSelect = 'none';
    btn.style.userSelect = 'none';
    btn.style.webkitTouchCallout = 'none';
    btn.style.touchAction = 'manipulation';
    bindTapButton(btn, () => {
      if (!activeBlockEl) {
        showToast('Нажмите на текст, чтобы начать редактирование');
        return;
      }
      applyFormatCommand(btn.dataset.cmd);
    });
  });

  // =======================================================
  // Обложка
  // =======================================================

  document.getElementById('addCoverBtn')?.addEventListener('click', () =>
    document.getElementById('coverInput').click()
  );

  document.getElementById('changeCoverBtn')?.addEventListener('click', () =>
    document.getElementById('coverInput').click()
  );

  document.getElementById('removeCoverBtn')?.addEventListener('click', () => {
    d.cover = null;
    renderEditor();
    showToast('Обложка убрана');
    autoSaveDraft();
  });

  document.getElementById('coverInput').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;

    try {
      d.cover = await compressImageFile(f, 1600, 0.6);
      renderEditor();
      autoSaveDraft();
    } catch (err) {
      showToast('Не удалось обработать обложку');
    }
    e.target.value = '';
  };

  // =======================================================
  // Выбор изображений для блоков
  // =======================================================

  document.getElementById('fileInput').onchange = async e => {
    const files = [...e.target.files || []];

    if (!files.length) return;

    try {
      const idx = Number.isInteger(state.pendingImageInsertIndex)
        ? state.pendingImageInsertIndex
        : d.blocks.length;

      const blocks = [];
      for (const f of files) {
        blocks.push({
          type: 'image',
          src: await compressImageFile(f),
          caption: '',
          _pendingFile: true
        });
      }

      d.blocks.splice(idx, 0, ...blocks);
      state.pendingImageInsertIndex = null;

      renderBlocks({ focusIndex: idx });
      autoSaveDraft();

    } catch (err) {
      showToast('Не удалось обработать изображение');
    }

    e.target.value = '';
  };

  // =======================================================
  // Сохранить черновик (ручное сохранение)
  // =======================================================

  document.getElementById('saveDraftBtn').addEventListener('click', () => {
    saveBlocksContent();
    if (d && !isEmptyDraft(d)) {
      saveDraft(d);
      state.hasDraft = true;
      showToast('Черновик сохранён');
      updateSaveStatus('Сохранено');
    } else {
      showToast('Черновик пуст, сохранение не требуется');
    }
  });

  // =======================================================
  // Публикация
  // =======================================================

  document.getElementById('publishBtn').onclick = publishDraft;

  // =======================================================
  // Баннер черновика — удалить
  // =======================================================

  document.getElementById('clearDraftBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Удалить этот черновик безвозвратно?')) {
      if (state.activeDraftId) {
        deleteDraftById(state.activeDraftId);
      }
      state.draft = null;
      state.activeDraftId = null;
      state.hasDraft = false;
      renderDraftsList();
      showToast('Черновик удалён');
    }
  });

  // =======================================================
  // Блоки
  // =======================================================

  renderBlocks();

  // =======================================================
  // Инициализация плавающей панели
  // =======================================================

  initFloatingToolbar();

  updateSaveStatus('Сохранено');
}


// =========================================================
// Обновить заголовок в хедере
// =========================================================

function updateDraftTitle() {
  const titleEl = document.querySelector('.editor-draft-title');
  if (!titleEl) return;

  const d = state.draft;
  const title = d?.title || 'Без названия';
  titleEl.textContent = title.length > 30 ? title.slice(0, 30) + '…' : title;
}


// =========================================================
// Обновить статус сохранения
// =========================================================

function updateSaveStatus(status) {
  const el = document.getElementById('saveStatus');
  if (!el) return;

  const statusMap = {
    'Сохранено': '● Сохранено',
    'Сохранение…': '◉ Сохранение…',
    'Ошибка': '✕ Ошибка'
  };

  el.textContent = statusMap[status] || status;
  el.className = 'editor-save-status ' + status.toLowerCase().replace(/[^a-z]/g, '');
}


// =========================================================
// Сохранить текущее содержимое блоков в state
// =========================================================

function saveBlocksContent() {
  const host = document.getElementById('blocksHost');
  if (!host) return;

  const d = state.draft;
  if (!d) return;

  host.querySelectorAll('.block-text').forEach(el => {
    const i = parseInt(el.dataset.i);
    if (!isNaN(i) && d.blocks[i]?.type === 'text') {
      d.blocks[i].html = sanitizeHtml(el.innerHTML);
    }
  });

  host.querySelectorAll('.block-caption').forEach(el => {
    const i = parseInt(el.dataset.i);
    if (!isNaN(i) && d.blocks[i]?.type === 'image') {
      d.blocks[i].caption = el.value;
    }
  });
}


// =========================================================
// Добавить блок после указанного
// =========================================================

function insertBlockAfter(index, block) {
  saveBlocksContent();
  state.draft.blocks.splice(index + 1, 0, block);
  renderBlocks({ focusIndex: block.type === 'text' ? index + 1 : null });
  autoSaveDraft();
}


// =========================================================
// Открыть выбор изображения
// =========================================================

function openImagePicker(insertIndex) {
  state.pendingImageInsertIndex = insertIndex;
  const input = document.getElementById('fileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}


// =========================================================
// Кнопки добавления блоков
// =========================================================

function createBlockAddControls(index) {
  const row = document.createElement('div');
  row.className = 'block-add-row';

  row.innerHTML = `
    <button class="block-add-btn" type="button" data-add="text">
      ＋ Текст
    </button>
    <button class="block-add-btn" type="button" data-add="image">
      ＋ Картинка
    </button>
  `;

  bindTapButton(row.querySelector('[data-add="text"]'), () => {
    insertBlockAfter(index, { type: 'text', html: '' });
  });

  bindTapButton(row.querySelector('[data-add="image"]'), () => {
    // Явно фиксируем текущее содержимое ДО открытия нативного
    // пикера — на iOS открытие пикера уводит WebView в фон,
    // и к моменту возврата DOM может быть в непредсказуемом
    // состоянии.
    saveBlocksContent();
    openImagePicker(index + 1);
  });

  return row;
}


// =========================================================
// Рендер блоков
// =========================================================

function renderBlocks(options = {}) {
  const host = document.getElementById('blocksHost');
  if (!host) return;

  const d = state.draft;
  if (!d) return;

  saveBlocksContent();

  const old = activeBlockEl;
  let activeIndex = null;
  let offset = null;

  if (old?.isConnected && old.dataset.i !== undefined) {
    activeIndex = Number(old.dataset.i);
    try {
      const s = getSelection();
      if (s?.rangeCount) {
        const r = s.getRangeAt(0);
        if (old.contains(r.startContainer)) {
          offset = getCaretOffset(old, r);
        }
      }
    } catch (e) {}
  }

  host.innerHTML = '';

  // После перерендера старые Range указывают на удалённые DOM-ноды.
  clearSavedSelection();

  d.blocks.forEach((b, i) => {
    const block = document.createElement('div');
    block.className = 'block';
    block.dataset.i = i;

    if (b.type === 'text') {
      block.innerHTML = `
        <button class="block-remove" data-act="del" data-i="${i}" type="button">×</button>
        <div class="block-text" contenteditable="true" data-i="${i}" data-placeholder="Текст абзаца…">
          ${sanitizeHtml(b.html || '')}
        </div>
      `;
    } else if (b.type === 'image') {
      block.className = 'block block-image-wrap';
      block.innerHTML = `
        <button class="block-remove" data-act="del" data-i="${i}" type="button">×</button>
        <img src="${escapeHtml(b.src || '')}" alt="">
        <input class="block-caption" data-i="${i}" placeholder="Подпись (необязательно)" value="${escapeHtml(b.caption || '')}">
      `;
    } else {
      return;
    }

    host.appendChild(block);
    host.appendChild(createBlockAddControls(i));
  });

  // Текстовые блоки
  host.querySelectorAll('.block-text').forEach(el => {
    el.onfocus = () => {
      activeBlockEl = el;

      if (savedSelectionBlock !== el) {
        clearSavedSelection();
      }
    };
    el.oninput = e => {
      const i = +e.target.dataset.i;
      if (d.blocks[i]?.type === 'text') {
        d.blocks[i].html = sanitizeHtml(e.target.innerHTML);
      }
      autoSaveDraft();
    };
    el.onkeyup = () => { activeBlockEl = el; };
    el.onmouseup = () => {
      activeBlockEl = el;
      setTimeout(saveCurrentSelection, 0);
    };
  });

  // Подписи изображений
  host.querySelectorAll('.block-caption').forEach(el => {
    el.oninput = e => {
      const i = +e.target.dataset.i;
      if (d.blocks[i]?.type === 'image') {
        d.blocks[i].caption = e.target.value;
      }
      autoSaveDraft();
    };
  });

  // Удаление блоков
  host.querySelectorAll('[data-act="del"]').forEach(el => {
    el.onclick = () => {
      const i = +el.dataset.i;
      if (!d.blocks[i]) return;

      d.blocks.splice(i, 1);
      if (!d.blocks.length) {
        d.blocks.push({ type: 'text', html: '' });
      }

      renderBlocks({
        focusIndex: Math.min(i, d.blocks.length - 1)
      });
      autoSaveDraft();
    };
  });

  // Фокус на новый блок
  if (options.focusIndex !== undefined && options.focusIndex !== null) {
    const t = host.querySelector(`.block-text[data-i="${options.focusIndex}"]`);
    if (t) {
      requestAnimationFrame(() => {
        t.focus();
        activeBlockEl = t;
        placeCaretAtEnd(t);
      });
    }
    return;
  }

  // Восстановление старого фокуса
  if (activeIndex !== null && activeIndex < d.blocks.length) {
    const t = host.querySelector(`.block-text[data-i="${activeIndex}"]`);
    if (t && document.activeElement === document.body) {
      t.focus();
      activeBlockEl = t;
      if (offset !== null) {
        setCaretOffset(t, offset);
      }
    }
  }

  updateDraftBanner();
}


// =========================================================
// Получить позицию курсора
// =========================================================

function getCaretOffset(el, range) {
  const r = range.cloneRange();
  r.selectNodeContents(el);
  r.setEnd(range.startContainer, range.startOffset);
  return r.toString().length;
}


// =========================================================
// Установить позицию курсора
// =========================================================

function setCaretOffset(el, offset) {
  const s = getSelection();
  if (!s) return;

  const r = document.createRange();
  let cur = 0;
  let found = false;

  function walk(n) {
    if (found) return;

    if (n.nodeType === 3) {
      const len = n.nodeValue.length;
      if (cur + len >= offset) {
        r.setStart(n, Math.max(0, offset - cur));
        r.collapse(true);
        found = true;
        return;
      }
      cur += len;
      return;
    }

    n.childNodes.forEach(walk);
  }

  walk(el);

  if (!found) {
    placeCaretAtEnd(el);
    return;
  }

  s.removeAllRanges();
  s.addRange(r);
}


// =========================================================
// Поставить курсор в конец
// =========================================================

function placeCaretAtEnd(el) {
  const s = getSelection();
  if (!s) return;

  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  s.removeAllRanges();
  s.addRange(r);
}


// =========================================================
// Сжатие изображения
// =========================================================

function compressImageFile(file, maxW = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        if (w > maxW) {
          h = Math.round(h * maxW / w);
          w = maxW;
        }

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);

        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };

    r.onerror = reject;
    r.readAsDataURL(file);
  });
}


// =========================================================
// Автосохранение черновика
// =========================================================

let autoSaveTimeout = null;

function autoSaveDraft() {
  const d = state.draft;
  if (!d) return;

  if (isEmptyDraft(d)) {
    if (state.hasDraft) {
      if (state.activeDraftId) {
        deleteDraftById(state.activeDraftId);
      }
      state.hasDraft = false;
      updateDraftBanner();
    }
    return;
  }

  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  updateSaveStatus('Сохранение…');

  autoSaveTimeout = setTimeout(() => {
    saveDraft(d);
    state.hasDraft = true;
    updateDraftBanner();
    updateSaveStatus('Сохранено');
  }, 1000);
}


// =========================================================
// Обновить баннер черновика
// =========================================================

function updateDraftBanner() {
  const banner = document.getElementById('draftBanner');
  if (!banner) return;

  if (state.hasDraft && state.draft && !isEmptyDraft(state.draft)) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}


// =========================================================
// ФОРМАТИРОВАНИЕ ТЕКСТА
//
// Все стили (bold/italic/underline/strikeThrough/mono/
// spoiler/blockquote) применяются через один и тот же
// безопасный механизм на основе Range.extractContents() /
// insertNode(), БЕЗ document.execCommand(). execCommand не
// уважает границы отдельных contenteditable-блоков и может
// сливать соседние блоки при форматировании — этого мы
// избегаем полностью.
// =========================================================

const CUSTOM_TAGS = {
  bold: { tag: 'B', className: null },
  italic: { tag: 'I', className: null },
  underline: { tag: 'U', className: null },
  strikeThrough: { tag: 'S', className: null },
  mono: { tag: 'CODE', className: null },
  spoiler: { tag: 'SPAN', className: 'tg-spoiler' },
  blockquote: { tag: 'BLOCKQUOTE', className: null }
};

const ZWSP = '\u200B';

let typingWrapperEl = null;

// Последнее валидное выделение пользователя.
// На мобильных WebView (Telegram/iOS/Android) window.getSelection()
// может сбрасываться во время нажатия на кнопку toolbar, поэтому
// сохраняем Range заранее и восстанавливаем его перед форматированием.
let savedSelectionRange = null;
let savedSelectionBlock = null;

// Для iOS храним выделение не только как Range, но и как
// текстовые offsets внутри contenteditable. Safari может сбросить
// Selection при touch, но offsets остаются воспроизводимыми.
let savedSelectionStartOffset = null;
let savedSelectionEndOffset = null;

function saveCurrentSelection() {
  const selection = window.getSelection();

  if (
    !selection ||
    !selection.rangeCount ||
    selection.isCollapsed ||
    !activeBlockEl ||
    !activeBlockEl.isConnected
  ) {
    return false;
  }

  const range = selection.getRangeAt(0);

  if (
    !activeBlockEl.contains(range.startContainer) ||
    !activeBlockEl.contains(range.endContainer)
  ) {
    return false;
  }

  try {
    savedSelectionRange = range.cloneRange();
    savedSelectionBlock = activeBlockEl;

    savedSelectionStartOffset = getTextOffsetInBlock(
      activeBlockEl,
      range.startContainer,
      range.startOffset
    );

    savedSelectionEndOffset = getTextOffsetInBlock(
      activeBlockEl,
      range.endContainer,
      range.endOffset
    );

    return savedSelectionEndOffset > savedSelectionStartOffset;
  } catch (e) {
    return false;
  }
}

function restoreSavedSelection() {
  if (
    !savedSelectionBlock ||
    savedSelectionBlock !== activeBlockEl ||
    !savedSelectionBlock.isConnected
  ) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) return false;

  try {
    if (
      Number.isFinite(savedSelectionStartOffset) &&
      Number.isFinite(savedSelectionEndOffset) &&
      savedSelectionEndOffset > savedSelectionStartOffset
    ) {
      const range = createRangeFromTextOffsets(
        savedSelectionBlock,
        savedSelectionStartOffset,
        savedSelectionEndOffset
      );

      selection.removeAllRanges();
      selection.addRange(range);

      if (
        selection.rangeCount &&
        !selection.isCollapsed &&
        savedSelectionBlock.contains(selection.getRangeAt(0).startContainer) &&
        savedSelectionBlock.contains(selection.getRangeAt(0).endContainer)
      ) {
        return true;
      }
    }

    if (savedSelectionRange) {
      selection.removeAllRanges();
      selection.addRange(savedSelectionRange);

      return (
        selection.rangeCount > 0 &&
        !selection.isCollapsed &&
        savedSelectionBlock.contains(selection.getRangeAt(0).startContainer) &&
        savedSelectionBlock.contains(selection.getRangeAt(0).endContainer)
      );
    }
  } catch (e) {
    console.warn('Не удалось восстановить selection:', e);
  }

  return false;
}

function clearSavedSelection() {
  savedSelectionRange = null;
  savedSelectionBlock = null;
  savedSelectionStartOffset = null;
  savedSelectionEndOffset = null;
}

// =========================================================
// Применить команду форматирования
// =========================================================

function applyFormatCommand(cmd) {
  if (!activeBlockEl || !activeBlockEl.isConnected) {
    showToast('Нажмите на текст, чтобы начать редактирование');
    return;
  }

  const selection = window.getSelection();
  if (!selection) return;

  // Критически важно: НЕ делать focus() до восстановления Range.
  // На мобильных WebView focus() может уничтожить выделение.
  let hasSelection = false;

  if (
    savedSelectionRange &&
    savedSelectionBlock === activeBlockEl
  ) {
    hasSelection = restoreSavedSelection();
  }

  // Если сохранённого выделения нет, используем текущее.
  if (!hasSelection && selection.rangeCount) {
    const currentRange = selection.getRangeAt(0);

    hasSelection =
      !selection.isCollapsed &&
      activeBlockEl.contains(currentRange.startContainer) &&
      activeBlockEl.contains(currentRange.endContainer);

    if (hasSelection) {
      savedSelectionRange = currentRange.cloneRange();
      savedSelectionBlock = activeBlockEl;
      savedSelectionStartOffset = getTextOffsetInBlock(
        activeBlockEl,
        currentRange.startContainer,
        currentRange.startOffset
      );
      savedSelectionEndOffset = getTextOffsetInBlock(
        activeBlockEl,
        currentRange.endContainer,
        currentRange.endOffset
      );
    }
  }

  if (hasSelection) {
    const range = selection.getRangeAt(0);

    if (
      !activeBlockEl.contains(range.startContainer) ||
      !activeBlockEl.contains(range.endContainer)
    ) {
      showToast('Выделение вышло за пределы блока — попробуйте ещё раз');
      clearSavedSelection();
      selection.removeAllRanges();
      return;
    }

    if (cmd === 'removeFormat') {
      removeAllFormatting(activeBlockEl, selection);
    } else if (CUSTOM_TAGS[cmd]) {
      toggleCustomTag(cmd, selection);
    }

    exitTypingWrapper();
    activeBlockEl.dispatchEvent(new Event('input'));
    updateFloatingToolbarButtons();

    // После форматирования сохраняем новый Range, если он есть.
    if (selection.rangeCount && !selection.isCollapsed) {
      const formattedRange = selection.getRangeAt(0);

      savedSelectionRange = formattedRange.cloneRange();
      savedSelectionBlock = activeBlockEl;
      savedSelectionStartOffset = getTextOffsetInBlock(
        activeBlockEl,
        formattedRange.startContainer,
        formattedRange.startOffset
      );
      savedSelectionEndOffset = getTextOffsetInBlock(
        activeBlockEl,
        formattedRange.endContainer,
        formattedRange.endOffset
      );
    } else {
      clearSavedSelection();
    }

    return;
  }

  // Выделения нет — теперь можно поставить фокус и включить
  // режим форматирования для последующего ввода.
  activeBlockEl.focus();

  if (cmd === 'removeFormat') {
    exitTypingWrapper();
    updateFloatingToolbarButtons();
    return;
  }

  if (CUSTOM_TAGS[cmd]) {
    toggleCustomTagTypingMode(cmd);
    updateFloatingToolbarButtons();
  }
}


// =========================================================
// Получить узел, относительно которого реально стоит курсор.
//
// range.startContainer иногда указывает не на текстовый
// узел, а на родительский контейнер с offset "между"
// дочерними узлами (например, сразу после восстановления
// фокуса через .focus()). В этом случае findAncestorTag,
// получив на входе сам contenteditable-контейнер, сразу
// возвращает null — и код ошибочно решает, что тега нет,
// хотя курсор стоит вплотную к нему. Это и была причина
// того, что повторное нажатие B не снимало жирный текст,
// а создавало новый <b> поверх.
// =========================================================

function getCaretReferenceNode(range) {
  const container = range.startContainer;
  const offset = range.startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    return container;
  }

  if (offset > 0 && container.childNodes[offset - 1]) {
    return container.childNodes[offset - 1];
  }

  if (container.childNodes[offset]) {
    return container.childNodes[offset];
  }

  return container;
}


// =========================================================
// Включить/выключить "печать внутри тега" (без выделения)
// =========================================================

function toggleCustomTagTypingMode(cmd) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const { tag, className } = CUSTOM_TAGS[cmd];

  const refNode = getCaretReferenceNode(range);
  const existing = findAncestorTag(refNode, tag, className);

  if (existing) {
    const newRange = document.createRange();
    newRange.setStartAfter(existing);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    if (existing === typingWrapperEl) {
      typingWrapperEl = null;
    }

    cleanZeroWidthSpaces(existing);
    if (!existing.textContent.trim()) {
      existing.remove();
    }

    activeBlockEl.dispatchEvent(new Event('input'));
    return;
  }

  const wrapper = document.createElement(tag);
  if (className) {
    wrapper.className = className;
  }

  const marker = document.createTextNode(ZWSP);
  wrapper.appendChild(marker);

  range.insertNode(wrapper);

  const newRange = document.createRange();
  newRange.setStart(marker, marker.length);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);

  typingWrapperEl = wrapper;
  activeBlockEl.dispatchEvent(new Event('input'));
}


// =========================================================
// Завершить "режим печати" в кастомном теге
// =========================================================

function exitTypingWrapper() {
  if (!typingWrapperEl) return;

  cleanZeroWidthSpaces(typingWrapperEl);

  if (!typingWrapperEl.textContent.trim()) {
    typingWrapperEl.remove();
  }

  typingWrapperEl = null;
}


function cleanZeroWidthSpaces(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;

  while ((n = walker.nextNode())) {
    if (n.nodeValue.includes(ZWSP)) {
      n.nodeValue = n.nodeValue.replace(new RegExp(ZWSP, 'g'), '');
    }
  }
}


// =========================================================
// Проверка: не вышел ли курсор за пределы активной обёртки
// (используется на событие selectionchange)
// =========================================================

function checkTypingWrapperExit() {
  if (!typingWrapperEl) return;

  const selection = window.getSelection();

  if (!selection || !selection.rangeCount || !typingWrapperEl.isConnected) {
    const changedBlock = activeBlockEl;
    exitTypingWrapper();
    if (changedBlock) changedBlock.dispatchEvent(new Event('input'));
    return;
  }

  const range = selection.getRangeAt(0);
  const refNode = getCaretReferenceNode(range);
  const stillInside = typingWrapperEl === refNode || typingWrapperEl.contains(refNode);

  if (stillInside) return;

  const changedBlock = activeBlockEl;
  exitTypingWrapper();

  if (changedBlock) {
    changedBlock.dispatchEvent(new Event('input'));
  }
}


// =========================================================
// ОБРАБОТКА ENTER
//
// Одиночный Enter — вставляет <br> (перенос строки внутри
// абзаца). Двойной Enter — создаёт новый текстовый блок.
// Оба случая обрабатываются вручную (preventDefault), чтобы
// поведение не зависело от браузера: стандартное поведение
// contenteditable по Enter непредсказуемо (Chrome вставляет
// <div>, Firefox — <p>), и при последующей санитайзации это
// могло приводить к потере разрывов между абзацами.
// =========================================================

let enterPressCount = 0;
let enterPressTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  const blockText = e.target.closest('.block-text');
  if (!blockText) return;

  e.preventDefault();

  enterPressCount++;

  if (enterPressTimer) {
    clearTimeout(enterPressTimer);
    enterPressTimer = null;
  }

  // Двойной Enter — создаём новый блок
  if (enterPressCount >= 2) {
    enterPressCount = 0;

    const blockIndex = parseInt(blockText.dataset.i);
    if (!isNaN(blockIndex)) {
      const d = state.draft;
      if (d && d.blocks[blockIndex]?.type === 'text') {
        d.blocks[blockIndex].html = sanitizeHtml(blockText.innerHTML);
      }

      exitTypingWrapper();

      insertBlockAfter(blockIndex, { type: 'text', html: '' });
    }

    return;
  }

  // Одиночный Enter — вставляем <br>
  document.execCommand('insertLineBreak', false, null);

  exitTypingWrapper();

  blockText.dispatchEvent(new Event('input'));

  enterPressTimer = setTimeout(() => {
    enterPressCount = 0;
    enterPressTimer = null;
  }, 300);
});


// =========================================================
// Обернуть/снять кастомный тег на выделенном тексте
// (безопасно: работает строго в пределах Range)
// =========================================================

function toggleCustomTag(cmd, selection) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;

  const { tag, className } = CUSTOM_TAGS[cmd];
  const range = selection.getRangeAt(0);

  // Ищем форматирование, которое реально пересекает выделение.
  // Нельзя полагаться только на commonAncestorContainer:
  // при выделении нескольких текстовых узлов он часто оказывается
  // .block-text, хотя весь выбранный текст находится внутри <b>/<i>/...
  const matching = getMatchingElementsInRange(
    range,
    tag,
    className,
    activeBlockEl
  );

  // Если весь выделенный текст уже находится внутри нужного тега,
  // повторное нажатие должно СНЯТЬ именно этот стиль.
  if (isRangeFullyInsideTag(range, tag, className, activeBlockEl)) {
    unwrapRangeFormatting(range, tag, className, activeBlockEl);

    const blockIndex = parseInt(activeBlockEl.dataset.i);
    if (!isNaN(blockIndex) && state.draft.blocks[blockIndex]) {
      state.draft.blocks[blockIndex].html = sanitizeHtml(activeBlockEl.innerHTML);
      autoSaveDraft();
    }

    return;
  }

  // Иначе добавляем стиль к выделению.
  const wrapper = document.createElement(tag);
  if (className) {
    wrapper.className = className;
  }

  try {
    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
  } catch (e) {
    console.error('Не удалось применить форматирование:', e);
    return;
  }

  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  selection.addRange(newRange);
}


// Возвращает все элементы нужного формата, пересекающие Range.
function getMatchingElementsInRange(range, tagName, className, blockEl) {
  if (!blockEl) return [];

  const result = [];
  const elements = blockEl.querySelectorAll(tagName);

  elements.forEach(el => {
    if (className && !el.classList.contains(className)) return;

    try {
      if (
        range.intersectsNode(el) ||
        el.contains(range.startContainer) ||
        el.contains(range.endContainer)
      ) {
        result.push(el);
      }
    } catch (e) {}
  });

  return result;
}


// Проверяем, находится ли весь текст выделения внутри нужного тега.
// Это принципиально для переключателя: если выделение частично
// форматировано, повторное нажатие не должно случайно снимать
// форматирование с соседнего текста.
function isRangeFullyInsideTag(range, tagName, className, blockEl) {
  if (!blockEl || !range || range.collapsed) return false;

  const text = range.toString();
  if (!text) return false;

  const walker = document.createTreeWalker(
    blockEl,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.length) {
          return NodeFilter.FILTER_REJECT;
        }

        try {
          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        } catch (e) {
          return NodeFilter.FILTER_REJECT;
        }
      }
    }
  );

  let foundText = false;
  let node;

  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) return false;

    const formattedParent = parent.closest(tagName);
    if (
      !formattedParent ||
      !blockEl.contains(formattedParent) ||
      (className && !formattedParent.classList.contains(className))
    ) {
      return false;
    }

    foundText = true;
  }

  return foundText;
}


// Снимает нужный формат только с выделенного текста.
// Вместо unwrapElement(existing), который снимает тег целиком,
// делаем split по границам выделения и удаляем только нужные
// обёртки.
function unwrapRangeFormatting(range, tagName, className, blockEl) {
  // Сохраняем положение выделения как текстовые offsets внутри блока.
  const startOffset = getTextOffsetInBlock(blockEl, range.startContainer, range.startOffset);
  const endOffset = getTextOffsetInBlock(blockEl, range.endContainer, range.endOffset);

  // Разбиваем DOM по границам выделения.
  splitRangeBoundaries(range);

  // После split ищем все подходящие элементы, пересекающие исходное
  // выделение, и снимаем только их.
  const candidates = Array.from(blockEl.querySelectorAll(tagName))
    .filter(el => {
      if (className && !el.classList.contains(className)) return false;

      const elStart = getTextOffsetInBlock(blockEl, el, 0);
      const elEnd = getTextOffsetInBlock(blockEl, el, el.childNodes.length);

      return elStart < endOffset && elEnd > startOffset;
    })
    .sort((a, b) => {
      const depth = el => {
        let d = 0;
        let n = el;
        while (n && n !== blockEl) {
          d++;
          n = n.parentElement;
        }
        return d;
      };
      return depth(b) - depth(a);
    });

  candidates.forEach(el => {
    if (!el.parentNode) return;

    while (el.firstChild) {
      el.parentNode.insertBefore(el.firstChild, el);
    }
    el.remove();
  });

  cleanupEmptyInlineTags(blockEl);

  // Восстанавливаем исходное выделение по текстовым offsets.
  const newRange = createRangeFromTextOffsets(blockEl, startOffset, endOffset);
  const selection = window.getSelection();

  selection.removeAllRanges();
  selection.addRange(newRange);
}


function getTextOffsetInBlock(blockEl, container, offset) {
  const range = document.createRange();
  range.selectNodeContents(blockEl);

  try {
    range.setEnd(container, offset);
  } catch (e) {
    return 0;
  }

  return range.toString().length;
}


function createRangeFromTextOffsets(blockEl, startOffset, endOffset) {
  const range = document.createRange();
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);

  let pos = 0;
  let startNode = null;
  let startNodeOffset = 0;
  let endNode = null;
  let endNodeOffset = 0;
  let node;

  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    const nextPos = pos + len;

    if (!startNode && startOffset >= pos && startOffset <= nextPos) {
      startNode = node;
      startNodeOffset = Math.max(0, startOffset - pos);
    }

    if (endOffset >= pos && endOffset <= nextPos) {
      endNode = node;
      endNodeOffset = Math.max(0, endOffset - pos);
      break;
    }

    pos = nextPos;
  }

  if (!startNode) {
    const last = getLastTextNode(blockEl);
    if (last) {
      startNode = last;
      startNodeOffset = last.nodeValue.length;
    } else {
      range.selectNodeContents(blockEl);
      range.collapse(true);
      return range;
    }
  }

  if (!endNode) {
    endNode = startNode;
    endNodeOffset = startNodeOffset;
  }

  range.setStart(startNode, Math.min(startNodeOffset, startNode.nodeValue.length));
  range.setEnd(endNode, Math.min(endNodeOffset, endNode.nodeValue.length));

  return range;
}


function getLastTextNode(blockEl) {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let last = null;
  let node;

  while ((node = walker.nextNode())) {
    last = node;
  }

  return last;
}


function splitRangeBoundaries(range) {
  // Разрезаем текстовые узлы на границах выделения, чтобы форматирование
  // можно было снять только с выбранного фрагмента.
  if (
    range.startContainer.nodeType === Node.TEXT_NODE &&
    range.startOffset > 0 &&
    range.startOffset < range.startContainer.nodeValue.length
  ) {
    const newNode = range.startContainer.splitText(range.startOffset);
    range.setStart(newNode, 0);

    if (range.endContainer === range.startContainer) {
      range.setEnd(newNode, range.endOffset - range.startOffset);
    }
  }

  if (
    range.endContainer.nodeType === Node.TEXT_NODE &&
    range.endOffset > 0 &&
    range.endOffset < range.endContainer.nodeValue.length
  ) {
    range.endContainer.splitText(range.endOffset);
  }
}

// =========================================================
// Найти ближайшего предка с заданным тегом/классом,
// не выходя за пределы contenteditable-блока
// =========================================================

function findAncestorTag(node, tagName, className) {
  let el = node.nodeType === 3 ? node.parentElement : node;

  while (el && el.contentEditable !== 'true') {
    if (el.tagName === tagName && (!className || el.classList.contains(className))) {
      return el;
    }
    el = el.parentElement;
  }

  return null;
}


function unwrapElement(el) {
  const parent = el.parentNode;

  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }

  parent.removeChild(el);
}


// =========================================================
// Полный сброс форматирования (только в пределах выделения)
// =========================================================

function removeAllFormatting(blockEl, selection) {
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (!blockEl.contains(range.commonAncestorContainer)) return;

  const selectedText = range.toString();

  if (!selectedText.trim()) return;

  range.deleteContents();

  const point = splitAncestorsUpTo(range.startContainer, range.startOffset, blockEl);

  const textNode = document.createTextNode(selectedText);

  if (point.container.childNodes[point.offset]) {
    point.container.insertBefore(textNode, point.container.childNodes[point.offset]);
  } else {
    point.container.appendChild(textNode);
  }

  cleanupEmptyInlineTags(blockEl);

  const newRange = document.createRange();
  newRange.setStartAfter(textNode);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);

  const blockIndex = parseInt(blockEl.dataset.i);
  if (!isNaN(blockIndex) && state.draft.blocks[blockIndex]) {
    const cleanHtml = sanitizeHtml(blockEl.innerHTML);
    state.draft.blocks[blockIndex].html = cleanHtml;
    autoSaveDraft();
  }

  updateFloatingToolbarButtons();

  if (selection.rangeCount && !selection.isCollapsed) {
    savedSelectionRange = selection.getRangeAt(0).cloneRange();
    savedSelectionBlock = blockEl;
  }
}


function splitAncestorsUpTo(container, offset, boundary) {
  let node = container;
  let off = offset;

  while (node !== boundary) {
    const parent = node.parentNode;
    if (!parent) break;

    if (node.nodeType === Node.TEXT_NODE) {
      if (off > 0 && off < node.nodeValue.length) {
        node.splitText(off);
      }

      const idx = Array.prototype.indexOf.call(parent.childNodes, node);
      off = off === 0 ? idx : idx + 1;
      node = parent;
    } else {
      const clone = node.cloneNode(false);

      while (node.childNodes[off]) {
        clone.appendChild(node.childNodes[off]);
      }

      if (clone.childNodes.length) {
        parent.insertBefore(clone, node.nextSibling);
      }

      const idx = Array.prototype.indexOf.call(parent.childNodes, node);
      off = idx + 1;
      node = parent;
    }
  }

  return { container: node, offset: off };
}


function cleanupEmptyInlineTags(blockEl) {
  const tags = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'SPAN', 'BLOCKQUOTE'];

  blockEl.querySelectorAll(tags.join(',')).forEach(el => {
    if (!el.textContent.trim() && !el.querySelector('img')) {
      el.remove();
    }
  });
}


// =========================================================
// ПЛАВАЮЩАЯ ПАНЕЛЬ ФОРМАТИРОВАНИЯ
// =========================================================

function initFloatingToolbar() {
  document.addEventListener('selectionchange', () => {
    saveCurrentSelection();
    checkTypingWrapperExit();
    updateFloatingToolbarButtons();
  });

  document.addEventListener('click', (e) => {
    const blockText = e.target.closest('.block-text');
    if (blockText) {
      setTimeout(updateFloatingToolbarButtons, 10);
    }
  });

  document.addEventListener('keyup', () => {
    setTimeout(updateFloatingToolbarButtons, 10);
  });
}


function updateFloatingToolbarButtons() {
  const selection = window.getSelection();

  Object.entries(CUSTOM_TAGS).forEach(([cmd, { tag, className }]) => {
    let isActive = false;

    if (selection && selection.rangeCount && activeBlockEl) {
      const range = selection.getRangeAt(0);
      const refNode = getCaretReferenceNode(range);
      isActive = !!findAncestorTag(refNode, tag, className);
    }

    if (typingWrapperEl &&
      typingWrapperEl.tagName === tag &&
      (!className || typingWrapperEl.classList.contains(className))
    ) {
      isActive = true;
    }

    document.querySelectorAll(`#floatingToolbar [data-cmd="${cmd}"]`).forEach(btn =>
      btn.classList.toggle('active', isActive)
    );
  });
}


// =========================================================
// Подстраховка для iOS: если приложение уходит в фон
// (например, во время выбора фото в нативном пикере),
// сразу фиксируем текущее состояние черновика. iOS может
// выгружать WebView из памяти при долгом уходе в фон.
// =========================================================

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.draft) {
    saveBlocksContent();
    if (!isEmptyDraft(state.draft)) {
      saveDraft(state.draft);
      state.hasDraft = true;
    }
  }
});


// =========================================================
// Публикация / сохранение статьи
// =========================================================

async function publishDraft() {
  saveBlocksContent();

  const d = state.draft;
  if (!d) {
    showToast('Нет черновика для публикации');
    return;
  }

  const hasContent = !!d.title.trim() ||
    !!d.cover ||
    d.blocks.some(b =>
      b.type === 'image' ||
      (b.type === 'text' && b.html.replace(/<[^>]+>/g, '').trim())
    );

  if (!hasContent) {
    showToast('Добавьте заголовок или содержимое');
    return;
  }

  const button = document.getElementById('publishBtn');
  const hint = document.getElementById('editorHint');

  button.disabled = true;
  hint.textContent = d._isEdit ? 'Сохраняем изменения…' : 'Публикуем…';

  try {
    const profile = await ensureProfile(true);
    if (!profile) {
      throw new Error('Необходимо указать ник');
    }

    // Обложка
    let cover = d.cover || null;
    if (cover?.startsWith('data:')) {
      cover = await uploadImage(cover, 'cover.jpg');
    }

    // Изображения внутри статьи
    for (const b of d.blocks) {
      if (b.type === 'image' && b._pendingFile) {
        b.src = await uploadImage(b.src, 'image.jpg');
        delete b._pendingFile;
      }
    }

    // Excerpt
    const first = d.blocks.find(b => b.type === 'text' && b.html?.trim());
    const excerpt = first
      ? first.html.replace(/<[^>]+>/g, '').trim().slice(0, 140)
      : '';

    const payload = {
      title: d.title.trim() || 'Без названия',
      excerpt,
      cover,
      blocks: d.blocks
    };

    // Если это редактирование существующей статьи
    if (d._isEdit && d._originalId) {
      const r = await callTelegramApi('update-article', {
        article: {
          id: d._originalId,
          ...payload
        }
      });

      // Удаляем черновик после успешного обновления
      if (state.activeDraftId) {
        deleteDraftById(state.activeDraftId);
      }

      state.draft = null;
      state.activeDraftId = null;
      state.hasDraft = false;

      showToast('Изменения сохранены');
      await openReader(r.article.id);
    } else {
      // Новая статья
      const r = await callTelegramApi('create-article', {
        article: payload
      });

      // Удаляем черновик после успешной публикации
      if (state.activeDraftId) {
        deleteDraftById(state.activeDraftId);
      }

      state.draft = null;
      state.activeDraftId = null;
      state.hasDraft = false;

      showToast('Опубликовано');
      await openReader(r.article.id);
    }

  } catch (e) {
    console.error(e);
    showToast(e.message || 'Ошибка публикации');
    hint.textContent = '';

  } finally {
    button.disabled = false;
  }
}
