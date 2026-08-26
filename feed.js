// =========================================================
// Летопись — лента, поиск и фильтр по авторам
// =========================================================


// =========================================================
// Список авторов
// =========================================================

function getAuthors() {
  const authors = new Map();

  const articles =
    Array.isArray(state?.articles)
      ? state.articles
      : [];

  for (const article of articles) {
    const name = String(
      article?.author_name ?? ''
    ).trim();

    if (!name) {
      continue;
    }

    authors.set(name, name);
  }

  return [...authors.values()].sort(
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
// Нормализация фильтра авторов
// =========================================================

function ensureAuthorFilter() {
  if (!(state.authorFilter instanceof Set)) {
    state.authorFilter = new Set();
  }

  return state.authorFilter;
}


// =========================================================
// Текст поиска
// =========================================================

function getSearchQuery() {
  return String(
    state?.search ?? ''
  )
    .trim()
    .toLocaleLowerCase('ru-RU');
}


// =========================================================
// Получить порядок сортировки
// =========================================================

function getSortOrder() {
  return state.sortOrder || 'desc';
}


// =========================================================
// Переключить сортировку
// =========================================================

function toggleSortOrder() {
  state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
  refreshFilteredFeed();
  updateSortButton();
}


// =========================================================
// Обновить кнопку сортировки
// =========================================================

function updateSortButton() {
  const btn = document.getElementById('sortBtn');
  if (!btn) return;

  const isDesc = state.sortOrder === 'desc';
  btn.innerHTML = isDesc ? '↓' : '↑';
  btn.title = isDesc ? 'Сначала новые' : 'Сначала старые';
}


// =========================================================
// Фильтрация и сортировка статей
// =========================================================

function filteredArticles() {
  const query = getSearchQuery();
  const selectedAuthors = ensureAuthorFilter();
  const sortOrder = getSortOrder();

  const articles = Array.isArray(state?.articles) ? state.articles : [];

  // Сначала фильтруем
  let result = articles.filter(article => {
    const title = String(article?.title ?? '').toLocaleLowerCase('ru-RU');
    const author = String(article?.author_name ?? '').trim();

    const matchesSearch = !query || title.includes(query);
    const matchesAuthor = selectedAuthors.size === 0 || selectedAuthors.has(author);

    return matchesSearch && matchesAuthor;
  });

  // Затем сортируем
  result.sort((a, b) => {
    const dateA = new Date(a.created_at || 0);
    const dateB = new Date(b.created_at || 0);

    if (sortOrder === 'desc') {
      return dateB - dateA; // Новые сначала
    } else {
      return dateA - dateB; // Старые сначала
    }
  });

  return result;
}


// =========================================================
// HTML панели поиска и фильтра
// =========================================================

function renderFeedTools() {
  const authors = getAuthors();
  const selectedAuthors = ensureAuthorFilter();
  const selectedCount = selectedAuthors.size;
  const searchValue = String(state?.search ?? '');
  const sortOrder = getSortOrder();

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
          ${searchValue.trim() ? '' : 'hidden'}
        >
          ×
        </button>

      </div>

      <!-- Сортировка — только стрелочка -->

      <button
        id="sortBtn"
        class="feed-tool-btn feed-sort-btn"
        type="button"
        title="${sortOrder === 'desc' ? 'Сначала новые' : 'Сначала старые'}"
      >
        ${sortOrder === 'desc' ? '↓' : '↑'}
      </button>

      <!-- Фильтр — только иконка -->

      <button
        id="authorFilterBtn"
        class="author-filter-btn${selectedCount > 0 ? ' has-selection' : ''}"
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

        ${selectedCount > 0 ? `
          <b
            class="author-filter-count"
            aria-label="Выбрано авторов"
          >
            ${selectedCount}
          </b>
        ` : ''}

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

        ${authors.length > 0 ? `
          <div class="author-filter-list">

            ${authors.map(author => {
              const checked = selectedAuthors.has(author);

              return `
                <label class="author-option">

                  <input
                    type="checkbox"
                    value="${escapeHtml(author)}"
                    ${checked ? 'checked' : ''}
                  >

                  <span>
                    ${escapeHtml(author)}
                  </span>

                </label>
              `;
            }).join('')}

          </div>
        ` : `
          <div class="author-filter-empty">
            Авторов пока нет.
          </div>
        `}

        ${selectedCount > 0 ? `
          <button
            id="resetAuthorFilter"
            class="author-filter-reset"
            type="button"
          >
            Сбросить фильтр
          </button>
        ` : ''}

      </div>

    </div>
  `;
}


// =========================================================
// Обновление кнопки фильтра
// =========================================================

function updateAuthorFilterButton() {
  const button = document.getElementById('authorFilterBtn');

  if (!button) {
    return;
  }

  const selectedCount = ensureAuthorFilter().size;

  button.classList.toggle('has-selection', selectedCount > 0);

  const oldCount = button.querySelector('.author-filter-count');

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
  const clear = document.getElementById('clearSearchBtn');

  if (!clear) {
    return;
  }

  const hasSearch = getSearchQuery() !== '';

  clear.hidden = !hasSearch;
}


// =========================================================
// Открыть панель фильтра
// =========================================================

function openAuthorFilter() {
  const panel = document.getElementById('authorFilterPanel');
  const button = document.getElementById('authorFilterBtn');

  if (!panel || !button) {
    return;
  }

  panel.hidden = false;

  button.setAttribute('aria-expanded', 'true');
}


// =========================================================
// Закрыть панель фильтра
// =========================================================

function closeAuthorFilter() {
  const panel = document.getElementById('authorFilterPanel');
  const button = document.getElementById('authorFilterBtn');

  if (!panel || !button) {
    return;
  }

  panel.hidden = true;

  button.setAttribute('aria-expanded', 'false');
}


// =========================================================
// Переключить панель фильтра
// =========================================================

function toggleAuthorFilter() {
  const panel = document.getElementById('authorFilterPanel');

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
  const panel = document.getElementById('authorFilterPanel');

  if (!panel) {
    return;
  }

  const selected = ensureAuthorFilter();

  panel
    .querySelectorAll('input[type="checkbox"]')
    .forEach(checkbox => {
      checkbox.checked = selected.has(checkbox.value);
    });
}


// =========================================================
// Обновить список после изменения фильтра
// =========================================================

function refreshFilteredFeed() {
  renderFeedListOnly();
  updateSearchClearButton();
  updateAuthorFilterButton();
  updateSortButton();
}


// =========================================================
// Обработчики поиска и фильтра
// =========================================================

function bindFeedTools() {
  const search = document.getElementById('articleSearch');
  const clear = document.getElementById('clearSearchBtn');
  const filter = document.getElementById('authorFilterBtn');
  const sortBtn = document.getElementById('sortBtn');
  const panel = document.getElementById('authorFilterPanel');

  ensureAuthorFilter();

  // -------------------------------------------------------
  // Поиск
  // -------------------------------------------------------

  search?.addEventListener('input', event => {
    state.search = event.target?.value || '';
    updateSearchClearButton();
    renderFeedListOnly();
  });

  // -------------------------------------------------------
  // Очистка поиска
  // -------------------------------------------------------

  clear?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    state.search = '';

    if (search) {
      search.value = '';
    }

    updateSearchClearButton();
    renderFeedListOnly();
    search?.focus();
  });

  // -------------------------------------------------------
  // Сортировка
  // -------------------------------------------------------

  sortBtn?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleSortOrder();
  });

  // -------------------------------------------------------
  // Открытие / закрытие фильтра
  // -------------------------------------------------------

  filter?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleAuthorFilter();
  });

  // -------------------------------------------------------
  // Закрытие фильтра
  // -------------------------------------------------------

  document
    .getElementById('closeAuthorFilter')
    ?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeAuthorFilter();
    });

  // -------------------------------------------------------
  // Выбор автора
  // -------------------------------------------------------

  panel
    ?.querySelectorAll('input[type="checkbox"]')
    .forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const selected = ensureAuthorFilter();

        if (checkbox.checked) {
          selected.add(checkbox.value);
        } else {
          selected.delete(checkbox.value);
        }

        refreshFilteredFeed();
      });
    });

  // -------------------------------------------------------
  // Сброс фильтра
  // -------------------------------------------------------

  document
    .getElementById('resetAuthorFilter')
    ?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      ensureAuthorFilter().clear();
      syncAuthorFilterCheckboxes();
      refreshFilteredFeed();
    });

  // -------------------------------------------------------
  // Начальное состояние
  // -------------------------------------------------------

  updateSearchClearButton();
  updateAuthorFilterButton();
  updateSortButton();
}


// =========================================================
// Закрытие фильтра при клике вне панели
// =========================================================

function bindFeedOutsideClick() {
  if (bindFeedOutsideClick._bound) {
    return;
  }

  bindFeedOutsideClick._bound = true;

  document.addEventListener('click', event => {
    const panel = document.getElementById('authorFilterPanel');
    const button = document.getElementById('authorFilterBtn');

    if (!panel || !button) {
      return;
    }

    if (panel.hidden) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (panel.contains(target) || button.contains(target)) {
      return;
    }

    closeAuthorFilter();
  });
}


// =========================================================
// Создание карточки статьи
// =========================================================

function renderFeedItem(article) {
  const id = String(article?.id ?? '');
  const title = String(article?.title || 'Без названия');
  const excerpt = String(article?.excerpt || '');
  const author = String(article?.author_name || '').trim();
  const cover = String(article?.cover || '').trim();

  return `
    <div
      class="feed-item"
      data-id="${escapeHtml(id)}"
      role="button"
      tabindex="0"
    >

      ${cover ? `
        <img
          class="thumb"
          src="${escapeHtml(cover)}"
          alt=""
          loading="lazy"
          decoding="async"
        >
      ` : ''}

      <div class="feed-meta">
        ${escapeHtml(fmtDate(article?.created_at))}
        ${author ? `
          · 
          <span 
            class="author-clickable" 
            data-author-id="${escapeHtml(article.author_id)}" 
            data-author-name="${escapeHtml(author)}"
          >
            ${escapeHtml(author)}
          </span>
        ` : ''}
      </div>

      <h3>
        ${escapeHtml(title)}
      </h3>

      ${excerpt ? `
        <p>
          ${escapeHtml(excerpt)}
        </p>
      ` : ''}

    </div>
  `;
}


// =========================================================
// Открытие статьи
// =========================================================

function bindFeedItem(item) {
  if (!item) {
    return;
  }

  const open = () => {
    const id = item.dataset.id;

    if (!id) {
      return;
    }

    openReader(id);
  };

  item.addEventListener('click', open);

  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}


// =========================================================
// Только список статей
// =========================================================

function renderFeedListOnly() {
  const list = document.getElementById('feedList');

  if (!list) {
    return;
  }

  const rows = filteredArticles();

  // -------------------------------------------------------
  // Нет результатов
  // -------------------------------------------------------

  if (!rows.length) {
    const hasArticles = Array.isArray(state?.articles) && state.articles.length > 0;
    const hasSearch = getSearchQuery() !== '';
    const hasAuthorsFilter = ensureAuthorFilter().size > 0;

    // -----------------------------------------------------
    // Вообще нет статей
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // Статьи есть, но фильтр ничего не нашёл
    // -----------------------------------------------------

    let description = 'Попробуйте изменить параметры поиска.';

    if (hasSearch && hasAuthorsFilter) {
      description = 'Попробуйте изменить запрос или выбрать других авторов.';
    } else if (hasSearch) {
      description = 'Попробуйте изменить запрос поиска.';
    } else if (hasAuthorsFilter) {
      description = 'Попробуйте выбрать других авторов.';
    }

    list.innerHTML = `
      <div class="empty-state feed-empty">

        <h2>
          Ничего не найдено
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

  list.innerHTML = rows.map(renderFeedItem).join('');

  // -------------------------------------------------------
  // Обработчики открытия статьи
  // -------------------------------------------------------

  list.querySelectorAll('.feed-item').forEach(bindFeedItem);

  if (typeof makeAuthorClickable === 'function') {
    makeAuthorClickable(list);
  }

  // -------------------------------------------------------
  // Синхронизация UI
  // -------------------------------------------------------

  updateSearchClearButton();
  updateAuthorFilterButton();
  updateSortButton();
}


// =========================================================
// Главная лента
// =========================================================

async function renderFeed() {
  state.view = 'feed';
  state.currentId = null;

  ensureAuthorFilter();

  setBackButton(false);

  const main = document.getElementById('main');

  if (!main) {
    console.error('renderFeed: элемент #main не найден');
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
    const articles = await fetchFeed();

    state.articles = Array.isArray(articles) ? articles : [];

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

    // =====================================================
    // Обновляем видимость кнопки "Черновики"
    // =====================================================
    if (typeof updateDraftsButtonVisibility === 'function') {
      updateDraftsButtonVisibility();
    }

  } catch (error) {
    console.error('renderFeed:', error);

    main.innerHTML = `
      <div class="empty-state">

        <h2>
          Не удалось загрузить статьи
        </h2>

        <p>
          ${escapeHtml(error?.message || 'Произошла ошибка загрузки.')}
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
      .getElementById('retryFeedBtn')
      ?.addEventListener('click', () => {
        renderFeed();
      });
  }
}


// =========================================================
// Экспорт для навигации
// =========================================================

window.renderFeed = renderFeed;
