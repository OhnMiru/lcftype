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

  profile: null,

  searchQuery: '',

  selectedAuthors: [],

  filterOpen: false
};

let activeBlockEl = null;


// =========================================================
// Toast
// =========================================================

function showToast(msg) {

  const t =
    document.getElementById('toast');

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

  const d =
    document.createElement('div');

  d.textContent =
    s || '';

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

  doc.innerHTML =
    html || '';

  (function clean(node) {

    [
      ...node.childNodes
    ].forEach(child => {

      if (child.nodeType === 1) {

        if (
          !ALLOWED_TAGS.has(
            child.tagName
          )
        ) {

          const parent =
            child.parentNode;

          while (child.firstChild) {

            parent.insertBefore(
              child.firstChild,
              child
            );
          }

          parent.removeChild(
            child
          );

          return;
        }

        [
          ...child.attributes
        ].forEach(attr => {

          child.removeAttribute(
            attr.name
          );
        });

        clean(child);

      } else if (
        child.nodeType !== 3
      ) {

        child.parentNode.removeChild(
          child
        );
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

  if (
    !tg ||
    !tg.initData
  ) {

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

  if (
    data &&
    data.error
  ) {

    throw new Error(
      data.error
    );
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
// Username dialog
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
          value="${escapeHtml(
            currentUsername || ''
          )}"
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

    document.body.appendChild(
      overlay
    );

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

        if (
          username.length < 2
        ) {

          showToast(
            'Минимум 2 символа'
          );

          return;
        }

        if (
          username.length > 30
        ) {

          showToast(
            'Максимум 30 символов'
          );

          return;
        }

        saveBtn.disabled =
          true;

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

          saveBtn.disabled =
            false;

          saveBtn.textContent =
            'Сохранить';
        }
      }
    );

    input.addEventListener(
      'keydown',
      e => {

        if (
          e.key === 'Enter'
        ) {

          saveBtn.click();
        }

        if (
          e.key === 'Escape'
        ) {

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

  state.view =
    'profile';

  state.currentId =
    null;

  setBackButton(
    true,
    renderFeed
  );

  const main =
    document.getElementById(
      'main'
    );

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
          ${escapeHtml(
            err.message || ''
          )}
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
// Feed search/filter UI
// =========================================================

function ensureFeedControls() {

  const mainNavigation =
    document.querySelector(
      '.main-navigation'
    );

  if (!mainNavigation) {
    return;
  }

  /*
   * ВАЖНО:
   * Не создаём кнопку + Статья.
   * Она уже существует в HTML:
   * #newArticleBtn
   */

  let controls =
    document.getElementById(
      'feedControls'
    );

  if (!controls) {

    controls =
      document.createElement(
        'div'
      );

    controls.id =
      'feedControls';

    controls.className =
      'feed-controls';

    /*
     * Вставляем controls ПЕРЕД
     * существующей кнопкой + Статья.
     */

    const newArticleBtn =
      document.getElementById(
        'newArticleBtn'
      );

    if (
      newArticleBtn &&
      newArticleBtn.parentNode ===
        mainNavigation
    ) {

      mainNavigation.insertBefore(
        controls,
        newArticleBtn
      );

    } else {

      mainNavigation.appendChild(
        controls
      );
    }

    controls.innerHTML = `

      <button
        class="feed-tool-btn"
        id="searchToggleBtn"
        type="button"
        aria-label="Поиск"
        title="Поиск"
      >
        <span class="feed-tool-icon">⌕</span>
      </button>

      <button
        class="feed-tool-btn"
        id="filterToggleBtn"
        type="button"
        aria-label="Фильтр по авторам"
        title="Фильтр по авторам"
      >
        <span class="feed-tool-icon">☷</span>
        <span
          class="filter-count"
          id="filterCount"
        ></span>
      </button>

      <div
        class="search-panel"
        id="searchPanel"
      >

        <input
          type="search"
          id="articleSearchInput"
          placeholder="Поиск по названию…"
          autocomplete="off"
          enterkeyhint="search"
        >

        <button
          class="search-clear-btn"
          id="searchClearBtn"
          type="button"
          aria-label="Очистить поиск"
        >
          ×
        </button>

      </div>

      <div
        class="author-filter-panel"
        id="authorFilterPanel"
      >

        <div class="filter-panel-header">

          <span>
            Авторы
          </span>

          <button
            type="button"
            id="clearAuthorsBtn"
          >
            Сбросить
          </button>

        </div>

        <div
          class="author-filter-list"
          id="authorFilterList"
        ></div>

      </div>
    `;

    bindFeedControls();
  }

  updateFeedControls();
}


function bindFeedControls() {

  const searchToggleBtn =
    document.getElementById(
      'searchToggleBtn'
    );

  const filterToggleBtn =
    document.getElementById(
      'filterToggleBtn'
    );

  const searchInput =
    document.getElementById(
      'articleSearchInput'
    );

  const searchClearBtn =
    document.getElementById(
      'searchClearBtn'
    );

  const clearAuthorsBtn =
    document.getElementById(
      'clearAuthorsBtn'
    );

  if (
    searchToggleBtn
  ) {

    searchToggleBtn.addEventListener(
      'click',
      () => {

        const controls =
          document.getElementById(
            'feedControls'
          );

        if (!controls) {
          return;
        }

        controls.classList.toggle(
          'search-open'
        );

        if (
          controls.classList.contains(
            'search-open'
          )
        ) {

          requestAnimationFrame(
            () => {

              searchInput.focus();
            }
          );
        }
      }
    );
  }


  if (
    filterToggleBtn
  ) {

    filterToggleBtn.addEventListener(
      'click',
      () => {

        const controls =
          document.getElementById(
            'feedControls'
          );

        if (!controls) {
          return;
        }

        controls.classList.toggle(
          'filter-open'
        );
      }
    );
  }


  if (
    searchInput
  ) {

    searchInput.addEventListener(
      'input',
      e => {

        state.searchQuery =
          e.target.value;

        updateFeedResults();
        updateFeedControls();
      }
    );
  }


  if (
    searchClearBtn
  ) {

    searchClearBtn.addEventListener(
      'click',
      () => {

        state.searchQuery =
          '';

        if (searchInput) {
          searchInput.value =
            '';
        }

        updateFeedResults();
        updateFeedControls();

        if (searchInput) {
          searchInput.focus();
        }
      }
    );
  }


  if (
    clearAuthorsBtn
  ) {

    clearAuthorsBtn.addEventListener(
      'click',
      () => {

        state.selectedAuthors =
          [];

        updateAuthorFilterList();

        updateFeedResults();

        updateFeedControls();
      }
    );
  }
}


// =========================================================
// Authors
// =========================================================

function getAvailableAuthors() {

  const map =
    new Map();

  state.articles.forEach(
    article => {

      const name =
        String(
          article.author_name ||
          ''
        ).trim();

      if (!name) {
        return;
      }

      const key =
        name.toLocaleLowerCase(
          'ru-RU'
        );

      if (!map.has(key)) {

        map.set(
          key,
          name
        );
      }
    }
  );

  return Array
    .from(map.entries())
    .sort(
      (a, b) =>
        a[1].localeCompare(
          b[1],
          'ru',
          {
            sensitivity:
              'base'
          }
        )
    )
    .map(
      entry => entry[1]
    );
}


// =========================================================
// Author filter list
// =========================================================

function updateAuthorFilterList() {

  const list =
    document.getElementById(
      'authorFilterList'
    );

  if (!list) {
    return;
  }

  const authors =
    getAvailableAuthors();

  /*
   * Если автор исчез из текущего набора,
   * удаляем его из выбранных.
   */

  state.selectedAuthors =
    state.selectedAuthors.filter(
      selected =>
        authors.some(
          author =>
            author === selected
        )
    );

  if (!authors.length) {

    list.innerHTML = `
      <div class="author-filter-empty">
        Пока нет статей с указанным автором
      </div>
    `;

    return;
  }

  list.innerHTML =
    authors
      .map(author => {

        const checked =
          state.selectedAuthors.includes(
            author
          );

        return `

          <label
            class="author-filter-option"
          >

            <input
              type="checkbox"
              value="${escapeHtml(
                author
              )}"
              ${checked ? 'checked' : ''}
            >

            <span class="author-filter-check">
              ${checked ? '✓' : ''}
            </span>

            <span class="author-filter-name">
              ${escapeHtml(
                author
              )}
            </span>

          </label>
        `;
      })
      .join('');

  list
    .querySelectorAll(
      'input[type="checkbox"]'
    )
    .forEach(input => {

      input.addEventListener(
        'change',
        () => {

          const author =
            input.value;

          if (
            input.checked
          ) {

            if (
              !state.selectedAuthors.includes(
                author
              )
            ) {

              state.selectedAuthors.push(
                author
              );
            }

          } else {

            state.selectedAuthors =
              state.selectedAuthors.filter(
                item =>
                  item !== author
              );
          }

          updateAuthorFilterList();

          updateFeedResults();

          updateFeedControls();
        }
      );
    });
}


// =========================================================
// Feed controls state
// =========================================================

function updateFeedControls() {

  const controls =
    document.getElementById(
      'feedControls'
    );

  if (!controls) {
    return;
  }

  const count =
    document.getElementById(
      'filterCount'
    );

  if (count) {

    if (
      state.selectedAuthors.length
    ) {

      count.textContent =
        state.selectedAuthors.length;

      count.classList.add(
        'visible'
      );

    } else {

      count.textContent =
        '';

      count.classList.remove(
        'visible'
      );
    }
  }

  const clear =
    document.getElementById(
      'searchClearBtn'
    );

  if (clear) {

    clear.classList.toggle(
      'visible',
      Boolean(
        state.searchQuery
      )
    );
  }
}


// =========================================================
// Filter articles
// =========================================================

function getFilteredArticles() {

  const query =
    state.searchQuery
      .trim()
      .toLocaleLowerCase(
        'ru-RU'
      );

  const authors =
    state.selectedAuthors;

  return state.articles.filter(
    article => {

      const title =
        String(
          article.title || ''
        ).toLocaleLowerCase(
          'ru-RU'
        );

      const matchesSearch =
        !query ||
        title.includes(
          query
        );

      const matchesAuthor =
        !authors.length ||
        authors.includes(
          String(
            article.author_name ||
            ''
          ).trim()
        );

      return (
        matchesSearch &&
        matchesAuthor
      );
    }
  );
}


// =========================================================
// Render filtered results
// =========================================================

function updateFeedResults() {

  if (
    state.view !== 'feed'
  ) {
    return;
  }

  const main =
    document.getElementById(
      'main'
    );

  if (!main) {
    return;
  }

  const articles =
    getFilteredArticles();

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

  if (!articles.length) {

    main.innerHTML = `

      <div class="empty-state feed-no-results">

        <div class="no-results-icon">
          ⌕
        </div>

        <h2>
          Ничего не найдено
        </h2>

        <p>
          Попробуйте изменить запрос
          или снять фильтр по автору.
        </p>

        <button
          class="btn btn-secondary"
          id="resetFeedFiltersBtn"
          type="button"
        >
          Сбросить фильтры
        </button>

      </div>
    `;

    document
      .getElementById(
        'resetFeedFiltersBtn'
      )
      ?.addEventListener(
        'click',
        resetFeedFilters
      );

    return;
  }

  main.innerHTML =
    articles
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
    .querySelectorAll(
      '.feed-item'
    )
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
// Reset filters
// =========================================================

function resetFeedFilters() {

  state.searchQuery =
    '';

  state.selectedAuthors =
    [];

  const input =
    document.getElementById(
      'articleSearchInput'
    );

  if (input) {
    input.value = '';
  }

  updateAuthorFilterList();

  updateFeedControls();

  updateFeedResults();
}


// =========================================================
// Feed screen
// =========================================================

async function renderFeed() {

  state.view =
    'feed';

  state.currentId =
    null;

  setBackButton(false);

  /*
   * Сбрасываем фильтры при возврате
   * на главную.
   */

  state.searchQuery =
    '';

  state.selectedAuthors =
    [];

  state.filterOpen =
    false;

  const main =
    document.getElementById(
      'main'
    );

  main.innerHTML =
    '<div class="loading">Загрузка статей…</div>';

  ensureFeedControls();

  state.articles =
    await fetchFeed();

  updateAuthorFilterList();

  updateFeedControls();

  updateFeedResults();
}


// =========================================================
// Reader
// =========================================================

async function openReader(id) {

  state.view =
    'reader';

  state.currentId =
    id;

  setBackButton(
    true,
    renderFeed
  );

  const main =
    document.getElementById(
      'main'
    );

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
    .getElementById(
      'shareBtn'
    )
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

          console.error(err);
        }
      }
    );


  // =======================================================
  // Edit / Delete
  // =======================================================

  if (owner) {

    document
      .getElementById(
        'editBtn'
      )
      .addEventListener(
        'click',
        () => {
          editArticle(article);
        }
      );

    document
      .getElementById(
        'deleteBtn'
      )
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

          btn.disabled =
            true;

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

            btn.disabled =
              false;

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

    state.view =
      'editor';

    state.currentId =
      null;

    state.draft =
      newDraft();

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

  state.view =
    'editor';

  state.currentId =
    article.id;

  state.draft = {

    id:
      article.id,

    title:
      article.title || '',

    cover:
      article.cover || null,

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
    String(
      filename ||
      'image.jpg'
    )
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
      .getPublicUrl(
        path
      );

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

          let w =
            img.width;

          let h =
            img.height;

          if (
            w > maxW
          ) {

            h =
              Math.round(
                h *
                (maxW / w)
              );

            w =
              maxW;
          }

          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width =
            w;

          canvas.height =
            h;

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

        img.onerror =
          reject;

        img.src =
          e.target.result;
      };

      reader.onerror =
        reject;

      reader.readAsDataURL(
        file
      );
    }
  );
}


// =========================================================
// Is owner
// =========================================================

function isArticleOwner(
  article
) {

  if (
    !tgUser ||
    !article ||
    !article.author_id
  ) {

    return false;
  }

  return (
    Number(
      article.author_id
    ) ===
    Number(
      tgUser.id
    )
  );
}


// =========================================================
// Editor
// =========================================================

function renderEditor() {

  const main =
    document.getElementById(
      'main'
    );

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
  `;


  document
    .getElementById(
      'titleInput'
    )
    .addEventListener(
      'input',
      e => {

        d.title =
          e.target.value;
      }
    );


  document
    .getElementById(
      'toolbar'
    )
    .querySelectorAll(
      'button'
    )
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
            new Event(
              'input'
            )
          );
        }
      );
    });


  const addCoverBtn =
    document.getElementById(
      'addCoverBtn'
    );

  if (addCoverBtn) {

    addCoverBtn.addEventListener(
      'click',
      () => {

        document
          .getElementById(
            'coverInput'
          )
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
          .getElementById(
            'coverInput'
          )
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

        d.cover =
          null;

        renderEditor();

        showToast(
          'Обложка убрана'
        );
      }
    );
  }


  document
    .getElementById(
      'coverInput'
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
          'Обрабатываем обложку…';

        try {

          const dataUrl =
            await compressImageFile(
              file,
              1600,
              0.84
            );

          d.cover =
            dataUrl;

          renderEditor();

        } catch (err) {

          console.error(err);

          showToast(
            'Не удалось обработать обложку'
          );
        }

        const currentHint =
          document.getElementById(
            'editorHint'
          );

        if (currentHint) {
          currentHint.textContent =
            '';
        }

        e.target.value =
          '';
      }
    );


  document
    .getElementById(
      'fileInput'
    )
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

        hint.textContent =
          files.length === 1
            ? 'Обрабатываем изображение…'
            : `Обрабатываем ${files.length} изображений…`;

        try {

          const insertIndex =
            Number.isInteger(
              state.pendingImageInsertIndex
            )
              ? state.pendingImageInsertIndex
              : d.blocks.length;

          const newBlocks =
            [];

          for (
            const file
            of files
          ) {

            const dataUrl =
              await compressImageFile(
                file
              );

            newBlocks.push({
              type: 'image',
              src: dataUrl,
              caption: '',
              _pendingFile: true
            });
          }

          d.blocks.splice(
            insertIndex,
            0,
            ...newBlocks
          );

          state.pendingImageInsertIndex =
            null;

          renderBlocks({
            focusIndex:
              insertIndex
          });

        } catch (err) {

          console.error(err);

          showToast(
            'Не удалось обработать одно из изображений'
          );

        } finally {

          const currentHint =
            document.getElementById(
              'editorHint'
            );

          if (currentHint) {
            currentHint.textContent =
              '';
          }

          e.target.value =
            '';
        }
      }
    );


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
// Insert block
// =========================================================

function insertBlockAfter(
  index,
  block
) {

  const d =
    state.draft;

  const insertIndex =
    index + 1;

  d.blocks.splice(
    insertIndex,
    0,
    block
  );

  renderBlocks({
    focusIndex:
      block.type === 'text'
        ? insertIndex
        : null
  });
}


// =========================================================
// Open image picker
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

  if (!input) {
    return;
  }

  input.value =
    '';

  input.click();
}


// =========================================================
// Block add controls
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
    .addEventListener(
      'click',
      () => {

        insertBlockAfter(
          index,
          {
            type: 'text',
            html: ''
          }
        );
      }
    );

  row
    .querySelector(
      '[data-add="image"]'
    )
    .addEventListener(
      'click',
      () => {

        openImagePicker(
          index + 1
        );
      }
    );

  return row;
}


// =========================================================
// Blocks
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

  const d =
    state.draft;

  const oldActiveEl =
    activeBlockEl;

  let activeIndex =
    null;

  let selectionOffset =
    null;

  if (
    oldActiveEl &&
    oldActiveEl.isConnected &&
    oldActiveEl.dataset.i !==
      undefined
  ) {

    activeIndex =
      Number(
        oldActiveEl.dataset.i
      );

    try {

      const selection =
        window.getSelection();

      if (
        selection &&
        selection.rangeCount
      ) {

        const range =
          selection.getRangeAt(0);

        if (
          oldActiveEl.contains(
            range.startContainer
          )
        ) {

          selectionOffset =
            getCaretOffset(
              oldActiveEl,
              range
            );
        }
      }

    } catch (err) {

      console.warn(
        'Не удалось сохранить курсор:',
        err
      );
    }
  }

  host.innerHTML =
    '';

  d.blocks.forEach(
    (b, i) => {

      const block =
        document.createElement(
          'div'
        );

      block.className =
        'block';

      block.dataset.i =
        i;

      if (
        b.type === 'text'
      ) {

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

      host.appendChild(
        block
      );

      host.appendChild(
        createBlockAddControls(
          i
        )
      );
    }
  );


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

          if (
            !d.blocks[index] ||
            d.blocks[index].type !==
              'text'
          ) {

            return;
          }

          d.blocks[index].html =
            sanitizeHtml(
              e.target.innerHTML
            );
        }
      );

      el.addEventListener(
        'keyup',
        () => {

          activeBlockEl =
            el;
        }
      );

      el.addEventListener(
        'mouseup',
        () => {

          activeBlockEl =
            el;
        }
      );
    });


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

          if (
            !d.blocks[index] ||
            d.blocks[index].type !==
              'image'
          ) {

            return;
          }

          d.blocks[index].caption =
            e.target.value;
        }
      );
    });


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

          if (
            !d.blocks[index]
          ) {
            return;
          }

          const wasActive =
            activeIndex ===
            index;

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

          let focusIndex =
            null;

          if (wasActive) {

            focusIndex =
              Math.min(
                index,
                d.blocks.length - 1
              );

          } else if (
            activeIndex !== null
          ) {

            if (
              activeIndex >
              index
            ) {

              focusIndex =
                activeIndex - 1;

            } else {

              focusIndex =
                activeIndex;
            }
          }

          renderBlocks({
            focusIndex
          });
        }
      );
    });


  if (
    options.focusIndex !==
      undefined &&
    options.focusIndex !==
      null
  ) {

    const focusIndex =
      options.focusIndex;

    const target =
      host.querySelector(
        `.block-text[data-i="${focusIndex}"]`
      );

    if (target) {

      requestAnimationFrame(
        () => {

          target.focus();

          activeBlockEl =
            target;

          placeCaretAtEnd(
            target
          );
        }
      );

      return;
    }
  }


  if (
    activeIndex !== null &&
    activeIndex >= 0 &&
    activeIndex <
      d.blocks.length
  ) {

    const target =
      host.querySelector(
        `.block-text[data-i="${activeIndex}"]`
      );

    if (
      target &&
      document.activeElement ===
        document.body
    ) {

      target.focus();

      activeBlockEl =
        target;

      if (
        selectionOffset !== null
      ) {

        setCaretOffset(
          target,
          selectionOffset
        );
      }
    }
  }
}


// =========================================================
// Caret helpers
// =========================================================

function getCaretOffset(
  element,
  range
) {

  const preRange =
    range.cloneRange();

  preRange.selectNodeContents(
    element
  );

  preRange.setEnd(
    range.startContainer,
    range.startOffset
  );

  return preRange.toString().length;
}


function setCaretOffset(
  element,
  offset
) {

  const selection =
    window.getSelection();

  if (!selection) {
    return;
  }

  const range =
    document.createRange();

  let currentOffset =
    0;

  let found =
    false;

  function walk(node) {

    if (found) {
      return;
    }

    if (
      node.nodeType === 3
    ) {

      const length =
        node.nodeValue.length;

      if (
        currentOffset +
          length >=
        offset
      ) {

        range.setStart(
          node,
          Math.max(
            0,
            offset -
              currentOffset
          )
        );

        range.collapse(true);

        found =
          true;

        return;
      }

      currentOffset +=
        length;

      return;
    }

    node.childNodes.forEach(
      child => {
        walk(child);
      }
    );
  }

  walk(element);

  if (!found) {

    placeCaretAtEnd(
      element
    );

    return;
  }

  selection.removeAllRanges();

  selection.addRange(
    range
  );
}


function placeCaretAtEnd(
  element
) {

  const selection =
    window.getSelection();

  if (!selection) {
    return;
  }

  const range =
    document.createRange();

  range.selectNodeContents(
    element
  );

  range.collapse(false);

  selection.removeAllRanges();

  selection.addRange(
    range
  );
}


// =========================================================
// Publish
// =========================================================

async function publishDraft() {

  const d =
    state.draft;

  const hasContent =
    Boolean(
      d.title.trim()
    ) ||
    Boolean(
      d.cover
    ) ||
    d.blocks.some(
      b => {

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

  button.disabled =
    true;

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

    let finalCover =
      d.cover || null;

    if (
      finalCover &&
      finalCover.startsWith(
        'data:'
      )
    ) {

      finalCover =
        await uploadImage(
          finalCover,
          'cover.jpg'
        );
    }

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

        block.src =
          url;

        delete block._pendingFile;
      }
    }

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
            .slice(
              0,
              140
            )
        : '';

    const payload = {

      title:
        d.title.trim() ||
        'Без названия',

      excerpt,

      cover:
        finalCover,

      blocks:
        d.blocks
    };

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

    hint.textContent =
      '';

  } finally {

    button.disabled =
      false;
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


/*
 * ВАЖНО:
 * Никакой второй кнопки + Статья
 * здесь не создаём.
 *
 * Используется существующая:
 * #newArticleBtn
 */

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

    /*
     * Сразу создаём поиск/фильтр,
     * чтобы они существовали и на
     * мобильном, и на desktop.
     */

    ensureFeedControls();

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
