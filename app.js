// =========================================================
// Летопись — Telegram Mini App
// =========================================================

const BOT_USERNAME = 'lcftype_bot';
const MINIAPP_SHORT_NAME = 'lcftype';


// =========================================================
// Supabase
// =========================================================

const db =
  window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );


// =========================================================
// Telegram
// =========================================================

const tg =
  window.Telegram
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


// =========================================================
// State
// =========================================================

const state = {
  view: 'feed',
  articles: [],
  draft: null,
  currentId: null,
  profile: null
};

let activeBlockEl = null;


// =========================================================
// Toast
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
// Date
// =========================================================

function fmtDate(iso) {
  if (!iso) {
    return '';
  }

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
// Escape HTML
// =========================================================

function escapeHtml(s) {
  const d = document.createElement('div');

  d.textContent = s || '';

  return d.innerHTML;
}


// =========================================================
// Sanitize HTML
// =========================================================

const ALLOWED_TAGS =
  new Set([
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
  const doc =
    document.createElement('div');

  doc.innerHTML = html || '';

  (function clean(node) {
    [
      ...node.childNodes
    ].forEach(child => {

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

        [
          ...child.attributes
        ].forEach(attr => {
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
// Edge Function
// =========================================================

async function callTelegramApi(
  action,
  extra = {}
) {
  if (!tg || !tg.initData) {
    throw new Error(
      'Откройте приложение внутри Telegram'
    );
  }

  const {
    data,
    error
  } =
    await db.functions.invoke(
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
      'telegram-api:',
      error
    );

    throw new Error(
      error.message ||
      'Ошибка Edge Function'
    );
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return data;
}


// =========================================================
// Profile
// =========================================================

async function getProfile() {
  const result =
    await callTelegramApi(
      'get-profile'
    );

  state.profile =
    result.profile || null;

  return state.profile;
}


async function saveProfile(username) {
  const result =
    await callTelegramApi(
      'set-profile',
      {
        username
      }
    );

  state.profile =
    result.profile;

  return state.profile;
}


async function ensureProfile(
  askIfMissing = true
) {
  const existing =
    await getProfile();

  if (existing) {
    return existing;
  }

  if (!askIfMissing) {
    return null;
  }

  return openUsernameDialog(null);
}


// =========================================================
// Диалог ника
// =========================================================

function openUsernameDialog(
  currentUsername
) {
  return new Promise(resolve => {

    const overlay =
      document.createElement('div');

    overlay.className =
      'profile-overlay';

    overlay.innerHTML = `

      <div class="profile-dialog">

        <div class="profile-dialog-title">
          ${
            currentUsername
              ? 'Изменить ник'
              : 'Создать профиль'
          }
        </div>

        <div class="profile-dialog-text">
          Придумайте имя автора.
          Его будут видеть рядом
          с вашими статьями.
        </div>

        <input
          class="profile-input"
          id="profileUsernameInput"
          maxlength="30"
          placeholder="Например: Анна"
          value="${
            escapeHtml(
              currentUsername || ''
            )
          }"
        >

        <div class="profile-hint">
          Можно использовать русские
          и латинские буквы, цифры,
          пробел и _
        </div>

        <div class="profile-dialog-actions">

          <button
            class="btn btn-secondary"
            id="profileCancelBtn"
          >
            Отмена
          </button>

          <button
            class="btn btn-primary"
            id="profileSaveBtn"
          >
            Сохранить
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const input =
      overlay.querySelector(
        '#profileUsernameInput'
      );

    const saveBtn =
      overlay.querySelector(
        '#profileSaveBtn'
      );

    const cancelBtn =
      overlay.querySelector(
        '#profileCancelBtn'
      );

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    cancelBtn.addEventListener(
      'click',
      () => {
        overlay.remove();
        resolve(null);
      }
    );

    saveBtn.addEventListener(
      'click',
      async () => {

        const username =
          input.value
            .trim()
            .replace(/\s+/g, ' ');

        if (username.length < 2) {
          showToast(
            'Минимум 2 символа'
          );
          return;
        }

        if (username.length > 30) {
          showToast(
            'Максимум 30 символов'
          );
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent =
          'Сохраняем…';

        try {

          const profile =
            await saveProfile(
              username
            );

          overlay.remove();

          showToast(
            'Ник сохранён'
          );

          resolve(profile);

        } catch (err) {

          console.error(err);

          showToast(
            err.message ||
            'Не удалось сохранить ник'
          );

          saveBtn.disabled = false;
          saveBtn.textContent =
            'Сохранить';
        }
      }
    );

    input.addEventListener(
      'keydown',
      e => {

        if (e.key === 'Enter') {
          saveBtn.click();
        }

        if (e.key === 'Escape') {
          cancelBtn.click();
        }
      }
    );
  });
}


// =========================================================
// Profile screen
// =========================================================

async function openProfile() {
  state.view = 'profile';
  state.currentId = null;

  setBackButton(
    true,
    renderFeed
  );

  const main =
    document.getElementById('main');

  main.innerHTML =
    '<div class="loading">Загрузка профиля…</div>';

  try {

    const profile =
      await ensureProfile(false);

    if (!profile) {

      main.innerHTML = `

        <div class="profile-page">

          <div class="profile-card chrome">

            <div class="profile-avatar">
              ?
            </div>

            <h2>
              Профиль
            </h2>

            <p>
              У вас пока нет ника
            </p>

            <button
              class="btn btn-primary"
              id="createProfileBtn"
            >
              Придумать ник
            </button>

          </div>

        </div>
      `;

      document
        .getElementById(
          'createProfileBtn'
        )
        .addEventListener(
          'click',
          async () => {

            const created =
              await ensureProfile(true);

            if (created) {
              openProfile();
            }
          }
        );

      return;
    }

    const firstChar =
      profile.username
        .trim()
        .charAt(0)
        .toUpperCase();

    main.innerHTML = `

      <div class="profile-page">

        <div class="profile-card chrome">

          <div class="profile-avatar">
            ${escapeHtml(
              firstChar || '?'
            )}
          </div>

          <div class="profile-label">
            Ваш ник
          </div>

          <div class="profile-username">
            ${escapeHtml(
              profile.username
            )}
          </div>

          <button
            class="btn btn-primary profile-edit-btn"
            id="changeUsernameBtn"
          >
            Изменить ник
          </button>

          <div class="profile-description">
            Этот ник отображается
            рядом с вашими статьями.
          </div>

        </div>

      </div>
    `;

    document
      .getElementById(
        'changeUsernameBtn'
      )
      .addEventListener(
        'click',
        async () => {

          const changed =
            await openUsernameDialog(
              profile.username
            );

          if (changed) {
            openProfile();
          }
        }
      );

  } catch (err) {

    console.error(err);

    main.innerHTML = `

      <div class="empty-state">

        <h2>
          Не удалось открыть профиль
        </h2>

        <p>
          ${
            escapeHtml(
              err.message || ''
            )
          }
        </p>

      </div>
    `;
  }
}


// =========================================================
// Feed
// =========================================================

async function fetchFeed() {
  const {
    data,
    error
  } =
    await db
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
  } =
    await db
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
// Upload image
// =========================================================

async function uploadImage(
  dataUrl,
  filename
) {
  const res =
    await fetch(dataUrl);

  const blob =
    await res.blob();

  const safeFilename =
    String(filename || 'image.jpg')
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );

  const path =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeFilename}`;

  const {
    error
  } =
    await db
      .storage
      .from('images')
      .upload(
        path,
        blob,
        {
          contentType:
            blob.type ||
            'image/jpeg',
          upsert: false
        }
      );

  if (error) {
    throw error;
  }

  const {
    data
  } =
    db
      .storage
      .from('images')
      .getPublicUrl(path);

  return data.publicUrl;
}


// =========================================================
// Compress image
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
                h *
                (maxW / w)
              );

            w = maxW;
          }

          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width = w;
          canvas.height = h;

          canvas
            .getContext('2d')
            .drawImage(
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

        img.src =
          e.target.result;
      };

      reader.onerror = reject;

      reader.readAsDataURL(file);
    }
  );
}


// =========================================================
// Is owner
// =========================================================

function isArticleOwner(article) {
  if (
    !tgUser ||
    !article ||
    !article.author_id
  ) {
    return false;
  }

  return (
    Number(article.author_id) ===
    Number(tgUser.id)
  );
}


// =========================================================
// Feed screen
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

        <h2>
          Здесь пока пусто
        </h2>

        <p>
          Нажмите «+ Статья»,
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
          data-id="${escapeHtml(
            article.id
          )}"
        >

          ${
            article.cover
              ? `
                <img
                  class="thumb"
                  src="${escapeHtml(
                    article.cover
                  )}"
                  alt=""
                >
              `
              : ''
          }

          <div class="feed-meta">

            ${fmtDate(
              article.created_at
            )}

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
// Reader
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

        <h2>
          Статья не найдена
        </h2>

        <p>
          Возможно, её удалили.
        </p>

      </div>
    `;

    return;
  }

  /*
   * ВАЖНО:
   * article.cover здесь НЕ выводится.
   * Обложка существует только для главной
   * страницы и редактора автора.
   */

  const bodyHtml =
    (
      article.blocks || []
    )
      .map(block => {

        if (
          block.type === 'text'
        ) {

          return (
            block.html &&
            block.html.trim()
          )
            ? `
              <p>
                ${sanitizeHtml(
                  block.html
                )}
              </p>
            `
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

  const shareUrl =
    `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=${article.id}`;

  const owner =
    isArticleOwner(article);

  main.innerHTML = `

    <div class="reader">

      <div class="reader-meta reader-meta-row">

        <span>

          ${fmtDate(
            article.created_at
          )}

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

        ${
          owner
            ? `
              <div class="article-owner-actions">

                <button
                  class="btn btn-secondary"
                  id="editBtn"
                >
                  Редактировать
                </button>

                <button
                  class="btn btn-danger"
                  id="deleteBtn"
                >
                  Удалить
                </button>

              </div>
            `
            : ''
        }

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
            <p class="reader-empty">
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
        >
          Отправить ссылку в чат
        </button>

      </div>

    </div>
  `;


  // =======================================================
  // Share
  // =======================================================

  document
    .getElementById('shareBtn')
    .addEventListener(
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

          if (navigator.share) {

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
            .writeText(shareUrl);

          showToast(
            'Ссылка скопирована'
          );

        } catch (err) {
          console.error(err);
        }
      }
    );


  // =======================================================
  // Edit / Delete
  // =======================================================

  if (owner) {

    document
      .getElementById('editBtn')
      .addEventListener(
        'click',
        () => {
          editArticle(article);
        }
      );

    document
      .getElementById('deleteBtn')
      .addEventListener(
        'click',
        async () => {

          if (
            !confirm(
              'Удалить статью безвозвратно?'
            )
          ) {
            return;
          }

          const btn =
            document.getElementById(
              'deleteBtn'
            );

          btn.disabled = true;
          btn.textContent =
            'Удаляем…';

          try {

            await callTelegramApi(
              'delete-article',
              {
                articleId:
                  article.id
              }
            );

            showToast(
              'Статья удалена'
            );

            await renderFeed();

          } catch (err) {

            console.error(err);

            btn.disabled = false;
            btn.textContent =
              'Удалить';

            showToast(
              err.message ||
              'Не удалось удалить статью'
            );
          }
        }
      );
  }
}


// =========================================================
// New draft
// =========================================================

function newDraft() {
  return {

    id: null,

    title: '',

    /*
     * Обложка теперь отдельное свойство.
     * Она НЕ является блоком статьи.
     */
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
// New editor
// =========================================================

async function openEditor() {

  try {

    if (
      !tg ||
      !tg.initData
    ) {

      showToast(
        'Откройте приложение внутри Telegram'
      );

      return;
    }

    const profile =
      await ensureProfile(true);

    if (!profile) {
      return;
    }

    state.view = 'editor';
    state.currentId = null;
    state.draft = newDraft();

    setBackButton(
      true,
      () => {

        if (
          confirm(
            'Отменить редактирование? Черновик будет потерян.'
          )
        ) {
          renderFeed();
        }
      }
    );

    renderEditor();

  } catch (err) {

    console.error(err);

    showToast(
      err.message ||
      'Не удалось открыть редактор'
    );
  }
}


// =========================================================
// Edit article
// =========================================================

function editArticle(article) {

  if (
    !isArticleOwner(article)
  ) {

    showToast(
      'Вы не являетесь автором этой статьи'
    );

    return;
  }

  state.view = 'editor';
  state.currentId = article.id;

  state.draft = {

    id:
      article.id,

    title:
      article.title || '',

    /*
     * Загружаем существующую обложку
     * отдельно от блоков.
     */
    cover:
      article.cover || null,

    blocks:
      JSON.parse(
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

      if (
        confirm(
          'Отменить редактирование? Изменения будут потеряны.'
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
// Editor
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


    <!-- ===============================================
         COVER
         =============================================== -->

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
            Она будет видна на главной,
            но не внутри статьи.
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


    <div
      id="blocksHost"
    ></div>


    <div class="add-row">

      <button
        class="add-btn"
        id="addTextBtn"
        type="button"
      >
        ＋ Текст
      </button>

      <button
        class="add-btn"
        id="addImageBtn"
        type="button"
      >
        ＋ Картинка
      </button>

    </div>


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


    <!-- Обложка -->
    <input
      type="file"
      accept="image/*"
      id="coverInput"
      style="display:none"
    >


    <!-- Обычные картинки -->
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

  `;


  // =======================================================
  // Title
  // =======================================================

  document
    .getElementById('titleInput')
    .addEventListener(
      'input',
      e => {
        d.title =
          e.target.value;
      }
    );


  // =======================================================
  // Toolbar
  // =======================================================

  document
    .getElementById('toolbar')
    .querySelectorAll('button')
    .forEach(btn => {

      btn.addEventListener(
        'mousedown',
        e => {

          e.preventDefault();

          if (!activeBlockEl) {
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


  // =======================================================
  // Cover buttons
  // =======================================================

  const addCoverBtn =
    document.getElementById(
      'addCoverBtn'
    );

  if (addCoverBtn) {

    addCoverBtn.addEventListener(
      'click',
      () => {

        document
          .getElementById('coverInput')
          .click();
      }
    );
  }


  const changeCoverBtn =
    document.getElementById(
      'changeCoverBtn'
    );

  if (changeCoverBtn) {

    changeCoverBtn.addEventListener(
      'click',
      () => {

        document
          .getElementById('coverInput')
          .click();
      }
    );
  }


  const removeCoverBtn =
    document.getElementById(
      'removeCoverBtn'
    );

  if (removeCoverBtn) {

    removeCoverBtn.addEventListener(
      'click',
      () => {

        d.cover = null;

        renderEditor();

        showToast(
          'Обложка убрана'
        );
      }
    );
  }


  // =======================================================
  // Cover file
  // =======================================================

  document
    .getElementById('coverInput')
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
          'Обрабатываем обложку…';

        try {

          const dataUrl =
            await compressImageFile(
              file,
              1600,
              0.84
            );

          d.cover = dataUrl;

          renderEditor();

        } catch (err) {

          console.error(err);

          showToast(
            'Не удалось обработать обложку'
          );
        }

        hint.textContent = '';

        e.target.value = '';
      }
    );


  // =======================================================
  // Add text
  // =======================================================

  document
    .getElementById('addTextBtn')
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


  // =======================================================
  // Add image
  // =======================================================

  document
    .getElementById('addImageBtn')
    .addEventListener(
      'click',
      () => {

        document
          .getElementById('fileInput')
          .click();
      }
    );


  // =======================================================
  // Image files — MULTIPLE
  // =======================================================

  document
    .getElementById('fileInput')
    .addEventListener(
      'change',
      async e => {

        const files =
          Array.from(
            e.target.files || []
          );

        if (!files.length) {
          return;
        }

        const hint =
          document.getElementById(
            'editorHint'
          );

        const addImageBtn =
          document.getElementById(
            'addImageBtn'
          );

        addImageBtn.disabled = true;

        hint.textContent =
          files.length === 1
            ? 'Обрабатываем изображение…'
            : `Обрабатываем ${files.length} изображений…`;

        try {

          for (
            const file
            of files
          ) {

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
          }

          renderBlocks();

        } catch (err) {

          console.error(err);

          showToast(
            'Не удалось обработать одно из изображений'
          );
        }

        hint.textContent = '';

        addImageBtn.disabled = false;

        e.target.value = '';
      }
    );


  // =======================================================
  // Publish
  // =======================================================

  document
    .getElementById('publishBtn')
    .addEventListener(
      'click',
      publishDraft
    );


  renderBlocks();
}


// =========================================================
// Blocks
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
      .map((b, i) => {

        if (
          b.type === 'text'
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

            </div>
          `;
        }


        if (
          b.type === 'image'
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

            </div>
          `;
        }

        return '';
      })
      .join('');


  // =======================================================
  // Text
  // =======================================================

  host
    .querySelectorAll('.block-text')
    .forEach(el => {

      el.addEventListener(
        'focus',
        () => {
          activeBlockEl = el;
        }
      );

      el.addEventListener(
        'input',
        e => {

          d.blocks[
            +e.target.dataset.i
          ].html =
            sanitizeHtml(
              e.target.innerHTML
            );
        }
      );
    });


  // =======================================================
  // Captions
  // =======================================================

  host
    .querySelectorAll('.block-caption')
    .forEach(el => {

      el.addEventListener(
        'input',
        e => {

          d.blocks[
            +e.target.dataset.i
          ].caption =
            e.target.value;
        }
      );
    });


  // =======================================================
  // Delete block
  // =======================================================

  host
    .querySelectorAll(
      '[data-act="del"]'
    )
    .forEach(el => {

      el.addEventListener(
        'click',
        () => {

          d.blocks.splice(
            +el.dataset.i,
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
// Publish / Update
// =========================================================

async function publishDraft() {

  const d =
    state.draft;

  const hasContent =
    Boolean(
      d.title.trim()
    ) ||
    Boolean(d.cover) ||
    d.blocks.some(b => {

      if (
        b.type === 'text'
      ) {

        return (
          b.html
            .replace(
              /<[^>]+>/g,
              ''
            )
            .trim()
            .length > 0
        );
      }

      return (
        b.type === 'image'
      );
    });


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

  button.disabled = true;

  hint.textContent =
    d.id
      ? 'Сохраняем изменения…'
      : 'Публикуем…';


  try {

    // =====================================================
    // Profile
    // =====================================================

    const profile =
      await ensureProfile(true);

    if (!profile) {
      throw new Error(
        'Необходимо указать ник'
      );
    }


    // =====================================================
    // Upload cover
    // =====================================================

    let finalCover =
      d.cover || null;

    /*
     * Если обложка ещё является data URL,
     * загружаем её в Supabase Storage.
     *
     * Если это уже URL — оставляем как есть.
     */

    if (
      finalCover &&
      finalCover.startsWith('data:')
    ) {

      finalCover =
        await uploadImage(
          finalCover,
          'cover.jpg'
        );
    }


    // =====================================================
    // Upload article images
    // =====================================================

    for (
      const block
      of d.blocks
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

        block.src = url;

        delete block._pendingFile;
      }
    }


    // =====================================================
    // Excerpt
    // =====================================================

    const firstText =
      d.blocks.find(
        b =>
          b.type === 'text' &&
          b.html &&
          b.html.trim()
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


    // =====================================================
    // Payload
    // =====================================================

    const payload = {

      title:
        d.title.trim() ||
        'Без названия',

      excerpt,

      /*
       * Обложка хранится отдельно.
       */
      cover:
        finalCover,

      /*
       * В blocks НИКОГДА не попадает cover.
       */
      blocks:
        d.blocks
    };


    // =====================================================
    // CREATE
    // =====================================================

    if (!d.id) {

      const result =
        await callTelegramApi(
          'create-article',
          {
            article:
              payload
          }
        );

      showToast(
        'Опубликовано'
      );

      await openReader(
        result.article.id
      );

      return;
    }


    // =====================================================
    // UPDATE
    // =====================================================

    const result =
      await callTelegramApi(
        'update-article',
        {
          article: {

            id:
              d.id,

            ...payload
          }
        }
      );

    showToast(
      'Изменения сохранены'
    );

    await openReader(
      result.article.id
    );

  } catch (err) {

    console.error(err);

    showToast(
      err.message ||
      'Ошибка публикации'
    );

    hint.textContent = '';

  } finally {

    button.disabled = false;
  }
}


// =========================================================
// Telegram Back Button
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
    typeof tg.BackButton.show !==
      'function'
  ) {
    return;
  }

  try {

    if (
      setBackButton._last &&
      typeof tg.BackButton.offClick ===
        'function'
    ) {

      tg.BackButton.offClick(
        setBackButton._last
      );
    }

    if (show) {

      tg.BackButton.show();

      if (
        typeof tg.BackButton.onClick ===
          'function'
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
      'BackButton:',
      err
    );
  }
}


// =========================================================
// Navigation
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
    openEditor
  );
}


const profileBtn =
  document.getElementById(
    'profileBtn'
  );

if (profileBtn) {

  profileBtn.addEventListener(
    'click',
    openProfile
  );
}


// =========================================================
// Init
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
      'Init:',
      err
    );

    showToast(
      'Ошибка запуска приложения'
    );
  }

})();
