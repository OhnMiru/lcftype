// =========================================================
// Летопись — лента, поиск и фильтр по авторам
// =========================================================


// =========================================================
// Список авторов
// =========================================================

function getAuthors() {
  const authors = new Map();

  for (const article of state.articles || []) {
    const name = String(
      article?.author_name || ''
    ).trim();

    if (!name) {
      continue;
    }

    authors.set(name, name);
  }

  return [...authors.values()].sort(
    (a, b) => a.localeCompare(
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
  const query = String(
    state.search || ''
  )
    .trim()
    .toLocaleLowerCase('ru-RU');

  const selectedAuthors =
    state.authorFilter instanceof Set
      ? state.authorFilter
      : new Set();

  return (state.articles || []).filter(
    article => {
      const title = String(
        article?.title || ''
      )
        .toLocaleLowerCase('ru-RU');

      const author = String(
        article?.author_name || ''
      ).trim();

      const matchesSearch =
        !query ||
        title.includes(query);

      const matchesAuthor =
        selectedAuthors.size === 0 ||
        selectedAuthors.has(author);

      return (
        matchesSearch &&
        matchesAuthor
      );
    }
  );
}


// =========================================================
// HTML панели поиска и фильтра
// =========================================================

function renderFeedTools() {
  const authors = getAuthors();

  const selectedCount =
    state.authorFilter instanceof Set
      ? state.authorFilter.size
      : 0;

  const searchValue =
    String(state.search || '');

  return `
    <div class="feed-tools chrome">

      <!-- Поиск -->

      <div class="feed-search-wrap">

        <span
          class="feed-search-icon"
          aria-hidden="true"
        >
          ⌕
        </span>

        <input
          id="articleSearch"
          class="feed-search"
          type="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Поиск по названию"
          value="${escapeHtml(searchValue)}"
          aria-label="Поиск по названию"
        >

        <button
          id="clearSearchBtn"
          class="feed-search-clear"
          type="button"
          aria-label="Очистить поиск"
          ${searchValue ? '' : 'hidden'}
        >
          ×
        </button>

      </div>


      <!-- Фильтр -->

      <button
        id="authorFilterBtn"
        class="author-filter-btn ${
          selectedCount > 0
            ? 'has-selection'
            : ''
        }"
        type="button"
        aria-expanded="false"
        aria-controls="authorFilterPanel"
      >

        <span
          class="author-filter-icon"
          aria-hidden="true"
        >
          ☷
        </span>

        <span>
          Фильтр
        </span>

        ${
          selectedCount > 0
            ? `
              <b
                class="author-filter-count"
                aria-label="Выбрано авторов"
              >
                ${selectedCount}
              </b>
            `
            : ''
        }

      </button>


      <!-- Панель фильтра -->

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
            class="author-filter-close"
            type="button"
            aria-label="Закрыть фильтр"
          >
            ×
          </button>

        </div>


        ${
          authors.length
            ? `
              <div class="author-filter-list">

                ${authors.map(
                  author => {
                    const checked =
                      state.authorFilter instanceof Set &&
                      state.authorFilter.has(author);

                    return `
                      <label
                        class="author-option"
                      >

                        <input
                          type="checkbox"
                          value="${escapeHtml(author)}"
                          ${
                            checked
                              ? 'checked'
                              : ''
                          }
                        >

                        <span>
                          ${escapeHtml(author)}
                        </span>

                      </label>
                    `;
                  }
                ).join('')}

              </div>
            `
            : `
              <div class="author-filter-empty">
                Авторов пока нет.
              </div>
            `
        }


        ${
          selectedCount > 0
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
// Обновление состояния кнопки фильтра
// =========================================================

function updateAuthorFilterButton() {
  const button =
    document.getElementById(
      'authorFilterBtn'
    );

  if (!button) {
    return;
  }

  const selectedCount =
    state.authorFilter instanceof Set
      ? state.authorFilter.size
      : 0;

  button.classList.toggle(
    'has-selection',
    selectedCount > 0
  );

  const oldCount =
    button.querySelector(
      '.author-filter-count'
    );

  if (oldCount) {
    oldCount.remove();
  }

  if (selectedCount > 0) {
    button.insertAdjacentHTML(
      'beforeend',
      `
        <b
          class="author-filter-count"
          aria-label="Выбрано авторов"
        >
          ${selectedCount}
        </b>
      `
    );
  }
}


// =========================================================
// Обновление кнопки очистки поиска
// =========================================================

function updateSearchClearButton() {
  const clear =
    document.getElementById(
      'clearSearchBtn'
    );

  if (!clear) {
    return;
  }

  const hasSearch =
    String(state.search || '').trim() !== '';

  clear.hidden = !hasSearch;
}


// =========================================================
// Открыть панель фильтра
// =========================================================

function openAuthorFilter() {
  const panel =
    document.getElementById(
      'authorFilterPanel'
    );

  const button =
    document.getElementById(
      'authorFilterBtn'
    );

  if (!panel || !button) {
    return;
  }

  panel.hidden = false;

  button.setAttribute(
    'aria-expanded',
    'true'
  );
}


// =========================================================
// Закрыть панель фильтра
// =========================================================

function closeAuthorFilter() {
  const panel =
    document.getElementById(
      'authorFilterPanel'
    );

  const button =
    document.getElementById(
      'authorFilterBtn'
    );

  if (!panel || !button) {
    return;
  }

  panel.hidden = true;

  button.setAttribute(
    'aria-expanded',
    'false'
  );
}


// =========================================================
// Переключить панель фильтра
// =========================================================

function toggleAuthorFilter() {
  const panel =
    document.getElementById(
      'authorFilterPanel'
    );

  if (!panel) {
    return;
  }

  if (panel.hidden) {
    openAuthorFilter();
  } else {
    closeAuthorFilter();
  }
}


// =========================================================
// Синхронизация checkbox-фильтров
// =========================================================

function syncAuthorFilterCheckboxes() {
  const panel =
    document.getElementById(
      'authorFilterPanel'
    );

  if (!panel) {
    return;
  }

  const selected =
    state.authorFilter instanceof Set
      ? state.authorFilter
      : new Set();

  panel
    .querySelectorAll(
      'input[type="checkbox"]'
    )
    .forEach(checkbox => {
      checkbox.checked =
        selected.has(
          checkbox.value
        );
    });
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

  if (!state.authorFilter) {
    state.authorFilter = new Set();
  }

  // -------------------------------------------------------
  // Поиск
  // -------------------------------------------------------

  search?.addEventListener(
    'input',
    event => {
      state.search =
        event.target.value || '';

      updateSearchClearButton();

      renderFeedListOnly();
    }
  );


  // -------------------------------------------------------
  // Очистка поиска
  // -------------------------------------------------------

  clear?.addEventListener(
    'click',
    () => {
      state.search = '';

      if (search) {
        search.value = '';
      }

      updateSearchClearButton();

      renderFeedListOnly();

      search?.focus();
    }
  );


  // -------------------------------------------------------
  // Открытие / закрытие фильтра
  // -------------------------------------------------------

  filter?.addEventListener(
    'click',
    event => {
      event.stopPropagation();

      toggleAuthorFilter();
    }
  );


  // -------------------------------------------------------
  // Закрытие фильтра
  // -------------------------------------------------------

  document
    .getElementById(
      'closeAuthorFilter'
    )
    ?.addEventListener(
      'click',
      event => {
        event.stopPropagation();

        closeAuthorFilter();
      }
    );


  // -------------------------------------------------------
  // Выбор автора
  // -------------------------------------------------------

  panel
    ?.querySelectorAll(
      'input[type="checkbox"]'
    )
    .forEach(
      checkbox => {
        checkbox.addEventListener(
          'change',
          () => {
            if (!state.authorFilter) {
              state.authorFilter =
                new Set();
            }

            if (checkbox.checked) {
              state.authorFilter.add(
                checkbox.value
              );
            } else {
              state.authorFilter.delete(
                checkbox.value
              );
            }

            /*
             * ВАЖНО:
             *
             * Здесь НЕ вызываем renderFeed().
             *
             * renderFeed() заново запрашивает статьи
             * из Supabase и пересоздаёт весь интерфейс.
             *
             * Для локального фильтра это не нужно.
             */

            updateAuthorFilterButton();

            renderFeedListOnly();
          }
        );
      }
    );


  // -------------------------------------------------------
  // Сброс фильтра
  // -------------------------------------------------------

  document
    .getElementById(
      'resetAuthorFilter'
    )
    ?.addEventListener(
      'click',
      event => {
        event.stopPropagation();

        if (!state.authorFilter) {
          state.authorFilter =
            new Set();
        }

        state.authorFilter.clear();

        syncAuthorFilterCheckboxes();

        updateAuthorFilterButton();

        renderFeedListOnly();
      }
    );


  // -------------------------------------------------------
  // Начальное состояние
  // -------------------------------------------------------

  updateSearchClearButton();

  updateAuthorFilterButton();
}


// =========================================================
// Закрытие фильтра при клике вне панели
// =========================================================

function bindFeedOutsideClick() {
  if (
    bindFeedOutsideClick._bound
  ) {
    return;
  }

  bindFeedOutsideClick._bound = true;

  document.addEventListener(
    'click',
    event => {
      const panel =
        document.getElementById(
          'authorFilterPanel'
        );

      const button =
        document.getElementById(
          'authorFilterBtn'
        );

      if (!panel || !button) {
        return;
      }

      if (panel.hidden) {
        return;
      }

      const target =
        event.target;

      if (
        panel.contains(target) ||
        button.contains(target)
      ) {
        return;
      }

      closeAuthorFilter();
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


  // -------------------------------------------------------
  // Нет результатов
  // -------------------------------------------------------

  if (!rows.length) {
    const hasArticles =
      Array.isArray(state.articles) &&
      state.articles.length > 0;

    const hasSearch =
      String(
        state.search || ''
      ).trim() !== '';

    const hasAuthorsFilter =
      state.authorFilter instanceof Set &&
      state.authorFilter.size > 0;


    if (!hasArticles) {
      list.innerHTML = `
        <div class="empty-state">

          <h2>
            Здесь пока пусто
          </h2>

          <p>
            Нажмите «+ Статья», чтобы опубликовать первую запись.
          </p>

        </div>
      `;

      return;
    }


    let title =
      'Ничего не найдено';

    let description =
      'Попробуйте изменить параметры поиска.';


    if (
      hasSearch &&
      hasAuthorsFilter
    ) {
      description =
        'Попробуйте изменить запрос или выбрать других авторов.';

    } else if (hasSearch) {
      description =
        'Попробуйте изменить запрос поиска.';

    } else if (hasAuthorsFilter) {
      description =
        'Попробуйте выбрать других авторов.';
    }


    list.innerHTML = `
      <div class="empty-state feed-empty">

        <h2>
          ${escapeHtml(title)}
        </h2>

        <p>
          ${escapeHtml(description)}
        </p>

      </div>
    `;

    return;
  }


  // -------------------------------------------------------
  // Список статей
  // -------------------------------------------------------

  list.innerHTML =
    rows
      .map(article => {
        const id =
          String(
            article?.id ?? ''
          );

        const title =
          String(
            article?.title ||
            'Без названия'
          );

        const excerpt =
          String(
            article?.excerpt || ''
          );

        const author =
          String(
            article?.author_name || ''
          ).trim();

        const cover =
          String(
            article?.cover || ''
          ).trim();

        return `
          <div
            class="feed-item"
            data-id="${escapeHtml(id)}"
            role="button"
            tabindex="0"
          >

            ${
              cover
                ? `
                  <img
                    class="thumb"
                    src="${escapeHtml(cover)}"
                    alt=""
                    loading="lazy"
                  >
                `
                : ''
            }


            <div class="feed-meta">

              ${escapeHtml(
                fmtDate(
                  article?.created_at
                )
              )}

              ${
                author
                  ? `
                    ·
                    ${escapeHtml(author)}
                  `
                  : ''
              }

            </div>


            <h3>
              ${escapeHtml(title)}
            </h3>


            ${
              excerpt
                ? `
                  <p>
                    ${escapeHtml(excerpt)}
                  </p>
                `
                : ''
            }

          </div>
        `;
      })
      .join('');


  // -------------------------------------------------------
  // Обработчики открытия статьи
  // -------------------------------------------------------

  list
    .querySelectorAll(
      '.feed-item'
    )
    .forEach(item => {
      const open = () => {
        const id =
          item.dataset.id;

        if (!id) {
          return;
        }

        openReader(id);
      };


      item.addEventListener(
        'click',
        open
      );


      item.addEventListener(
        'keydown',
        event => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();

            open();
          }
        }
      );
    });


  // -------------------------------------------------------
  // Синхронизация UI
  // -------------------------------------------------------

  updateSearchClearButton();

  updateAuthorFilterButton();
}


// =========================================================
// Главная лента
// =========================================================

async function renderFeed() {
  state.view = 'feed';
  state.currentId = null;

  if (!state.authorFilter) {
    state.authorFilter =
      new Set();
  }

  setBackButton(false);

  const main =
    document.getElementById(
      'main'
    );

  if (!main) {
    console.error(
      'Элемент #main не найден'
    );

    return;
  }


  // -------------------------------------------------------
  // Загрузка
  // -------------------------------------------------------

  main.innerHTML = `
    <div class="loading">
      Загрузка статей…
    </div>
  `;


  try {
    state.articles =
      await fetchFeed();


    // -----------------------------------------------------
    // Отрисовка панели и списка
    // -----------------------------------------------------

    main.innerHTML = `
      ${renderFeedTools()}

      <div id="feedList"></div>
    `;


    bindFeedTools();

    bindFeedOutsideClick();

    renderFeedListOnly();


  } catch (error) {
    console.error(
      'renderFeed:',
      error
    );


    main.innerHTML = `
      <div class="empty-state">

        <h2>
          Не удалось загрузить статьи
        </h2>

        <p>
          ${escapeHtml(
            error?.message ||
            'Произошла ошибка загрузки.'
          )}
        </p>

        <button
          class="btn btn-primary"
          id="retryFeedBtn"
          type="button"
        >
          Повторить
        </button>

      </div>
    `;


    document
      .getElementById(
        'retryFeedBtn'
      )
      ?.addEventListener(
        'click',
        renderFeed
      );
  }
}
