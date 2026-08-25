// =========================================================
// Летопись — страница автора
// =========================================================


// =========================================================
// Открыть страницу автора
// =========================================================

async function openAuthor(authorId, authorName) {
  state.view = 'author';
  state.currentId = null;

  setBackButton(true, renderFeed);

  const main = document.getElementById('main');

  if (!main) {
    console.error('openAuthor: элемент #main не найден');
    return;
  }

  main.innerHTML = `
    <div class="loading">
      Загружаем статьи ${escapeHtml(authorName || 'автора')}…
    </div>
  `;

  try {
    const result = await callTelegramApi('get-author-articles', {
      authorId: Number(authorId)
    });

    if (!result || !result.profile) {
      main.innerHTML = `
        <div class="empty-state">
          <h2>Автор не найден</h2>
          <p>Возможно, профиль был удалён.</p>
          <button class="btn btn-primary" id="backFromAuthorBtn" type="button">
            На главную
          </button>
        </div>
      `;

      document.getElementById('backFromAuthorBtn')?.addEventListener('click', renderFeed);
      return;
    }

    const profile = result.profile;
    const articles = Array.isArray(result.articles) ? result.articles : [];

    renderAuthorPage(profile, articles);

  } catch (error) {
    console.error('openAuthor:', error);

    main.innerHTML = `
      <div class="empty-state">
        <h2>Не удалось загрузить статьи автора</h2>
        <p>${escapeHtml(error?.message || 'Произошла ошибка.')}</p>
        <button class="btn btn-primary" id="backFromAuthorBtn" type="button">
          На главную
        </button>
      </div>
    `;

    document.getElementById('backFromAuthorBtn')?.addEventListener('click', renderFeed);
  }
}


// =========================================================
// Рендер страницы автора
// =========================================================

function renderAuthorPage(profile, articles) {
  const main = document.getElementById('main');

  if (!main) return;

  const avatarUrl = profile.avatar || null;
  const avatarLetter = profile.username?.charAt(0)?.toUpperCase() || '?';
  const bio = profile.bio || null;

  // Проверяем, есть ли у автора донаты
  const donationLink = profile.donation_link || null;
  const hasDonations = !!(donationLink);

  main.innerHTML = `
    <div class="author-page">

      <!-- Профиль автора -->
      <div class="author-header chrome">

        <div class="author-avatar">
          ${avatarUrl ? `
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profile.username)}" class="author-avatar-img">
          ` : `
            ${escapeHtml(avatarLetter)}
          `}
        </div>

        <div class="author-info">

          <div class="author-name-row">
            <h1 class="author-name">
              ${escapeHtml(profile.username)}
            </h1>
            ${hasDonations ? `
              <button
                class="btn btn-primary author-donate-btn"
                id="authorDonateBtn"
                type="button"
              >
                Поддержать
              </button>
            ` : ''}
          </div>

          <div class="author-stats">
            <span class="author-stat">
              <span class="author-stat-number">${articles.length}</span>
              ${getDeclension(articles.length, 'статья', 'статьи', 'статей')}
            </span>
            <span class="author-stat-divider">·</span>
            <span class="author-stat">
              С <time datetime="${profile.created_at}">${fmtDate(profile.created_at)}</time>
            </span>
          </div>

          ${bio ? `
            <div class="author-bio">
              ${escapeHtml(bio)}
            </div>
          ` : ''}

        </div>

      </div>

      <!-- Список статей -->
      <div class="author-articles">

        ${articles.length === 0
          ? `
            <div class="empty-state author-empty">
              <h3>У автора пока нет статей</h3>
              <p>Загляните позже.</p>
            </div>
          `
          : articles.map(article => renderAuthorArticleCard(article)).join('')
        }

      </div>

    </div>
  `;

  // Привязываем клики по карточкам
  main.querySelectorAll('.feed-item').forEach(bindFeedItem);

  // Кнопка доната на странице автора
  const donateBtn = document.getElementById('authorDonateBtn');
  if (donateBtn && donationLink) {
    donateBtn.addEventListener('click', () => {
      window.open(donationLink, '_blank');
    });
  }
}

// =========================================================
// Карточка статьи на странице автора
// =========================================================

function renderAuthorArticleCard(article) {
  const id = String(article?.id ?? '');
  const title = String(article?.title || 'Без названия');
  const excerpt = String(article?.excerpt || '');
  const cover = String(article?.cover || '').trim();

  return `
    <div class="feed-item" data-id="${escapeHtml(id)}" role="button" tabindex="0">

      ${cover ? `
        <img class="thumb" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">
      ` : ''}

      <div class="feed-meta">
        ${fmtDate(article?.created_at)}
      </div>

      <h3>${escapeHtml(title)}</h3>

      ${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''}

    </div>
  `;
}


// =========================================================
// Склонение существительных
// =========================================================

function getDeclension(count, one, two, five) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;

  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;

  return five;
}


// =========================================================
// Добавляем обработчики на кликабельные имена авторов
// =========================================================

function makeAuthorClickable(container) {
  if (!container) return;

  container.querySelectorAll('.author-clickable').forEach(el => {
    el.removeEventListener('click', el._authorClickHandler);

    const authorId = el.dataset.authorId;
    const authorName = el.dataset.authorName;

    if (!authorId) return;

    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAuthor(authorId, authorName);
    };

    el._authorClickHandler = handler;
    el.addEventListener('click', handler);

    el.style.cursor = 'pointer';
    el.style.textDecoration = 'underline';
    el.style.textDecorationStyle = 'dotted';
    el.style.textUnderlineOffset = '2px';
  });
}
