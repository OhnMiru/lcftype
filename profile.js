// =========================================================
// Летопись — профиль пользователя
// =========================================================


// =========================================================
// Получить профиль
// =========================================================

async function getProfile() {
  const r = await callTelegramApi('get-profile');
  state.profile = r.profile || null;
  return state.profile;
}


// =========================================================
// Сохранить профиль
// =========================================================

async function saveProfile(username) {
  const r = await callTelegramApi('set-profile', { username });
  state.profile = r.profile;
  return state.profile;
}


// =========================================================
// Проверить профиль
// =========================================================

async function ensureProfile(ask = true) {
  const p = await getProfile();
  if (p) return p;
  return ask ? openUsernameDialog(null) : null;
}


// =========================================================
// Получить статистику профиля
// =========================================================

async function fetchProfileStats() {
  const r = await callTelegramApi('get-profile-stats');
  return r.stats || {
    articles_count: 0,
    comments_count: 0,
    article_reactions_received: 0,
    comment_reactions_received: 0,
    total_reactions_received: 0
  };
}


// =========================================================
// Получить мои статьи
// =========================================================

async function fetchMyArticles() {
  const r = await callTelegramApi('get-my-articles');
  return Array.isArray(r.articles) ? r.articles : [];
}


// =========================================================
// Получить мои комментарии
// =========================================================

async function fetchMyComments() {
  const r = await callTelegramApi('get-my-comments');
  return Array.isArray(r.comments) ? r.comments : [];
}


// =========================================================
// Диалог создания / изменения ника
// =========================================================

function openUsernameDialog(currentUsername) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';

    overlay.innerHTML = `
      <div class="profile-dialog">

        <div class="profile-dialog-title">
          ${currentUsername ? 'Изменить ник' : 'Создать профиль'}
        </div>

        <div class="profile-dialog-text">
          Придумайте имя автора. Его будут видеть рядом с вашими статьями.
        </div>

        <input
          class="profile-input"
          id="profileUsernameInput"
          maxlength="30"
          placeholder="Например: Анна"
          value="${escapeHtml(currentUsername || '')}"
        >

        <div class="profile-hint">
          Можно использовать русские и латинские буквы, цифры, пробел и _
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

    const input = overlay.querySelector('#profileUsernameInput');
    const save = overlay.querySelector('#profileSaveBtn');
    const cancel = overlay.querySelector('#profileCancelBtn');

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    cancel.onclick = () => {
      overlay.remove();
      resolve(null);
    };

    save.onclick = async () => {
      const username = input.value.trim().replace(/\s+/g, ' ');

      if (username.length < 2) {
        return showToast('Минимум 2 символа');
      }

      if (username.length > 30) {
        return showToast('Максимум 30 символов');
      }

      save.disabled = true;
      save.textContent = 'Сохраняем…';

      try {
        const p = await saveProfile(username);
        overlay.remove();
        showToast('Ник сохранён');
        resolve(p);
      } catch (e) {
        showToast(e.message || 'Не удалось сохранить ник');
        save.disabled = false;
        save.textContent = 'Сохранить';
      }
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') save.click();
      if (e.key === 'Escape') cancel.click();
    };
  });
}


// =========================================================
// Рендер вкладки статистики
// =========================================================

function renderStatsTab(stats) {
  return `
    <div class="profile-tab-content" id="statsTab">

      <div class="profile-stats-grid">

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.articles_count}</div>
          <div class="profile-stat-label">${getDeclension(stats.articles_count, 'статья', 'статьи', 'статей')}</div>
        </div>

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.comments_count}</div>
          <div class="profile-stat-label">${getDeclension(stats.comments_count, 'комментарий', 'комментария', 'комментариев')}</div>
        </div>

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.total_reactions_received}</div>
          <div class="profile-stat-label">реакций получили</div>
        </div>

      </div>

      <div class="profile-stats-detail">
        <div class="profile-stats-detail-item">
          <span>На статьях:</span>
          <span>${stats.article_reactions_received}</span>
        </div>
        <div class="profile-stats-detail-item">
          <span>На комментариях:</span>
          <span>${stats.comment_reactions_received}</span>
        </div>
      </div>

    </div>
  `;
}


// =========================================================
// Рендер вкладки "Мои статьи"
// =========================================================

function renderMyArticlesTab(articles) {
  if (!articles.length) {
    return `
      <div class="profile-tab-content" id="myArticlesTab">
        <div class="profile-empty-state">
          <p>Вы ещё не опубликовали ни одной статьи.</p>
          <button class="btn btn-primary" id="goToNewArticleBtn" type="button">
            + Написать статью
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="profile-tab-content" id="myArticlesTab">
      <div class="profile-articles-list">
        ${articles.map(article => `
          <div class="profile-article-item" data-id="${escapeHtml(article.id)}">
            <div class="profile-article-meta">
              <time>${fmtDate(article.created_at)}</time>
            </div>
            <h4 class="profile-article-title">${escapeHtml(article.title || 'Без названия')}</h4>
            ${article.excerpt ? `<p class="profile-article-excerpt">${escapeHtml(article.excerpt)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}


// =========================================================
// Рендер вкладки "Мои комментарии"
// =========================================================

function renderMyCommentsTab(comments) {
  if (!comments.length) {
    return `
      <div class="profile-tab-content" id="myCommentsTab">
        <div class="profile-empty-state">
          <p>Вы ещё не написали ни одного комментария.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="profile-tab-content" id="myCommentsTab">
      <div class="profile-comments-list">
        ${comments.map(comment => `
          <div class="profile-comment-item">
            <div class="profile-comment-meta">
              <time>${fmtDate(comment.created_at)}</time>
              <span class="profile-comment-article">
                к статье «${escapeHtml(comment.articles?.title || 'Удалённая статья')}»
              </span>
            </div>
            <p class="profile-comment-content">${escapeHtml(comment.content)}</p>
          </div>
        `).join('')}
      </div>
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
// Страница профиля
// =========================================================

async function openProfile() {
  state.view = 'profile';
  state.currentId = null;

  setBackButton(true, renderFeed);

  const main = document.getElementById('main');

  main.innerHTML = '<div class="loading">Загрузка профиля…</div>';

  try {
    const p = await ensureProfile(false);

    if (!p) {
      main.innerHTML = `
        <div class="profile-page">

          <div class="profile-card chrome">

            <div class="profile-avatar">
              ?
            </div>

            <h2>Профиль</h2>

            <p>У вас пока нет ника</p>

            <button
              class="btn btn-primary"
              id="createProfileBtn"
            >
              Придумать ник
            </button>

          </div>

        </div>
      `;

      document.getElementById('createProfileBtn').onclick = async () => {
        if (await ensureProfile(true)) {
          openProfile();
        }
      };

      return;
    }

    // Загружаем статистику, статьи и комментарии параллельно
    const [stats, articles, comments] = await Promise.all([
      fetchProfileStats(),
      fetchMyArticles(),
      fetchMyComments()
    ]);

    const first = p.username.trim().charAt(0).toUpperCase();

    main.innerHTML = `
      <div class="profile-page">

        <div class="profile-card chrome">

          <div class="profile-avatar">
            ${escapeHtml(first || '?')}
          </div>

          <div class="profile-label">
            Ваш ник
          </div>

          <div class="profile-username">
            ${escapeHtml(p.username)}
          </div>

          <button
            class="btn btn-secondary profile-edit-btn"
            id="changeUsernameBtn"
          >
            Изменить ник
          </button>

          <div class="profile-description">
            Этот ник отображается рядом с вашими статьями.
          </div>

        </div>

        <!-- Вкладки -->
        <div class="profile-tabs">

          <div class="profile-tabs-nav">
            <button class="profile-tab-btn active" data-tab="stats">
              📊 Статистика
            </button>
            <button class="profile-tab-btn" data-tab="articles">
              📝 Статьи (${articles.length})
            </button>
            <button class="profile-tab-btn" data-tab="comments">
              💬 Комментарии (${comments.length})
            </button>
          </div>

          <div class="profile-tabs-content">
            ${renderStatsTab(stats)}
            ${renderMyArticlesTab(articles)}
            ${renderMyCommentsTab(comments)}
          </div>

        </div>

      </div>
    `;

    // === Привязываем события ===

    // Изменить ник
    document.getElementById('changeUsernameBtn').onclick = async () => {
      if (await openUsernameDialog(p.username)) {
        openProfile();
      }
    };

    // Переключение вкладок
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Убираем активный класс у всех кнопок
        document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Показываем нужную вкладку
        const tabName = btn.dataset.tab;
        document.querySelectorAll('.profile-tab-content').forEach(content => {
          content.style.display = 'none';
        });

        const targetMap = {
          'stats': 'statsTab',
          'articles': 'myArticlesTab',
          'comments': 'myCommentsTab'
        };

        const target = document.getElementById(targetMap[tabName]);
        if (target) {
          target.style.display = 'block';
        }
      });
    });

    // Показываем только первую вкладку (статистика)
    document.querySelectorAll('.profile-tab-content').forEach((el, index) => {
      el.style.display = index === 0 ? 'block' : 'none';
    });

    // Клик по статье → открыть
    document.querySelectorAll('.profile-article-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id) openReader(id);
      });
    });

    // Кнопка "Написать статью"
    const goToNewArticle = document.getElementById('goToNewArticleBtn');
    if (goToNewArticle) {
      goToNewArticle.addEventListener('click', openEditor);
    }

  } catch (e) {
    console.error('openProfile:', e);

    main.innerHTML = `
      <div class="empty-state">
        <h2>Не удалось открыть профиль</h2>
        <p>${escapeHtml(e.message || '')}</p>
        <button class="btn btn-primary" id="retryProfileBtn" type="button">
          Повторить
        </button>
      </div>
    `;

    document.getElementById('retryProfileBtn')?.addEventListener('click', openProfile);
  }
}
