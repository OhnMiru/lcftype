// =========================================================
// Летопись — редактор статей
// =========================================================


// =========================================================
// Новый черновик
// =========================================================

function newDraft() {
  return {
    id: null,
    title: '',
    cover: null,

    blocks: [
      {
        type: 'text',
        html: ''
      }
    ]
  };
}


// =========================================================
// Открыть редактор новой статьи
// =========================================================

let _isRestoringDraft = false;

async function openEditor() {
  try {

    if (!tg?.initData) {
      showToast(
        'Откройте приложение внутри Telegram'
      );

      return;
    }

    const p =
      await ensureProfile(true);

    if (!p) {
      return;
    }

    state.view = 'editor';
    state.currentId = null;

    if (!_isRestoringDraft) {
      const savedDraft = loadDraftFromStorage();
      
      if (savedDraft && !isDraftEmpty(savedDraft)) {
        const restore = confirm(
          'У вас есть несохраненный черновик. Восстановить?'
        );
        
        if (restore) {
          _isRestoringDraft = true;
          state.draft = savedDraft;
          showToast('Черновик восстановлен');
        } else {
          clearDraft();
          state.draft = newDraft();
        }
      } else {
        state.draft = newDraft();
      }
    } else {
      _isRestoringDraft = false;
      if (!state.draft) {
        state.draft = newDraft();
      }
    }

    setBackButton(
      true,
      () => {
        if (state.hasDraft && !isDraftEmpty(state.draft)) {
          if (
            confirm(
              'Отменить редактирование? Черновик будет сохранен.'
            )
          ) {
            saveDraftToStorage(state.draft);
            renderFeed();
          }
        } else {
          clearDraft();
          renderFeed();
        }
      }
    );

    renderEditor();

  } catch (e) {

    showToast(
      e.message ||
      'Не удалось открыть редактор'
    );
  }
}


// =========================================================
// Редактирование существующей статьи
// =========================================================

function editArticle(article) {
  if (!isArticleOwner(article)) {
    showToast(
      'Вы не являетесь автором этой статьи'
    );

    return;
  }

  state.view = 'editor';
  state.currentId = article.id;

  state.draft = {
    id: article.id,
    title: article.title || '',
    cover: article.cover || null,

    blocks: JSON.parse(
      JSON.stringify(
        article.blocks || []
      )
    )
  };

  if (!state.draft.blocks.length) {
    state.draft.blocks = [
      {
        type: 'text',
        html: ''
      }
    ];
  }

  setBackButton(
    true,
    () => {
      if (state.hasDraft && !isDraftEmpty(state.draft)) {
        if (
          confirm(
            'Отменить редактирование? Изменения будут сохранены в черновике.'
          )
        ) {
          saveDraftToStorage(state.draft);
          openReader(article.id);
        }
      } else {
        clearDraft();
        openReader(article.id);
      }
    }
  );

  renderEditor();
}


// =========================================================
// Рендер редактора
// =========================================================

function renderEditor() {
  const main =
    document.getElementById(
      'main'
    );

  const d = state.draft;

  const draftBanner = state.hasDraft && !isDraftEmpty(d) ? `
    <div class="draft-banner chrome" id="draftBanner">
      <span>Черновик сохранен</span>
      <button class="draft-banner-close" id="clearDraftBtn">✕</button>
    </div>
  ` : '';

  main.innerHTML = `

    ${draftBanner}

    <input
      class="editor-title-input"
      id="titleInput"
      placeholder="Заголовок статьи"
      value="${escapeHtml(
        d.title
      )}"
    >

    <div
      class="cover-editor"
      id="coverEditor"
    >

      <div class="cover-editor-header">

        <div>

          <div class="cover-editor-title">
            Обложка
          </div>

          <div class="cover-editor-subtitle">
            Она будет видна на главной, но не внутри статьи.
          </div>

        </div>

        ${
          d.cover
            ? `
              <button
                class="cover-remove-btn"
                id="removeCoverBtn"
                type="button"
              >
                Убрать
              </button>
            `
            : ''
        }

      </div>

      ${
        d.cover
          ? `
            <div class="cover-preview">

              <img
                src="${escapeHtml(
                  d.cover
                )}"
                alt=""
              >

              <button
                class="cover-change-btn"
                id="changeCoverBtn"
                type="button"
              >
                Заменить обложку
              </button>

            </div>
          `
          : `
            <button
              class="cover-empty"
              id="addCoverBtn"
              type="button"
            >

              <span class="cover-empty-icon">
                ＋
              </span>

              <span>
                Добавить обложку
              </span>

            </button>
          `
      }

    </div>

    <div
      class="toolbar chrome"
      id="toolbar"
    >

      <button
        data-cmd="bold"
        title="Жирный"
      >
        B
      </button>

      <button
        data-cmd="italic"
        title="Курсив"
      >
        i
      </button>

      <button
        data-cmd="underline"
        title="Подчёркнутый"
      >
        U
      </button>

    </div>

    <div id="blocksHost"></div>

    <button
      class="btn btn-primary publish-btn"
      id="publishBtn"
      type="button"
    >
      ${
        d.id
          ? 'Сохранить изменения'
          : 'Опубликовать'
      }
    </button>

    <input
      type="file"
      accept="image/*"
      id="coverInput"
      style="display:none"
    >

    <input
      type="file"
      accept="image/*"
      multiple
      id="fileInput"
      style="display:none"
    >

    <div
      class="hint chrome"
      id="editorHint"
    ></div>

    <!-- Кастомная плашка для выделенного текста -->
    <div id="customToolbar" class="custom-toolbar" style="display:none;">
      
      <button data-cmd="bold" title="Жирный">B</button>
      <button data-cmd="italic" title="Курсив">i</button>
      <button data-cmd="underline" title="Подчёркнутый">U</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-more-btn" id="toolbarMoreBtn" title="Ещё">⋯</button>
      
      <!-- Выпадающее меню -->
      <div class="toolbar-dropdown" id="toolbarDropdown" style="display:none;">
        
        <button data-cmd="selectAll">
          <span class="dropdown-icon">📋</span>
          Выбрать все
        </button>
        
        <button data-cmd="cut">
          <span class="dropdown-icon">✂️</span>
          Вырезать
        </button>
        
        <button data-cmd="copy">
          <span class="dropdown-icon">📄</span>
          Копировать
        </button>
        
        <button data-cmd="paste">
          <span class="dropdown-icon">📎</span>
          Вставить
        </button>
        
        <div class="dropdown-divider"></div>
        
        <button data-cmd="blockquote">
          <span class="dropdown-icon">💬</span>
          Цитировать
        </button>
        
        <button data-cmd="spoiler">
          <span class="dropdown-icon">👁</span>
          Скрытый
        </button>
        
        <button data-cmd="strikeThrough">
          <span class="dropdown-icon">~~S~~</span>
          Зачеркнутый
        </button>
        
        <button data-cmd="mono">
          <span class="dropdown-icon">`code`</span>
          Моно
        </button>
        
        <div class="dropdown-divider"></div>
        
        <button data-cmd="removeFormat" class="dropdown-danger">
          <span class="dropdown-icon">🔄</span>
          Обычный
        </button>
        
      </div>
      
    </div>
  `;

  // =======================================================
  // Заголовок
  // =======================================================

  document
    .getElementById('titleInput')
    .oninput = e => {
      d.title =
        e.target.value;
      autoSaveDraft();
    };


  // =======================================================
  // Панель форматирования — ИСПРАВЛЕНО ДЛЯ МОБИЛЬНЫХ
  // =======================================================

  document
    .querySelectorAll(
      '#toolbar button'
    )
    .forEach(btn => {

      // Для десктопа — mousedown
      btn.addEventListener(
        'mousedown',
        e => {
          e.preventDefault();
          applyFormatting(btn.dataset.cmd);
        }
      );

      // Для мобильных — touchstart
      btn.addEventListener(
        'touchstart',
        e => {
          e.preventDefault();
          applyFormatting(btn.dataset.cmd);
        },
        { passive: false }
      );
    });


  // =======================================================
  // Обложка
  // =======================================================

  document
    .getElementById('addCoverBtn')
    ?.addEventListener(
      'click',
      () =>
        document
          .getElementById(
            'coverInput'
          )
          .click()
    );

  document
    .getElementById('changeCoverBtn')
    ?.addEventListener(
      'click',
      () =>
        document
          .getElementById(
            'coverInput'
          )
          .click()
    );

  document
    .getElementById('removeCoverBtn')
    ?.addEventListener(
      'click',
      () => {

        d.cover = null;

        renderEditor();

        showToast(
          'Обложка убрана'
        );
        
        autoSaveDraft();
      }
    );


  // =======================================================
  // Выбор обложки
  // =======================================================

  document
    .getElementById('coverInput')
    .onchange = async e => {

      const f =
        e.target.files[0];

      if (!f) {
        return;
      }

      try {

        d.cover =
          await compressImageFile(
            f,
            1600,
            .84
          );

        renderEditor();
        autoSaveDraft();

      } catch (err) {

        showToast(
          'Не удалось обработать обложку'
        );
      }

      e.target.value = '';
    };


  // =======================================================
  // Выбор изображений для блоков
  // =======================================================

  document
    .getElementById('fileInput')
    .onchange = async e => {

      const files = [
        ...e.target.files || []
      ];

      if (!files.length) {
        return;
      }

      try {

        const idx =
          Number.isInteger(
            state.pendingImageInsertIndex
          )
            ? state.pendingImageInsertIndex
            : d.blocks.length;

        const blocks = [];

        for (const f of files) {

          blocks.push({
            type: 'image',

            src:
              await compressImageFile(
                f
              ),

            caption: '',

            _pendingFile: true
          });
        }

        d.blocks.splice(
          idx,
          0,
          ...blocks
        );

        state.pendingImageInsertIndex =
          null;

        renderBlocks({
          focusIndex: idx
        });
        
        autoSaveDraft();

      } catch (err) {

        showToast(
          'Не удалось обработать изображение'
        );
      }

      e.target.value = '';
    };


  // =======================================================
  // Публикация
  // =======================================================

  document
    .getElementById('publishBtn')
    .onclick =
      publishDraft;


  // =======================================================
  // Баннер черновика
  // =======================================================

  document
    .getElementById('clearDraftBtn')
    ?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        if (confirm('Удалить сохраненный черновик?')) {
          clearDraft();
          state.draft = newDraft();
          renderEditor();
          showToast('Черновик удален');
        }
      }
    );


  // =======================================================
  // Блоки
  // =======================================================

  renderBlocks();

  // =======================================================
  // Инициализация кастомной плашки
  // =======================================================

  initCustomToolbar();
}


// =========================================================
// Применить форматирование — вынесено в отдельную функцию
// =========================================================

function applyFormatting(cmd) {
  if (!activeBlockEl) {
    showToast('Нажмите на текст, чтобы начать редактирование');
    return;
  }

  // Проверяем, есть ли выделение
  const selection = window.getSelection();
  
  // Если нет выделения, создаем его в текущем блоке
  if (!selection || selection.isCollapsed) {
    // Устанавливаем курсор в конец блока
    const range = document.createRange();
    range.selectNodeContents(activeBlockEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Применяем команду
  document.execCommand(cmd, false, null);

  // Обновляем содержимое блока
  activeBlockEl.dispatchEvent(new Event('input'));

  // Если есть кастомная плашка — обновляем ее
  updateToolbarButtons();
}


// =========================================================
// Добавить блок после указанного
// =========================================================

function insertBlockAfter(
  index,
  block
) {
  state.draft.blocks.splice(
    index + 1,
    0,
    block
  );

  renderBlocks({
    focusIndex:
      block.type === 'text'
        ? index + 1
        : null
  });
  
  autoSaveDraft();
}


// =========================================================
// Открыть выбор изображения
// =========================================================

function openImagePicker(
  insertIndex
) {
  state.pendingImageInsertIndex =
    insertIndex;

  const input =
    document.getElementById(
      'fileInput'
    );

  if (input) {
    input.value = '';
    input.click();
  }
}


// =========================================================
// Кнопки добавления блоков
// =========================================================

function createBlockAddControls(
  index
) {
  const row =
    document.createElement(
      'div'
    );

  row.className =
    'block-add-row';

  row.innerHTML = `
    <button
      class="block-add-btn"
      type="button"
      data-add="text"
    >
      ＋ Текст
    </button>

    <button
      class="block-add-btn"
      type="button"
      data-add="image"
    >
      ＋ Картинка
    </button>
  `;

  row
    .querySelector(
      '[data-add="text"]'
    )
    .onclick = () => {
      insertBlockAfter(
        index,
        {
          type: 'text',
          html: ''
        }
      );
    };

  row
    .querySelector(
      '[data-add="image"]'
    )
    .onclick = () => {
      openImagePicker(
        index + 1
      );
    };

  return row;
}


// =========================================================
// Рендер блоков
// =========================================================

function renderBlocks(
  options = {}
) {
  const host =
    document.getElementById(
      'blocksHost'
    );

  if (!host) {
    return;
  }

  const d = state.draft;

  const old =
    activeBlockEl;

  let activeIndex = null;
  let offset = null;


  // -------------------------------------------------------
  // Сохраняем позицию курсора
  // -------------------------------------------------------

  if (
    old?.isConnected &&
    old.dataset.i !== undefined
  ) {
    activeIndex =
      Number(old.dataset.i);

    try {

      const s = getSelection();

      if (s?.rangeCount) {

        const r =
          s.getRangeAt(0);

        if (
          old.contains(
            r.startContainer
          )
        ) {
          offset =
            getCaretOffset(
              old,
              r
            );
        }
      }

    } catch (e) {}
  }


  // -------------------------------------------------------
  // Перерисовка
  // -------------------------------------------------------

  host.innerHTML = '';

  d.blocks.forEach(
    (b, i) => {

      const block =
        document.createElement(
          'div'
        );

      block.className =
        'block';

      block.dataset.i = i;


      // ---------------------------------------------------
      // Текстовый блок
      // ---------------------------------------------------

      if (b.type === 'text') {

        block.innerHTML = `
          <button
            class="block-remove"
            data-act="del"
            data-i="${i}"
            type="button"
          >
            ✕
          </button>

          <div
            class="block-text"
            contenteditable="true"
            data-i="${i}"
            data-placeholder="Текст абзаца…"
          >
            ${sanitizeHtml(
              b.html || ''
            )}
          </div>
        `;


      // ---------------------------------------------------
      // Изображение
      // ---------------------------------------------------

      } else if (
        b.type === 'image'
      ) {

        block.className =
          'block block-image-wrap';

        block.innerHTML = `
          <button
            class="block-remove"
            data-act="del"
            data-i="${i}"
            type="button"
          >
            ✕
          </button>

          <img
            src="${escapeHtml(
              b.src || ''
            )}"
            alt=""
          >

          <input
            class="block-caption"
            data-i="${i}"
            placeholder="Подпись (необязательно)"
            value="${escapeHtml(
              b.caption || ''
            )}"
          >
        `;

      } else {
        return;
      }

      host.appendChild(block);

      host.appendChild(
        createBlockAddControls(i)
      );
    }
  );


  // =======================================================
  // Текстовые блоки
  // =======================================================

  host
    .querySelectorAll(
      '.block-text'
    )
    .forEach(el => {

      el.onfocus = () => {
        activeBlockEl = el;
      };

      el.oninput = e => {

        const i =
          +e.target.dataset.i;

        if (
          d.blocks[i]?.type ===
          'text'
        ) {
          d.blocks[i].html =
            sanitizeHtml(
              e.target.innerHTML
            );
        }
        
        autoSaveDraft();
      };

      el.onkeyup = () => {
        activeBlockEl = el;
      };

      el.onmouseup = () => {
        activeBlockEl = el;
      };
    });


  // =======================================================
  // Подписи изображений
  // =======================================================

  host
    .querySelectorAll(
      '.block-caption'
    )
    .forEach(el => {

      el.oninput = e => {

        const i =
          +e.target.dataset.i;

        if (
          d.blocks[i]?.type ===
          'image'
        ) {
          d.blocks[i].caption =
            e.target.value;
        }
        
        autoSaveDraft();
      };
    });


  // =======================================================
  // Удаление блоков
  // =======================================================

  host
    .querySelectorAll(
      '[data-act="del"]'
    )
    .forEach(el => {

      el.onclick = () => {

        const i =
          +el.dataset.i;

        if (!d.blocks[i]) {
          return;
        }

        d.blocks.splice(
          i,
          1
        );

        if (!d.blocks.length) {
          d.blocks.push({
            type: 'text',
            html: ''
          });
        }

        renderBlocks({
          focusIndex:
            Math.min(
              i,
              d.blocks.length - 1
            )
        });
        
        autoSaveDraft();
      };
    });


  // =======================================================
  // Фокус на новый блок
  // =======================================================

  if (
    options.focusIndex !==
      undefined &&
    options.focusIndex !== null
  ) {

    const t =
      host.querySelector(
        `.block-text[data-i="${options.focusIndex}"]`
      );

    if (t) {

      requestAnimationFrame(
        () => {

          t.focus();

          activeBlockEl = t;

          placeCaretAtEnd(t);
        }
      );
    }

    return;
  }


  // =======================================================
  // Восстановление старого фокуса
  // =======================================================

  if (
    activeIndex !== null &&
    activeIndex < d.blocks.length
  ) {

    const t =
      host.querySelector(
        `.block-text[data-i="${activeIndex}"]`
      );

    if (
      t &&
      document.activeElement ===
        document.body
    ) {

      t.focus();

      activeBlockEl = t;

      if (offset !== null) {
        setCaretOffset(
          t,
          offset
        );
      }
    }
  }
  
  updateDraftBanner();
}


// =========================================================
// Получить позицию курсора
// =========================================================

function getCaretOffset(
  el,
  range
) {
  const r =
    range.cloneRange();

  r.selectNodeContents(el);

  r.setEnd(
    range.startContainer,
    range.startOffset
  );

  return r.toString().length;
}


// =========================================================
// Установить позицию курсора
// =========================================================

function setCaretOffset(
  el,
  offset
) {
  const s =
    getSelection();

  if (!s) {
    return;
  }

  const r =
    document.createRange();

  let cur = 0;
  let found = false;

  function walk(n) {

    if (found) {
      return;
    }

    if (n.nodeType === 3) {

      const len =
        n.nodeValue.length;

      if (
        cur + len >= offset
      ) {

        r.setStart(
          n,
          Math.max(
            0,
            offset - cur
          )
        );

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
  const s =
    getSelection();

  if (!s) {
    return;
  }

  const r =
    document.createRange();

  r.selectNodeContents(el);

  r.collapse(false);

  s.removeAllRanges();

  s.addRange(r);
}


// =========================================================
// Сжатие изображения
// =========================================================

function compressImageFile(
  file,
  maxW = 1200,
  quality = .82
) {
  return new Promise(
    (resolve, reject) => {

      const r =
        new FileReader();

      r.onload = e => {

        const img =
          new Image();

        img.onload = () => {

          let w = img.width;
          let h = img.height;

          if (w > maxW) {

            h =
              Math.round(
                h * maxW / w
              );

            w = maxW;
          }

          const c =
            document.createElement(
              'canvas'
            );

          c.width = w;
          c.height = h;

          c
            .getContext('2d')
            .drawImage(
              img,
              0,
              0,
              w,
              h
            );

          resolve(
            c.toDataURL(
              'image/jpeg',
              quality
            )
          );
        };

        img.onerror =
          reject;

        img.src =
          e.target.result;
      };

      r.onerror =
        reject;

      r.readAsDataURL(file);
    }
  );
}


// =========================================================
// Автосохранение черновика
// =========================================================

let autoSaveTimeout = null;

function autoSaveDraft() {
  const d = state.draft;
  
  if (!d) return;
  
  if (isDraftEmpty(d)) {
    if (state.hasDraft) {
      clearDraft();
      updateDraftBanner();
    }
    return;
  }
  
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  
  autoSaveTimeout = setTimeout(() => {
    saveDraftToStorage(d);
    updateDraftBanner();
  }, 1000);
}


// =========================================================
// Обновить баннер черновика
// =========================================================

function updateDraftBanner() {
  const banner = document.getElementById('draftBanner');
  if (!banner) return;
  
  if (state.hasDraft && !isDraftEmpty(state.draft)) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}


// =========================================================
// КАСТОМНАЯ ПЛАШКА ФОРМАТИРОВАНИЯ (в стиле Telegram)
// =========================================================

// Показать кастомную плашку
function showCustomToolbar() {
  const toolbar = document.getElementById('customToolbar');
  if (!toolbar) return;
  
  const selection = window.getSelection();
  
  if (!selection || selection.isCollapsed || !activeBlockEl) {
    toolbar.style.display = 'none';
    return;
  }
  
  const range = selection.getRangeAt(0);
  const rect = range.getClientRects()[0];
  
  if (!rect) {
    toolbar.style.display = 'none';
    return;
  }
  
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  const isMobile = window.innerWidth <= 520;
  
  if (isMobile) {
    toolbar.style.position = 'fixed';
    toolbar.style.top = 'auto';
    toolbar.style.bottom = '20px';
    toolbar.style.left = '50%';
    toolbar.style.transform = 'translateX(-50%)';
    toolbar.style.width = 'calc(100% - 32px)';
    toolbar.style.maxWidth = '400px';
  } else {
    toolbar.style.position = 'absolute';
    toolbar.style.top = (rect.top + scrollTop - 55) + 'px';
    toolbar.style.left = (rect.left + scrollLeft + rect.width/2 - 140) + 'px';
    toolbar.style.transform = 'none';
    toolbar.style.width = 'auto';
    toolbar.style.maxWidth = 'none';
  }
  
  toolbar.style.display = 'flex';
  
  updateToolbarButtons();
}

// Скрыть кастомную плашку
function hideCustomToolbar() {
  const toolbar = document.getElementById('customToolbar');
  if (toolbar) {
    toolbar.style.display = 'none';
    closeToolbarDropdown();
  }
}

// Обновить активные кнопки
function updateToolbarButtons() {
  const commands = ['bold', 'italic', 'underline', 'strikeThrough', 'mono', 'spoiler', 'blockquote'];
  
  commands.forEach(cmd => {
    const btn = document.querySelector(`#customToolbar [data-cmd="${cmd}"]`);
    if (btn) {
      const isActive = document.queryCommandState(cmd);
      btn.classList.toggle('active', isActive);
    }
  });
}

// Применить команду к выделенному тексту
function applyCommandToSelection(cmd) {
  const selection = window.getSelection();
  
  if (selection.isCollapsed) return;
  
  document.execCommand(cmd, false, null);
  
  // Обновляем кнопки
  updateToolbarButtons();
}

// Открыть/закрыть выпадающее меню
function toggleToolbarDropdown(e) {
  e.stopPropagation();
  
  const dropdown = document.getElementById('toolbarDropdown');
  if (!dropdown) return;
  
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : 'block';
}

// Закрыть выпадающее меню
function closeToolbarDropdown() {
  const dropdown = document.getElementById('toolbarDropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

// Инициализация кастомной плашки — ИСПРАВЛЕНО ДЛЯ МОБИЛЬНЫХ
function initCustomToolbar() {
  const toolbar = document.getElementById('customToolbar');
  if (!toolbar) return;
  
  // Функция для обработки команд
  function handleToolbarCommand(cmd) {
    if (cmd === 'selectAll') {
      document.execCommand('selectAll', false, null);
      updateToolbarButtons();
      return;
    }
    
    if (cmd === 'cut' || cmd === 'copy' || cmd === 'paste') {
      document.execCommand(cmd, false, null);
      return;
    }
    
    applyCommandToSelection(cmd);
  }
  
  // Привязываем события к кнопкам плашки
  document.querySelectorAll('#customToolbar [data-cmd]').forEach(btn => {
    // Для десктопа
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handleToolbarCommand(btn.dataset.cmd);
    });
    
    // Для мобильных
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleToolbarCommand(btn.dataset.cmd);
    }, { passive: false });
  });
  
  // Кнопка "Ещё"
  const moreBtn = document.getElementById('toolbarMoreBtn');
  if (moreBtn) {
    moreBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      toggleToolbarDropdown(e);
    });
    
    moreBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      toggleToolbarDropdown(e);
    }, { passive: false });
  }
  
  // Закрытие выпадающего меню при клике вне
  document.addEventListener('mousedown', (e) => {
    const toolbarEl = document.getElementById('customToolbar');
    if (!toolbarEl) return;
    
    if (!toolbarEl.contains(e.target)) {
      closeToolbarDropdown();
    }
  });
  
  // Скрываем плашку при прокрутке
  let scrollTimeout;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && activeBlockEl) {
        showCustomToolbar();
      }
    }, 100);
  });
  
  // Обновляем плашку при изменении выделения
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && activeBlockEl) {
      showCustomToolbar();
    } else {
      hideCustomToolbar();
    }
  });
}


// =========================================================
// Публикация / сохранение статьи
// =========================================================

async function publishDraft() {
  const d = state.draft;

  const hasContent =
    !!d.title.trim() ||
    !!d.cover ||
    d.blocks.some(
      b =>
        b.type === 'image' ||
        (
          b.type === 'text' &&
          b.html
            .replace(
              /<[^>]+>/g,
              ''
            )
            .trim()
        )
    );

  if (!hasContent) {
    showToast(
      'Добавьте заголовок или содержимое'
    );

    return;
  }

  const button =
    document.getElementById(
      'publishBtn'
    );

  const hint =
    document.getElementById(
      'editorHint'
    );

  button.disabled = true;

  hint.textContent =
    d.id
      ? 'Сохраняем изменения…'
      : 'Публикуем…';

  try {

    const profile =
      await ensureProfile(true);

    if (!profile) {
      throw new Error(
        'Необходимо указать ник'
      );
    }


    // -----------------------------------------------------
    // Обложка
    // -----------------------------------------------------

    let cover =
      d.cover || null;

    if (
      cover?.startsWith('data:')
    ) {
      cover =
        await uploadImage(
          cover,
          'cover.jpg'
        );
    }


    // -----------------------------------------------------
    // Изображения внутри статьи
    // -----------------------------------------------------

    for (
      const b of d.blocks
    ) {

      if (
        b.type === 'image' &&
        b._pendingFile
      ) {

        b.src =
          await uploadImage(
            b.src,
            'image.jpg'
          );

        delete b._pendingFile;
      }
    }


    // -----------------------------------------------------
    // Excerpt
    // -----------------------------------------------------

    const first =
      d.blocks.find(
        b =>
          b.type === 'text' &&
          b.html?.trim()
      );

    const excerpt =
      first
        ? first.html
            .replace(
              /<[^>]+>/g,
              ''
            )
            .trim()
            .slice(0, 140)
        : '';


    // -----------------------------------------------------
    // Payload
    // -----------------------------------------------------

    const payload = {
      title:
        d.title.trim() ||
        'Без названия',

      excerpt,

      cover,

      blocks:
        d.blocks
    };


    // -----------------------------------------------------
    // Новая статья
    // -----------------------------------------------------

    if (!d.id) {

      const r =
        await callTelegramApi(
          'create-article',
          {
            article:
              payload
          }
        );

      clearDraft();

      showToast(
        'Опубликовано'
      );

      await openReader(
        r.article.id
      );


    // -----------------------------------------------------
    // Обновление статьи
    // -----------------------------------------------------

    } else {

      const r =
        await callTelegramApi(
          'update-article',
          {
            article: {
              id: d.id,
              ...payload
            }
          }
        );

      clearDraft();

      showToast(
        'Изменения сохранены'
      );

      await openReader(
        r.article.id
      );
    }

  } catch (e) {

    console.error(e);

    showToast(
      e.message ||
      'Ошибка публикации'
    );

    hint.textContent = '';

  } finally {

    button.disabled = false;
  }
}
