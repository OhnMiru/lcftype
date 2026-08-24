// =========================================================
// Летопись — Telegram Mini App
// Защищённая версия с Telegram user_id
// =========================================================

// ---- Настройки ----
const BOT_USERNAME = 'lcftype_bot';      // без @
const MINIAPP_SHORT_NAME = 'lcftype';    // short name Web App

// =========================================================
// Инициализация
// =========================================================

const db = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const tg = window.Telegram
  ? window.Telegram.WebApp
  : null;

if (tg) {
  tg.ready();
  tg.expand();
}

const tgUser =
  tg &&
  tg.initDataUnsafe &&
  tg.initDataUnsafe.user
    ? tg.initDataUnsafe.user
    : null;

const state = {
  view: 'feed',
  articles: [],
  draft: null,
  currentId: null
};

let activeBlockEl = null;


// =========================================================
// Уведомления
// =========================================================

function showToast(msg) {
  const t = document.getElementById('toast');

  if (!t) {
    console.log(msg);
    return;
  }

  t.textContent = msg;
  t.classList.add('show');

  setTimeout(() => {
    t.classList.remove('show');
  }, 2500);
}


// =========================================================
// Дата
// =========================================================

function fmtDate(iso) {
  if (!iso) return '';

  return new Date(iso).toLocaleDateString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }
  );
}


// =========================================================
// HTML escape
// =========================================================

function escapeHtml(s) {
  const d = document.createElement('div');

  d.textContent = s || '';

  return d.innerHTML;
}


// =========================================================
// Санитайзер HTML
// =========================================================

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'BR',
  'SPAN',
  'DIV'
]);

function sanitizeHtml(html) {
  const doc = document.createElement('div');

  doc.innerHTML = html;

  (function clean(node) {
    [...node.childNodes].forEach(child => {

      if (child.nodeType === 1) {

        if (!ALLOWED_TAGS.has(child.tagName)) {

          const parent = child.parentNode;

          while (child.firstChild) {
            parent.insertBefore(
              child.firstChild,
              child
            );
          }

          parent.removeChild(child);

          return;
        }

        [...child.attributes].forEach(attr => {
          child.removeAttribute(attr.name);
        });

        clean(child);

      } else if (child.nodeType !== 3) {

        child.parentNode.removeChild(child);
      }
    });
  })(doc);

  return doc.innerHTML;
}


// =========================================================
// Supabase: чтение
// =========================================================

async function fetchFeed() {

  const {
    data,
    error
  } = await db
    .from('articles')
    .select(
      'id,title,excerpt,cover,created_at,author_id,author_name'
    )
    .order(
      'created_at',
      {
        ascending: false
      }
    );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}


async function fetchArticle(id) {

  const {
    data,
    error
  } = await db
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}


// =========================================================
// Защищённые операции через Edge Function
// =========================================================

async function callTelegramApi(action, extra = {}) {

  if (!tg) {
    throw new Error(
      'Telegram WebApp недоступен.'
    );
  }

  if (!tg.initData) {
    throw new Error(
      'Telegram initData отсутствует. ' +
      'Откройте приложение внутри Telegram.'
    );
  }

  const {
    data,
    error
  } = await db.functions.invoke(
    'telegram-api',
    {
      body: {
        action,
        initData: tg.initData,
        ...extra
      }
    }
  );

  if (error) {
    console.error(
      'Edge Function error:',
      error
    );

    throw new Error(
      error.message ||
      'Ошибка связи с сервером'
    );
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return data;
}


// =========================================================
// Профиль пользователя
// =========================================================

async function getProfile() {

  const result =
    await callTelegramApi(
      'get-profile'
    );

  return result.profile || null;
}


async function setProfile(username) {

  const result =
    await callTelegramApi(
      'set-profile',
      {
        username
      }
    );

  return result.profile;
}


// =========================================================
// Получить / создать профиль
// =========================================================

async function ensureProfile() {

  const existing =
    await getProfile();

  if (existing) {
    return existing;
  }

  let username = prompt(
    'Придумайте имя автора.\n\n' +
    'От 3 до 30 символов.\n' +
    'Можно использовать латинские буквы, цифры и _.'
  );

  if (!username) {
    throw new Error(
      'Имя автора не задано'
    );
  }

  username = username.trim();

  const profile =
    await setProfile(username);

  return profile;
}


// =========================================================
// Создание статьи
// =========================================================

async function createArticle(article) {

  const result =
    await callTelegramApi(
      'create-article',
      {
        article
      }
    );

  return result.article;
}


// =========================================================
// Редактирование статьи
// =========================================================

async function updateArticle(article) {

  const result =
    await callTelegramApi(
      'update-article',
      {
        article
      }
    );

  return result.article;
}


// =========================================================
// Удаление статьи
// =========================================================

async function removeArticle(id) {

  await callTelegramApi(
    'delete-article',
    {
      articleId: id
    }
  );
}


// =========================================================
// Загрузка изображения
// =========================================================

async function uploadImage(
  dataUrl,
  filename
) {

  const res =
    await fetch(dataUrl);

  const blob =
    await res.blob();

  const path =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${filename}`;

  const {
    error
  } = await db
    .storage
    .from('images')
    .upload(
      path,
      blob,
      {
        contentType:
          blob.type || 'image/jpeg',
        upsert: false
      }
    );

  if (error) {
    throw error;
  }

  const {
    data
  } = db
    .storage
    .from('images')
    .getPublicUrl(path);

  return data.publicUrl;
}


// =========================================================
// Сжатие изображения
// =========================================================

function compressImageFile(
  file,
  maxW = 1200,
  quality = 0.82
) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload = e => {

        const img =
          new Image();

        img.onload = () => {

          let w = img.width;
          let h = img.height;

          if (w > maxW) {

            h =
              Math.round(
                h * (maxW / w)
              );

            w = maxW;
          }

          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width = w;
          canvas.height = h;

          const ctx =
            canvas.getContext('2d');

          ctx.drawImage(
            img,
            0,
            0,
            w,
            h
          );

          resolve(
            canvas.toDataURL(
              'image/jpeg',
              quality
            )
          );
        };

        img.onerror = reject;

        img.src = e.target.result;
      };

      reader.onerror = reject;

      reader.readAsDataURL(file);
    }
  );
}


// =========================================================
// Лента
// =========================================================

async function renderFeed() {

  state.view = 'feed';
  state.currentId = null;

  setBackButton(false);

  const main =
    document.getElementById('main');

  main.innerHTML =
    '<div class="loading">Загрузка статей…</div>';

  state.articles =
    await fetchFeed();

  if (!state.articles.length) {

    main.innerHTML = `
      <div class="empty-state">
        <h2>Здесь пока пусто</h2>

        <p>
          Нажмите «+ Статья» вверху,
          чтобы опубликовать первую запись.
        </p>
      </div>
    `;

    return;
  }

  main.innerHTML =
    state.articles
      .map(article => `
        <div
          class="feed-item"
          data-id="${escapeHtml(article.id)}"
        >

          ${
            article.cover
              ? `
                <img
                  class="thumb"
                  src="${escapeHtml(article.cover)}"
                  alt=""
                >
              `
              : ''
          }

          <div class="feed-meta">
            ${fmtDate(article.created_at)}
          </div>

          <h3>
            ${escapeHtml(
              article.title ||
              'Без названия'
            )}
          </h3>

          <p>
            ${escapeHtml(
              article.excerpt || ''
            )}
          </p>

        </div>
      `)
      .join('');

  main
    .querySelectorAll('.feed-item')
    .forEach(el => {

      el.addEventListener(
        'click',
        () => {
          openReader(
            el.dataset.id
          );
        }
      );
    });
}


// =========================================================
// Определяем, владелец ли статьи
// =========================================================

function isArticleOwner(article) {

  if (!tgUser) {
    return false;
  }

  if (!article) {
    return false;
  }

  if (!article.author_id) {
    return false;
  }

  return (
    Number(article.author_id) ===
    Number(tgUser.id)
  );
}


// =========================================================
// Чтение статьи
// =========================================================

async function openReader(id) {

  state.view = 'reader';
  state.currentId = id;

  setBackButton(
    true,
    renderFeed
  );

  const main =
    document.getElementById('main');

  main.innerHTML =
    '<div class="loading">Открываем статью…</div>';

  const article =
    await fetchArticle(id);

  if (!article) {

    main.innerHTML = `
      <div class="empty-state">
        <h2>Статья не найдена</h2>
        <p>Возможно, её удалили.</p>
      </div>
    `;

    return;
  }


  // -----------------------------------------------
  // Содержимое статьи
  // -----------------------------------------------

  const bodyHtml =
    (article.blocks || [])
      .map(block => {

        if (
          block.type === 'text'
        ) {

          return (
            block.html &&
            block.html.trim()
          )
            ? `<p>${sanitizeHtml(
                block.html
              )}</p>`
            : '';
        }

        if (
          block.type === 'image'
        ) {

          return `
            <figure>

              <img
                src="${escapeHtml(
                  block.src || ''
                )}"
                alt=""
              >

              ${
                block.caption
                  ? `
                    <figcaption>
                      ${escapeHtml(
                        block.caption
                      )}
                    </figcaption>
                  `
                  : ''
              }

            </figure>
          `;
        }

        return '';
      })
      .join('');


  // -----------------------------------------------
  // Share URL
  // -----------------------------------------------

  const shareUrl =
    `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=${article.id}`;


  // -----------------------------------------------
  // Owner?
  // -----------------------------------------------

  const owner =
    isArticleOwner(article);


  // -----------------------------------------------
  // Кнопки владельца
  // -----------------------------------------------

  const ownerButtons =
    owner
      ? `
        <div
          style="
            display:flex;
            gap:6px;
            margin-left:auto;
          "
        >

          <button
            class="btn"
            id="editBtn"
            style="
              font-size:11px;
              padding:6px 10px;
            "
          >
            Редактировать
          </button>

          <button
            class="btn btn-danger"
            id="deleteBtn"
            style="
              font-size:11px;
              padding:6px 10px;
            "
          >
            Удалить
          </button>

        </div>
      `
      : '';


  // -----------------------------------------------
  // HTML статьи
  // -----------------------------------------------

  main.innerHTML = `
    <div class="reader">

      <div
        class="reader-meta"
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
        "
      >

        <span>
          ${fmtDate(article.created_at)}

          ${
            article.author_name
              ? `
                ·
                ${escapeHtml(
                  article.author_name
                )}
              `
              : ''
          }
        </span>

        ${ownerButtons}

      </div>


      <h1>
        ${escapeHtml(
          article.title ||
          'Без названия'
        )}
      </h1>


      <div class="reader-body">
        ${
          bodyHtml ||
          `
            <p
              style="
                color:var(--ink-soft)
              "
            >
              Статья пока пуста.
            </p>
          `
        }
      </div>


      <div class="share-box chrome">

        <div class="share-box-label">
          Поделиться
        </div>

        <button
          class="btn btn-primary"
          id="shareBtn"
          style="width:100%;"
        >
          Отправить ссылку в чат
        </button>

      </div>

    </div>
  `;


  // -----------------------------------------------
  // Поделиться
  // -----------------------------------------------

  const shareBtn =
    document.getElementById(
      'shareBtn'
    );

  if (shareBtn) {

    shareBtn.addEventListener(
      'click',
      async () => {

        try {

          if (
            tg &&
            tg.openTelegramLink
          ) {

            tg.openTelegramLink(
              `https://t.me/share/url?url=${
                encodeURIComponent(
                  shareUrl
                )
              }&text=${
                encodeURIComponent(
                  article.title ||
                  'Статья'
                )
              }`
            );

            return;
          }


          if (
            navigator.share
          ) {

            await navigator.share({
              title:
                article.title,
              url:
                shareUrl
            });

            return;
          }


          await navigator
            .clipboard
            .writeText(
              shareUrl
            );

          showToast(
            'Ссылка скопирована'
          );

        } catch (err) {

          console.error(
            'Share error:',
            err
          );
        }
      }
    );
  }


  // -----------------------------------------------
  // Редактирование
  // -----------------------------------------------

  if (owner) {

    const editBtn =
      document.getElementById(
        'editBtn'
      );

    if (editBtn) {

      editBtn.addEventListener(
        'click',
        () => {
          editArticle(article);
        }
      );
    }


    // ---------------------------------------------
    // Удаление
    // ---------------------------------------------

    const deleteBtn =
      document.getElementById(
        'deleteBtn'
      );

    if (deleteBtn) {

      deleteBtn.addEventListener(
        'click',
        async () => {

          if (
            !confirm(
              'Удалить статью безвозвратно?'
            )
          ) {
            return;
          }

          try {

            deleteBtn.disabled = true;
            deleteBtn.textContent =
              'Удаляем…';

            await removeArticle(
              article.id
            );

            showToast(
              'Статья удалена'
            );

            await renderFeed();

          } catch (err) {

            console.error(
              'Delete error:',
              err
            );

            deleteBtn.disabled =
              false;

            deleteBtn.textContent =
              'Удалить';

            showToast(
              'Не удалось удалить: ' +
              (
                err.message ||
                'ошибка'
              )
            );
          }
        }
      );
    }
  }
}


// =========================================================
// Новый черновик
// =========================================================

function newDraft() {

  return {
    id: null,

    title: '',

    blocks: [
      {
        type: 'text',
        html: ''
      }
    ]
  };
}


// =========================================================
// Новый редактор
// =========================================================

function openEditor() {

  state.view = 'editor';

  state.currentId = null;

  state.draft =
    newDraft();

  setBackButton(
    true,
    () => {

      if (
        confirm(
          'Отменить редактирование? ' +
          'Черновик будет потерян.'
        )
      ) {

        renderFeed();
      }
    }
  );

  renderEditor();
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

  state.currentId =
    article.id;


  state.draft = {

    id: article.id,

    title:
      article.title || '',

    blocks:
      JSON.parse(
        JSON.stringify(
          article.blocks || []
        )
      )
  };


  if (
    !state.draft.blocks.length
  ) {

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

      if (
        confirm(
          'Отменить редактирование? ' +
          'Изменения будут потеряны.'
        )
      ) {

        openReader(
          article.id
        );
      }
    }
  );


  renderEditor();
}


// =========================================================
// Редактор
// =========================================================

function renderEditor() {

  const main =
    document.getElementById('main');

  const d =
    state.draft;


  main.innerHTML = `

    <input
      class="editor-title-input"
      id="titleInput"
      placeholder="Заголовок статьи"
      value="${escapeHtml(
        d.title
      )}"
    >


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


    <div class="add-row">

      <button
        class="add-btn"
        id="addTextBtn"
      >
        ＋ Текст
      </button>

      <button
        class="add-btn"
        id="addImageBtn"
      >
        ＋ Картинка
      </button>

    </div>


    <button
      class="btn btn-primary"
      id="publishBtn"
      style="
        width:100%;
        padding:14px;
      "
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
      id="fileInput"
      style="display:none"
    >


    <div
      class="hint chrome"
      id="editorHint"
      style="
        text-align:center;
        margin-top:10px;
        color:var(--ink-soft);
        font-size:12px;
      "
    ></div>

  `;


  // -----------------------------------------------
  // Заголовок
  // -----------------------------------------------

  const titleInput =
    document.getElementById(
      'titleInput'
    );

  titleInput.addEventListener(
    'input',
    e => {

      d.title =
        e.target.value;
    }
  );


  // -----------------------------------------------
  // Toolbar
  // -----------------------------------------------

  const toolbar =
    document.getElementById(
      'toolbar'
    );

  toolbar
    .querySelectorAll('button')
    .forEach(btn => {

      btn.addEventListener(
        'mousedown',
        e => {

          e.preventDefault();

          if (
            !activeBlockEl
          ) {
            return;
          }

          document.execCommand(
            btn.dataset.cmd,
            false,
            null
          );

          activeBlockEl.dispatchEvent(
            new Event('input')
          );
        }
      );
    });


  // -----------------------------------------------
  // Добавить текст
  // -----------------------------------------------

  document
    .getElementById(
      'addTextBtn'
    )
    .addEventListener(
      'click',
      () => {

        d.blocks.push({
          type: 'text',
          html: ''
        });

        renderBlocks();
      }
    );


  // -----------------------------------------------
  // Добавить изображение
  // -----------------------------------------------

  document
    .getElementById(
      'addImageBtn'
    )
    .addEventListener(
      'click',
      () => {

        document
          .getElementById(
            'fileInput'
          )
          .click();
      }
    );


  // -----------------------------------------------
  // Выбор файла
  // -----------------------------------------------

  document
    .getElementById(
      'fileInput'
    )
    .addEventListener(
      'change',
      async e => {

        const file =
          e.target.files[0];

        if (!file) {
          return;
        }


        const hint =
          document.getElementById(
            'editorHint'
          );

        hint.textContent =
          'Обрабатываем изображение…';


        try {

          const dataUrl =
            await compressImageFile(
              file
            );


          d.blocks.push({
            type: 'image',
            src: dataUrl,
            caption: '',
            _pendingFile: true
          });


          renderBlocks();

        } catch (err) {

          console.error(
            'Image processing error:',
            err
          );

          showToast(
            'Не удалось обработать изображение'
          );
        }


        hint.textContent = '';

        e.target.value = '';
      }
    );


  // -----------------------------------------------
  // Сохранить / опубликовать
  // -----------------------------------------------

  document
    .getElementById(
      'publishBtn'
    )
    .addEventListener(
      'click',
      publishDraft
    );


  renderBlocks();
}


// =========================================================
// Отрисовка блоков
// =========================================================

function renderBlocks() {

  const host =
    document.getElementById(
      'blocksHost'
    );

  if (!host) {
    return;
  }

  const d =
    state.draft;


  host.innerHTML =
    d.blocks
      .map((block, i) => {

        // -------------------------------------------
        // Текст
        // -------------------------------------------

        if (
          block.type === 'text'
        ) {

          return `
            <div
              class="block"
              data-i="${i}"
            >

              <button
                class="block-remove"
                data-act="del"
                data-i="${i}"
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
                  block.html || ''
                )}
              </div>

            </div>
          `;
        }


        // -------------------------------------------
        // Картинка
        // -------------------------------------------

        if (
          block.type === 'image'
        ) {

          return `
            <div
              class="block block-image-wrap"
              data-i="${i}"
            >

              <button
                class="block-remove"
                data-act="del"
                data-i="${i}"
              >
                ✕
              </button>


              <img
                src="${escapeHtml(
                  block.src || ''
                )}"
                alt=""
              >


              <input
                class="block-caption"
                data-i="${i}"
                placeholder="Подпись (необязательно)"
                value="${escapeHtml(
                  block.caption || ''
                )}"
              >

            </div>
          `;
        }


        return '';
      })
      .join('');


  // -----------------------------------------------
  // Текстовые блоки
  // -----------------------------------------------

  host
    .querySelectorAll(
      '.block-text'
    )
    .forEach(el => {

      el.addEventListener(
        'focus',
        () => {

          activeBlockEl =
            el;
        }
      );


      el.addEventListener(
        'input',
        e => {

          const index =
            Number(
              e.target.dataset.i
            );

          d.blocks[index].html =
            sanitizeHtml(
              e.target.innerHTML
            );
        }
      );
    });


  // -----------------------------------------------
  // Подписи картинок
  // -----------------------------------------------

  host
    .querySelectorAll(
      '.block-caption'
    )
    .forEach(el => {

      el.addEventListener(
        'input',
        e => {

          const index =
            Number(
              e.target.dataset.i
            );

          d.blocks[index].caption =
            e.target.value;
        }
      );
    });


  // -----------------------------------------------
  // Удаление блока
  // -----------------------------------------------

  host
    .querySelectorAll(
      '[data-act="del"]'
    )
    .forEach(el => {

      el.addEventListener(
        'click',
        () => {

          const index =
            Number(
              el.dataset.i
            );

          d.blocks.splice(
            index,
            1
          );

          if (
            !d.blocks.length
          ) {

            d.blocks.push({
              type: 'text',
              html: ''
            });
          }

          renderBlocks();
        }
      );
    });
}


// =========================================================
// Публикация / сохранение
// =========================================================

async function publishDraft() {

  const d =
    state.draft;


  const hasContent =
    Boolean(
      d.title.trim()
    ) ||
    d.blocks.some(
      block => {

        if (
          block.type === 'text'
        ) {

          return (
            block.html
              .replace(
                /<[^>]+>/g,
                ''
              )
              .trim()
              .length > 0
          );
        }

        return (
          block.type === 'image'
        );
      }
    );


  if (!hasContent) {

    showToast(
      'Добавьте заголовок или содержимое'
    );

    return;
  }


  const hint =
    document.getElementById(
      'editorHint'
    );

  const button =
    document.getElementById(
      'publishBtn'
    );


  if (button) {
    button.disabled = true;
  }


  hint.textContent =
    d.id
      ? 'Сохраняем изменения…'
      : 'Публикуем…';


  try {

    // ---------------------------------------------
    // Проверяем / создаём профиль
    // ---------------------------------------------

    const profile =
      await ensureProfile();

    if (!profile) {
      throw new Error(
        'Не удалось получить профиль автора'
      );
    }


    // ---------------------------------------------
    // Загружаем новые картинки
    // ---------------------------------------------

    for (
      const block of d.blocks
    ) {

      if (
        block.type === 'image' &&
        block._pendingFile
      ) {

        const url =
          await uploadImage(
            block.src,
            'image.jpg'
          );

        block.src =
          url;

        delete block._pendingFile;
      }
    }


    // ---------------------------------------------
    // Excerpt
    // ---------------------------------------------

    const firstText =
      d.blocks.find(
        block =>
          block.type === 'text' &&
          block.html &&
          block.html.trim()
      );


    const excerpt =
      firstText
        ? firstText.html
            .replace(
              /<[^>]+>/g,
              ''
            )
            .trim()
            .slice(0, 140)
        : '';


    // ---------------------------------------------
    // Cover
    // ---------------------------------------------

    const firstImage =
      d.blocks.find(
        block =>
          block.type === 'image'
      );


    // ---------------------------------------------
    // Payload
    // ---------------------------------------------

    const payload = {

      title:
        d.title.trim() ||
        'Без названия',

      excerpt,

      cover:
        firstImage
          ? firstImage.src
          : null,

      blocks:
        d.blocks
    };


    // ---------------------------------------------
    // CREATE
    // ---------------------------------------------

    if (!d.id) {

      const saved =
        await createArticle(
          payload
        );

      showToast(
        'Опубликовано'
      );

      await openReader(
        saved.id
      );

      return;
    }


    // ---------------------------------------------
    // UPDATE
    // ---------------------------------------------

    const saved =
      await updateArticle({

        id:
          d.id,

        ...payload
      });


    showToast(
      'Изменения сохранены'
    );


    await openReader(
      saved.id
    );


  } catch (err) {

    console.error(
      'Publish/update error:',
      err
    );


    hint.textContent = '';


    showToast(
      'Ошибка: ' +
      (
        err.message ||
        'см. консоль'
      )
    );


  } finally {

    if (button) {
      button.disabled = false;
    }

    if (
      hint &&
      state.view === 'editor'
    ) {
      hint.textContent = '';
    }
  }
}


// =========================================================
// Telegram Back Button
// =========================================================
// В старых версиях Telegram BackButton может отсутствовать.
// Поэтому проверяем его наличие перед использованием.
// =========================================================

function setBackButton(
  show,
  onClick
) {

  if (!tg) {
    return;
  }


  if (
    !tg.BackButton ||
    typeof tg.BackButton.show !== 'function'
  ) {
    return;
  }


  try {

    if (
      setBackButton._last &&
      typeof tg.BackButton.offClick === 'function'
    ) {

      tg.BackButton.offClick(
        setBackButton._last
      );
    }


    if (show) {

      tg.BackButton.show();

      if (
        typeof tg.BackButton.onClick === 'function'
      ) {

        tg.BackButton.onClick(
          onClick
        );

        setBackButton._last =
          onClick;
      }

    } else {

      tg.BackButton.hide();

      setBackButton._last =
        null;
    }

  } catch (err) {

    console.warn(
      'Telegram BackButton unavailable:',
      err
    );
  }
}


// =========================================================
// Навигация
// =========================================================

const homeLink =
  document.getElementById(
    'homeLink'
  );

if (homeLink) {

  homeLink.addEventListener(
    'click',
    renderFeed
  );
}


const newArticleBtn =
  document.getElementById(
    'newArticleBtn'
  );

if (newArticleBtn) {

  newArticleBtn.addEventListener(
    'click',
    async () => {

      try {

        // Проверяем, что Telegram
        // действительно передал пользователя.
        if (!tg || !tg.initData) {

          showToast(
            'Откройте приложение внутри Telegram'
          );

          return;
        }


        // Проверяем профиль заранее.
        await ensureProfile();

        openEditor();

      } catch (err) {

        console.error(
          'Open editor error:',
          err
        );

        showToast(
          err.message ||
          'Не удалось открыть редактор'
        );
      }
    }
  );
}


// =========================================================
// Инициализация
// =========================================================

(async function init() {

  try {

    const startParam =
      tg &&
      tg.initDataUnsafe
        ? tg.initDataUnsafe.start_param
        : null;


    if (startParam) {

      await openReader(
        startParam
      );

    } else {

      await renderFeed();
    }

  } catch (err) {

    console.error(
      'Initialization error:',
      err
    );

    showToast(
      'Ошибка запуска приложения'
    );
  }

})();
