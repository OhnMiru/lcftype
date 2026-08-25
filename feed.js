// =========================================================
// Летопись — лента, поиск и фильтр по авторам
// =========================================================


// =========================================================
// Список авторов
// =========================================================

function getAuthors() {
  const map = new Map();

  state.articles.forEach(a => {
    const name =
      (a.author_name || '').trim();

    if (name) {
      map.set(name, name);
    }
  });

  return [...map.values()].sort(
    (a, b) =>
      a.localeCompare(
        b,
        'ru',
        {
          sensitivity: 'base'
        }
      )
  );
}


// =========================================================
// Фильтрация статей
// =========================================================

function filteredArticles() {
  const q =
    state.search
      .trim()
      .toLocaleLowerCase('ru-RU');

  return state.articles.filter(a => {
    const title =
      (a.title || '')
        .toLocaleLowerCase('ru-RU');

    const author =
      (a.author_name || '').trim();

    const searchOk =
      !q ||
      title.includes(q);

    const authorOk =
      !state.authorFilter.size ||
      state.authorFilter.has(author);

    return searchOk && authorOk;
  });
}


// =========================================================
// Панель поиска и фильтра
// =========================================================

function renderFeedTools() {
  const authors =
    getAuthors();

  const selectedCount =
    state.authorFilter.size;

  return `
    <div class="feed-tools chrome">

      <div class="feed-search-wrap">

        <span class="feed-search-icon">
          ⌕
        </span>

        <input
          id="articleSearch"
          class="feed-search"
          type="search"
          autocomplete="off"
          placeholder="Поиск по названию"
          value="${escapeHtml(
            state.search
          )}"
        >

        <button
          id="clearSearchBtn"
          class="feed-search-clear"
          type="button"
          aria-label="Очистить"
          ${state.search ? '' : 'hidden'}
        >
          ×
        </button>

      </div>

      <button
        id="authorFilterBtn"
        class="author-filter-btn ${
          selectedCount
            ? 'has-selection'
            : ''
        }"
        type="button"
      >

        <span>☷</span>

        <span>Фильтр</span>

        ${
          selectedCount
            ? `<b>${selectedCount}</b>`
            : ''
        }

      </button>

      <div
        id="authorFilterPanel"
        class="author-filter-panel"
        hidden
      >

        <div class="author-filter-head">

          <strong>
            Фильтр по автору
          </strong>

          <button
            id="closeAuthorFilter"
            type="button"
          >
            ×
          </button>

        </div>

        <div class="author-filter-list">

          ${authors.map(name => `
            <label class="author-option">

              <input
                type="checkbox"
                value="${escapeHtml(name)}"
                ${
                  state.authorFilter.has(name)
                    ? 'checked'
                    : ''
                }
              >

              <span>
                ${escapeHtml(name)}
              </span>

            </label>
          `).join('')}

        </div>

        ${
          state.authorFilter.size
            ? `
              <button
                id="resetAuthorFilter"
                class="author-filter-reset"
                type="button"
              >
                Сбросить фильтр
              </button>
            `
            : ''
        }

      </div>

    </div>
  `;
}


// =========================================================
// Обработчики поиска и фильтра
// =========================================================

function bindFeedTools() {
  const search =
    document.getElementById(
      'articleSearch'
    );

  const clear =
    document.getElementById(
      'clearSearchBtn'
    );

  const filter =
    document.getElementById(
      'authorFilterBtn'
    );

  const panel =
    document.getElementById(
      'authorFilterPanel'
    );

  search?.addEventListener(
    'input',
    e => {
      state.search =
        e.target.value;

      renderFeedListOnly();
    }
  );

  clear?.addEventListener(
    'click',
    () => {
      state.search = '';

      search.value = '';

      clear.hidden = true;

      renderFeedListOnly();

      search.focus();
    }
  );

  filter?.addEventListener(
    'click',
    () => {
      panel.hidden =
        !panel.hidden;
    }
  );

  document
    .getElementById(
      'closeAuthorFilter'
    )
    ?.addEventListener(
      'click',
      () => {
        panel.hidden = true;
      }
    );

  panel
    ?.querySelectorAll(
      'input[type=checkbox]'
    )
    .forEach(cb =>
      cb.addEventListener(
        'change',
        () => {
          if (cb.checked) {
            state.authorFilter.add(
              cb.value
            );
          } else {
            state.authorFilter.delete(
              cb.value
            );
          }

          renderFeed();
        }
      )
    );

  document
    .getElementById(
      'resetAuthorFilter'
    )
    ?.addEventListener(
      'click',
      () => {
        state.authorFilter.clear();

        renderFeed();
      }
    );
}


// =========================================================
// Только список статей
// =========================================================

function renderFeedListOnly() {
  const list =
    document.getElementById(
      'feedList'
    );

  if (!list) {
    return;
  }

  const rows =
    filteredArticles();

  list.innerHTML =
    rows.length
      ? rows.map(a => `
          <div
            class="feed-item"
            data-id="${escapeHtml(a.id)}"
          >

            ${
              a.cover
                ? `
                  <img
                    class="thumb"
                    src="${escapeHtml(a.cover)}"
                    alt=""
                  >
                `
                : ''
            }

            <div class="feed-meta">

              ${fmtDate(
                a.created_at
              )}

              ${
                a.author_name
                  ? ` · ${escapeHtml(
                      a.author_name
                    )}`
                  : ''
              }

            </div>

            <h3>
              ${escapeHtml(
                a.title ||
                'Без названия'
              )}
            </h3>

            <p>
              ${escapeHtml(
                a.excerpt || ''
              )}
            </p>

          </div>
        `).join('')
      : `
          <div class="empty-state feed-empty">

            <h2>
              Ничего не найдено
            </h2>

            <p>
              ${
                state.authorFilter.size
                  ? 'Попробуйте выбрать других авторов.'
                  : 'Попробуйте изменить запрос поиска.'
              }
            </p>

          </div>
        `;

  list
    .querySelectorAll(
      '.feed-item'
    )
    .forEach(el => {
      el.addEventListener(
        'click',
        () =>
          openReader(
            el.dataset.id
          )
      );
    });

  const clear =
    document.getElementById(
      'clearSearchBtn'
    );

  if (clear) {
    clear.hidden =
      !state.search;
  }

  const filter =
    document.getElementById(
      'authorFilterBtn'
    );

  if (filter) {
    filter.classList.toggle(
      'has-selection',
      !!state.authorFilter.size
    );

    const b =
      filter.querySelector('b');

    if (
      state.authorFilter.size &&
      !b
    ) {
      filter.insertAdjacentHTML(
        'beforeend',
        `<b>${state.authorFilter.size}</b>`
      );

    } else if (
      !state.authorFilter.size &&
      b
    ) {
      b.remove();

    } else if (b) {
      b.textContent =
        state.authorFilter.size;
    }
  }
}


// =========================================================
// Главная лента
// =========================================================

async function renderFeed() {
  state.view = 'feed';
  state.currentId = null;

  setBackButton(false);

  const main =
    document.getElementById(
      'main'
    );

  main.innerHTML =
    '<div class="loading">Загрузка статей…</div>';

  state.articles =
    await fetchFeed();

  main.innerHTML = `
    ${renderFeedTools()}

    <div id="feedList"></div>
  `;

  bindFeedTools();

  renderFeedListOnly();

  if (!state.articles.length) {
    document
      .getElementById(
        'feedList'
      )
      .innerHTML = `
        <div class="empty-state">

          <h2>
            Здесь пока пусто
          </h2>

          <p>
            Нажмите «+ Статья», чтобы опубликовать первую запись.
          </p>

        </div>
      `;
  }
}
