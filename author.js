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

    // Проверяем, подписан ли текущий пользователь на автора
    let isSubscribed = false;
    const isOwnProfile = tgUser && Number(tgUser.id) === Number(profile.telegram_id);

    if (tgUser && !isOwnProfile) {
      try {
        const subResult = await callTelegramApi('is-subscribed', {
          authorId: Number(profile.telegram_id)
        });
        isSubscribed = subResult.isSubscribed || false;
      } catch (e) {
        console.warn('check subscription error:', e);
      }
    }

    renderAuthorPage(profile, articles, isSubscribed, isOwnProfile);

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

function renderAuthorPage(profile, articles, isSubscribed = false, isOwnProfile = false) {
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
            ${!isOwnProfile ? `
              <button
                class="btn ${isSubscribed ? 'btn-secondary' : 'btn-primary'} author-subscribe-btn"
                id="subscribeBtn"
                type="button"
              >
                ${isSubscribed ? '✓ Подписан' : '➕ Подписаться'}
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
            <div class="author-bio-wrapper">
              <div class="author-bio">
                ${escapeHtml(bio)}
              </div>
            </div>
          ` : ''}

          ${hasDonations ? `
            <div class="author-actions-row">
              <button
                class="btn btn-primary author-donate-btn"
                id="authorDonateBtn"
                type="button"
              >
                Поддержать
              </button>
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

  // Кнопка подписки
  const subscribeBtn = document.getElementById('subscribeBtn');
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', async () => {
      const authorId = profile.telegram_id;
      const isCurrentlySubscribed = subscribeBtn.textContent.includes('Подписан');

      subscribeBtn.disabled = true;
      const originalText = subscribeBtn.textContent;

      try {
        if (isCurrentlySubscribed) {
          // Отписаться
          await callTelegramApi('unsubscribe', { authorId });
          subscribeBtn.textContent = '➕ Подписаться';
          subscribeBtn.className = 'btn btn-primary author-subscribe-btn';
          showToast('Вы отписались от автора');
        } else {
          // Подписаться
          await callTelegramApi('subscribe', { authorId });
          subscribeBtn.textContent = '✓ Подписан';
          subscribeBtn.className = 'btn btn-secondary author-subscribe-btn';
          showToast('Вы подписались на автора! 🔔');
        }
      } catch (e) {
        console.error('subscription error:', e);
        showToast(e.message || 'Не удалось изменить подписку');
        subscribeBtn.textContent = originalText;
      } finally {
        subscribeBtn.disabled = false;
      }
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
