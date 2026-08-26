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

      <button
        data-cmd="strikeThrough"
        title="Зачеркнутый"
      >
        <span style="text-decoration:line-through;">S</span>
      </button>

      <button
        data-cmd="blockquote"
        title="Цитировать"
      >
        ❝
      </button>

      <button
        data-cmd="spoiler"
        title="Скрытый"
      >
        ◼
      </button>

      <button
        data-cmd="mono"
        title="Моноширинный"
      >
        &#96;&nbsp;&#96;
      </button>

      <button
        data-cmd="removeFormat"
        title="Обычный текст"
      >
        T
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
      <button data-cmd="strikeThrough" title="Зачеркнутый"><span style="text-decoration:line-through;">S</span></button>
      <button data-cmd="blockquote" title="Цитировать">❝</button>
      <button data-cmd="spoiler" title="Скрытый">◼</button>
      <button data-cmd="mono" title="Моноширинный">&#96;&nbsp;&#96;</button>
      <button data-cmd="removeFormat" title="Обычный текст">T</button>

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
  // Панель форматирования (верхняя, всегда видимая)
  // =======================================================

  document
    .querySelectorAll(
      '#toolbar button'
    )
    .forEach(btn => {

      // Используем только click, чтобы избежать двойных срабатываний
      // на touch-устройствах (mousedown + touchstart)
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
  // Инициализация кастомной плашки (один раз на рендер редактора)
  // =======================================================

  initCustomToolbar();
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
// ФОРМАТИРОВАНИЕ ТЕКСТА
// =========================================================

const CUSTOM_TAGS = {
  mono: { tag: 'CODE', className: null },
  spoiler: { tag: 'SPAN', className: 'tg-spoiler' },
  blockquote: { tag: 'BLOCKQUOTE', className: null }
};

const NATIVE_COMMANDS = new Set([
  'bold',
  'italic',
  'underline',
  'strikeThrough'
]);

function applyFormatCommand(cmd) {
  if (!activeBlockEl) {
    showToast('Нажмите на текст, чтобы начать редактирование');
    return;
  }

  const selection = window.getSelection();

  // Если нет выделения — показываем подсказку
  if (!selection || selection.isCollapsed) {
    showToast('Выделите текст, чтобы применить форматирование');
    return;
  }

  // Проверяем, что выделение внутри активного блока
  if (!activeBlockEl.contains(selection.anchorNode)) {
    showToast('Выделите текст внутри абзаца');
    return;
  }

  if (cmd === 'removeFormat') {
    removeAllFormatting(activeBlockEl, selection);
  } else if (NATIVE_COMMANDS.has(cmd)) {
    document.execCommand(cmd, false, null);
  } else if (CUSTOM_TAGS[cmd]) {
    toggleCustomTag(cmd, selection);
  }

  activeBlockEl.dispatchEvent(new Event('input'));
  updateToolbarButtons();
}

// ---------------------------------------------------------
// Обернуть/снять кастомный тег (code / spoiler / blockquote)
// ---------------------------------------------------------

function toggleCustomTag(cmd, selection) {
  if (!selection || selection.isCollapsed) {
    return;
  }

  const { tag, className } = CUSTOM_TAGS[cmd];
  const range = selection.getRangeAt(0);

  // Если выделение уже целиком внутри такого тега — снимаем его
  const existing = findAncestorTag(
    range.commonAncestorContainer,
    tag,
    className
  );

  if (existing) {
    unwrapElement(existing);
    return;
  }

  // Иначе — оборачиваем выделенное содержимое в тег
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
  let el =
    node.nodeType === 3
      ? node.parentElement
      : node;

  while (el && el.contentEditable !== 'true') {
    if (
      el.tagName === tagName &&
      (!className || el.classList.contains(className))
    ) {
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

// ---------------------------------------------------------
// Полный сброс форматирования (только в пределах выделения)
// ---------------------------------------------------------

function removeAllFormatting(blockEl, selection) {
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  
  // Проверяем, что выделение находится внутри activeBlockEl
  if (!blockEl.contains(range.commonAncestorContainer)) {
    return;
  }

  // Получаем содержимое выделения
  const fragment = range.extractContents();
  
  // Создаем временный контейнер
  const temp = document.createElement('div');
  temp.appendChild(fragment);

  // Функция для очистки форматирования
  function cleanNode(node) {
    const children = [...node.childNodes];
    
    children.forEach(child => {
      if (child.nodeType === 1) {
        const tagName = child.tagName;
        
        // Проверяем, является ли тег кастомным
        const isCustom = (
          tagName === 'CODE' ||
          tagName === 'BLOCKQUOTE' ||
          (tagName === 'SPAN' && child.classList.contains('tg-spoiler'))
        );

        // Проверяем, является ли тег нативным форматированием
        const isNativeFormat = (
          tagName === 'B' ||
          tagName === 'STRONG' ||
          tagName === 'I' ||
          tagName === 'EM' ||
          tagName === 'U' ||
          tagName === 'S' ||
          tagName === 'STRIKE'
        );

        if (isCustom || isNativeFormat) {
          // Разворачиваем тег
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
          node.removeChild(child);
        } else {
          // Рекурсивно обрабатываем вложенные элементы
          cleanNode(child);
        }
      }
    });
  }

  // Очищаем временный контейнер
  cleanNode(temp);

  // Получаем очищенный HTML
  let cleanHtml = temp.innerHTML;

  // Удаляем пустые теги
  cleanHtml = cleanHtml.replace(/<([^>]+)><\/\1>/g, '');

  // Вставляем очищенное содержимое обратно
  const newRange = document.createRange();
  newRange.selectNodeContents(blockEl);
  newRange.deleteContents();

  if (cleanHtml.trim()) {
    const newFragment = newRange.createContextualFragment(cleanHtml);
    newRange.insertNode(newFragment);
  }

  // Сбрасываем выделение
  selection.removeAllRanges();

  // Ставим курсор в конец блока
  const finalRange = document.createRange();
  finalRange.selectNodeContents(blockEl);
  finalRange.collapse(false);
  selection.addRange(finalRange);
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
  }
}

// Обновить активные кнопки
function updateToolbarButtons() {
  const nativeCommands = ['bold', 'italic', 'underline', 'strikeThrough'];

  nativeCommands.forEach(cmd => {
    document
      .querySelectorAll(`[data-cmd="${cmd}"]`)
      .forEach(btn => {
        let isActive = false;
        try {
          isActive = document.queryCommandState(cmd);
        } catch (e) {}
        btn.classList.toggle('active', isActive);
      });
  });

  // Для кастомных тегов подсвечиваем кнопку, если курсор/выделение
  // находится внутри соответствующего тега
  const selection = window.getSelection();

  Object.entries(CUSTOM_TAGS).forEach(([cmd, { tag, className }]) => {
    let isActive = false;

    if (selection && selection.rangeCount && activeBlockEl) {
      const range = selection.getRangeAt(0);
      isActive = !!findAncestorTag(range.commonAncestorContainer, tag, className);
    }

    document
      .querySelectorAll(`[data-cmd="${cmd}"]`)
      .forEach(btn => btn.classList.toggle('active', isActive));
  });
}

// Инициализация кастомной плашки
function initCustomToolbar() {
  const toolbar = document.getElementById('customToolbar');
  if (!toolbar) return;

  // Привязываем события к кнопкам плашки
  // Используем только click для избежания двойных срабатываний
  document.querySelectorAll('#customToolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      if (!activeBlockEl) {
        return;
      }

      applyFormatCommand(btn.dataset.cmd);
    });
  });

  // Скрываем плашку при прокрутке, обновляем позицию
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
