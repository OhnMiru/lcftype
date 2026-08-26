// =========================================================
// Летопись — редактор статей (с поддержкой нескольких черновиков)
// =========================================================


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
  // =======================================================

  document.querySelectorAll('#floatingToolbar button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
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

  row.querySelector('[data-add="text"]').onclick = () => {
    insertBlockAfter(index, { type: 'text', html: '' });
  };

  row.querySelector('[data-add="image"]').onclick = () => {
    openImagePicker(index + 1);
  };

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
    el.onfocus = () => { activeBlockEl = el; };
    el.oninput = e => {
      const i = +e.target.dataset.i;
      if (d.blocks[i]?.type === 'text') {
        d.blocks[i].html = sanitizeHtml(e.target.innerHTML);
      }
      autoSaveDraft();
    };
    el.onkeyup = () => { activeBlockEl = el; };
    el.onmouseup = () => { activeBlockEl = el; };
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
// =========================================================

const CUSTOM_TAGS = {
  mono: { tag: 'CODE', className: null },
  spoiler: { tag: 'SPAN', className: 'tg-spoiler' },
  blockquote: { tag: 'BLOCKQUOTE', className: null }
};

const NATIVE_COMMANDS = new Set(['bold', 'italic', 'underline', 'strikeThrough']);
const ZWSP = '\u200B';

let typingWrapperEl = null;


function applyFormatCommand(cmd) {
  if (!activeBlockEl) {
    showToast('Нажмите на текст, чтобы начать редактирование');
    return;
  }

  activeBlockEl.focus();

  const selection = window.getSelection();

  // Есть выделение — форматируем сам выделенный текст
  if (selection && !selection.isCollapsed && activeBlockEl.contains(selection.anchorNode)) {
    if (cmd === 'removeFormat') {
      removeAllFormatting(activeBlockEl, selection);
    } else if (NATIVE_COMMANDS.has(cmd)) {
      document.execCommand(cmd, false, null);
    } else if (CUSTOM_TAGS[cmd]) {
      toggleCustomTag(cmd, selection);
    }

    exitTypingWrapper();
    activeBlockEl.dispatchEvent(new Event('input'));
    updateFloatingToolbarButtons();
    return;
  }

  // Выделения нет — включаем "режим печати" с форматом
  if (!selection || !activeBlockEl.contains(selection.anchorNode)) {
    placeCaretAtEnd(activeBlockEl);
  }

  if (cmd === 'removeFormat') {
    document.execCommand('removeFormat', false, null);
    exitTypingWrapper();
    updateFloatingToolbarButtons();
    return;
  }

  if (NATIVE_COMMANDS.has(cmd)) {
    document.execCommand(cmd, false, null);
    updateFloatingToolbarButtons();
    return;
  }

  if (CUSTOM_TAGS[cmd]) {
    toggleCustomTagTypingMode(cmd);
    updateFloatingToolbarButtons();
    return;
  }
}


function toggleCustomTagTypingMode(cmd) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const { tag, className } = CUSTOM_TAGS[cmd];

  const existing = findAncestorTag(range.startContainer, tag, className);

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


function checkTypingWrapperExit() {
  if (!typingWrapperEl) return;

  const selection = window.getSelection();
  const stillInside = selection &&
    selection.rangeCount &&
    typingWrapperEl.isConnected &&
    typingWrapperEl.contains(selection.getRangeAt(0).startContainer);

  if (stillInside) return;

  const changedBlock = activeBlockEl;
  exitTypingWrapper();

  if (changedBlock) {
    changedBlock.dispatchEvent(new Event('input'));
  }
}


// Обработка двойного Enter
let enterPressCount = 0;
let enterPressTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const blockText = e.target.closest('.block-text');
    if (!blockText) return;

    enterPressCount++;

    if (enterPressTimer) {
      clearTimeout(enterPressTimer);
      enterPressTimer = null;
    }

    if (enterPressCount >= 2) {
      enterPressCount = 0;
      e.preventDefault();

      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        let hasCustomTag = false;
        Object.entries(CUSTOM_TAGS).forEach(([cmd, { tag, className }]) => {
          const el = findAncestorTag(container, tag, className);
          if (el) {
            hasCustomTag = true;
            if (el === typingWrapperEl) {
              typingWrapperEl = null;
            }
            unwrapElement(el);
          }
        });

        if (hasCustomTag) {
          updateFloatingToolbarButtons();
        }
      }

      document.execCommand('insertLineBreak', false, null);
      return;
    }

    enterPressTimer = setTimeout(() => {
      enterPressCount = 0;
      enterPressTimer = null;
    }, 300);
  }
});


function toggleCustomTag(cmd, selection) {
  if (!selection || selection.isCollapsed) return;

  const { tag, className } = CUSTOM_TAGS[cmd];
  const range = selection.getRangeAt(0);

  const existing = findAncestorTag(range.commonAncestorContainer, tag, className);

  if (existing) {
    unwrapElement(existing);
    return;
  }

  const wrapper = document.createElement(tag);
  if (className) {
    wrapper.className = className;
  }

  try {
    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
  } catch (e) {
    return;
  }

  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  selection.addRange(newRange);
}


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
  const nativeCommands = ['bold', 'italic', 'underline', 'strikeThrough'];

  nativeCommands.forEach(cmd => {
    document.querySelectorAll(`#floatingToolbar [data-cmd="${cmd}"]`).forEach(btn => {
      let isActive = false;
      try {
        isActive = document.queryCommandState(cmd);
      } catch (e) {}
      btn.classList.toggle('active', isActive);
    });
  });

  const selection = window.getSelection();

  Object.entries(CUSTOM_TAGS).forEach(([cmd, { tag, className }]) => {
    let isActive = false;

    if (selection && selection.rangeCount && activeBlockEl) {
      const range = selection.getRangeAt(0);
      isActive = !!findAncestorTag(range.commonAncestorContainer, tag, className);
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
