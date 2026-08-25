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

async function saveProfile(username, avatar = null) {
  const r = await callTelegramApi('set-profile', { 
    username,
    avatar
  });
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
  try {
    const r = await callTelegramApi('get-profile-stats');
    return r.stats || {
      articles_count: 0,
      comments_count: 0,
      article_reactions_received: 0,
      comment_reactions_received: 0,
      total_reactions_received: 0
    };
  } catch (e) {
    console.error('fetchProfileStats:', e);
    return {
      articles_count: 0,
      comments_count: 0,
      article_reactions_received: 0,
      comment_reactions_received: 0,
      total_reactions_received: 0
    };
  }
}


// =========================================================
// Получить мои статьи
// =========================================================

async function fetchMyArticles() {
  try {
    const r = await callTelegramApi('get-my-articles');
    return Array.isArray(r.articles) ? r.articles : [];
  } catch (e) {
    console.error('fetchMyArticles:', e);
    return [];
  }
}


// =========================================================
// Получить мои комментарии
// =========================================================

async function fetchMyComments() {
  try {
    const r = await callTelegramApi('get-my-comments');
    return Array.isArray(r.comments) ? r.comments : [];
  } catch (e) {
    console.error('fetchMyComments:', e);
    return [];
  }
}


// =========================================================
// Получить настройки донатов автора
// =========================================================

async function getDonationSettings(userId) {
  try {
    const { data, error } = await db
      .from('donation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data || { donation_link: null, is_enabled: false };

  } catch (e) {
    console.error('getDonationSettings error:', e);
    return { donation_link: null, is_enabled: false };
  }
}


// =========================================================
// Сохранить настройки донатов
// =========================================================

async function saveDonationSettings(userId, settings) {
  const { data, error } = await db
    .from('donation_settings')
    .upsert({
      user_id: userId,
      donation_link: settings.donation_link || null,
      is_enabled: settings.is_enabled || false,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}


// =========================================================
// Проверить, может ли автор принимать донаты
// =========================================================

async function canAcceptDonations(userId) {
  const settings = await getDonationSettings(userId);
  return settings.is_enabled && settings.donation_link;
}


// =========================================================
// Получить ссылку на донаты автора
// =========================================================

async function getDonationLink(userId) {
  const settings = await getDonationSettings(userId);
  return settings.is_enabled ? settings.donation_link : null;
}


// =========================================================
// Загрузить аватарку
// =========================================================

async function uploadAvatar(file) {
  try {
    const dataUrl = await compressImageFile(file, 400, 0.9);
    const url = await uploadImage(dataUrl, 'avatar.jpg');
    return url;
  } catch (e) {
    console.error('uploadAvatar error:', e);
    throw new Error('Не удалось загрузить аватарку');
  }
}


// =========================================================
// Диалог изменения аватарки
// =========================================================

function openAvatarDialog(currentAvatar) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';

    overlay.innerHTML = `
      <div class="profile-dialog avatar-dialog">

        <div class="profile-dialog-title">
          Аватарка
        </div>

        <div class="profile-dialog-text">
          Выберите изображение для аватарки.
        </div>

        <div class="avatar-preview-container">
          ${currentAvatar ? `
            <img src="${escapeHtml(currentAvatar)}" alt="Аватар" class="avatar-preview-img">
          ` : `
            <div class="avatar-preview-placeholder">
              <span>📷</span>
            </div>
          `}
        </div>

        <input
          type="file"
          id="avatarFileInput"
          accept="image/*"
          style="display:none"
        >

        <div class="profile-dialog-actions">

          <button
            class="btn btn-secondary"
            id="avatarCancelBtn"
          >
            Отмена
          </button>

          ${currentAvatar ? `
            <button
              class="btn btn-danger"
              id="avatarRemoveBtn"
            >
              Удалить
            </button>
          ` : ''}

          <button
            class="btn btn-primary"
            id="avatarChooseBtn"
          >
            Выбрать фото
          </button>

          <button
            class="btn btn-primary"
            id="avatarSaveBtn"
            style="display:none"
          >
            Сохранить
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const fileInput = overlay.querySelector('#avatarFileInput');
    const chooseBtn = overlay.querySelector('#avatarChooseBtn');
    const saveBtn = overlay.querySelector('#avatarSaveBtn');
    const cancelBtn = overlay.querySelector('#avatarCancelBtn');
    const removeBtn = overlay.querySelector('#avatarRemoveBtn');
    const preview = overlay.querySelector('.avatar-preview-container');
    let newAvatarDataUrl = null;

    // Выбрать фото
    chooseBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Обработка выбора файла
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        chooseBtn.disabled = true;
        chooseBtn.textContent = 'Загрузка…';

        const dataUrl = await compressImageFile(file, 400, 0.9);
        newAvatarDataUrl = dataUrl;

        preview.innerHTML = `
          <img src="${dataUrl}" alt="Аватар" class="avatar-preview-img">
        `;

        chooseBtn.style.display = 'none';
        saveBtn.style.display = 'inline-flex';
        saveBtn.disabled = false;

      } catch (e) {
        showToast('Не удалось обработать изображение');
        console.error(e);
      } finally {
        chooseBtn.disabled = false;
        chooseBtn.textContent = 'Выбрать фото';
        fileInput.value = '';
      }
    });

    // Сохранить
    saveBtn.addEventListener('click', () => {
      resolve(newAvatarDataUrl);
      overlay.remove();
    });

    // Удалить
    removeBtn?.addEventListener('click', () => {
      resolve(null);
      overlay.remove();
    });

    // Отмена
    cancelBtn.addEventListener('click', () => {
      resolve('cancel');
      overlay.remove();
    });

    // Закрытие по клику вне
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        resolve('cancel');
        overlay.remove();
      }
    });

  });
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
        showToast('Минимум 2 символа');
        return;
      }

      if (username.length > 30) {
        showToast('Максимум 30 символов');
        return;
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
// Рендер вкладки статистики
// =========================================================

function renderStatsTab(stats) {
  return `
    <div class="profile-tab-content" id="statsTab">

      <div class="profile-stats-grid">

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.articles_count || 0}</div>
          <div class="profile-stat-label">${getDeclension(stats.articles_count || 0, 'статья', 'статьи', 'статей')}</div>
        </div>

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.comments_count || 0}</div>
          <div class="profile-stat-label">${getDeclension(stats.comments_count || 0, 'комментарий', 'комментария', 'комментариев')}</div>
        </div>

        <div class="profile-stat-card">
          <div class="profile-stat-number">${stats.total_reactions_received || 0}</div>
          <div class="profile-stat-label">реакций получили</div>
        </div>

      </div>

      <div class="profile-stats-detail">
        <div class="profile-stats-detail-item">
          <span>На статьях:</span>
          <span>${stats.article_reactions_received || 0}</span>
        </div>
        <div class="profile-stats-detail-item">
          <span>На комментариях:</span>
          <span>${stats.comment_reactions_received || 0}</span>
        </div>
      </div>

    </div>
  `;
}


// =========================================================
// Рендер вкладки "Мои статьи"
// =========================================================

function renderMyArticlesTab(articles) {
  if (!articles || !articles.length) {
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
  if (!comments || !comments.length) {
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
// Страница профиля
// =========================================================

async function openProfile() {
  state.view = 'profile';
  state.currentId = null;

  setBackButton(true, renderFeed);

  const main = document.getElementById('main');

  if (!main) {
    console.error('openProfile: элемент #main не найден');
    return;
  }

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

    // Загружаем статистику, статьи, комментарии и настройки донатов
    const [stats, articles, comments, donationSettings] = await Promise.all([
      fetchProfileStats(),
      fetchMyArticles(),
      fetchMyComments(),
      getDonationSettings(p.telegram_id)
    ]);

    console.log('Profile data:', { stats, articles, comments, donationSettings });

    const first = p.username.trim().charAt(0).toUpperCase();
    const avatar = p.avatar || null;
    const donationLink = donationSettings?.donation_link || '';
    const isDonationEnabled = donationSettings?.is_enabled || false;

    main.innerHTML = `
      <div class="profile-page">

        <div class="profile-card chrome">

          <!-- Аватарка -->
          <div class="profile-avatar-wrapper">
            ${avatar ? `
              <img src="${escapeHtml(avatar)}" alt="Аватар" class="profile-avatar-img">
            ` : `
              <div class="profile-avatar">
                ${escapeHtml(first || '?')}
              </div>
            `}
            <button class="profile-avatar-edit" id="changeAvatarBtn" title="Изменить аватарку">
              ✎
            </button>
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
            Этот ник отображается рядом с вашими статьями и комментариями.
          </div>

        </div>

        <!-- Настройки донатов -->
        <div class="profile-card donation-settings-card chrome">
          <h3 class="donation-settings-title">⭐ Донаты</h3>

          <div class="donation-settings-desc">
            Вставьте ссылку на вашу страницу в CloudTips, чтобы читатели могли вас поддержать.
          </div>

          <div class="donation-settings-field">
            <input
              type="url"
              id="donationLinkInput"
              class="donation-settings-input"
              placeholder="https://pay.cloudtips.ru/p/..."
              value="${escapeHtml(donationLink)}"
            >
          </div>

          <div class="donation-settings-actions">
            <button
              class="btn btn-primary"
              id="saveDonationLinkBtn"
            >
              Сохранить
            </button>

            ${donationLink ? `
              <button
                class="btn btn-secondary"
                id="removeDonationLinkBtn"
              >
                Убрать
              </button>
            ` : ''}
          </div>

          ${donationLink ? `
            <div class="donation-settings-status enabled">
              ✅ Донаты включены
            </div>
          ` : `
            <div class="donation-settings-status disabled">
              ❌ Донаты отключены
            </div>
          `}

          <div class="donation-settings-help">
            <a href="https://cloudtips.ru/" target="_blank" rel="noopener">
              Как создать ссылку в CloudTips →
            </a>
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

    // Изменить аватарку
    document.getElementById('changeAvatarBtn').onclick = async () => {
      const result = await openAvatarDialog(avatar);
      
      if (result === 'cancel') return;
      
      try {
        let avatarUrl = null;
        
        if (result !== null) {
          avatarUrl = await uploadImage(result, 'avatar.jpg');
        }
        
        await saveProfile(p.username, avatarUrl);
        
        showToast(avatarUrl ? 'Аватарка обновлена ✅' : 'Аватарка удалена');
        openProfile();
        
      } catch (e) {
        console.error('save avatar error:', e);
        showToast(e.message || 'Не удалось сохранить аватарку');
      }
    };

    // Изменить ник
    document.getElementById('changeUsernameBtn').onclick = async () => {
      if (await openUsernameDialog(p.username)) {
        openProfile();
      }
    };

    // Сохранить ссылку на донаты
    const saveDonationBtn = document.getElementById('saveDonationLinkBtn');
    const donationInput = document.getElementById('donationLinkInput');

    saveDonationBtn?.addEventListener('click', async () => {
      const link = donationInput.value.trim();

      if (link && !link.startsWith('https://pay.cloudtips.ru/')) {
        showToast('Ссылка должна начинаться с https://pay.cloudtips.ru/');
        return;
      }

      try {
        await saveDonationSettings(p.telegram_id, {
          donation_link: link || null,
          is_enabled: !!link
        });

        showToast(link ? 'Ссылка сохранена! Донаты включены ✅' : 'Донаты отключены');
        openProfile();

      } catch (e) {
        console.error('saveDonation error:', e);
        showToast(e.message || 'Не удалось сохранить настройки');
      }
    });

    // Убрать ссылку на донаты
    document.getElementById('removeDonationLinkBtn')?.addEventListener('click', async () => {
      try {
        await saveDonationSettings(p.telegram_id, {
          donation_link: null,
          is_enabled: false
        });

        showToast('Донаты отключены');
        openProfile();

      } catch (e) {
        console.error('removeDonation error:', e);
        showToast(e.message || 'Не удалось отключить донаты');
      }
    });

    // Переключение вкладок
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

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
    console.error('openProfile error:', e);

    main.innerHTML = `
      <div class="empty-state">
        <h2>Не удалось открыть профиль</h2>
        <p>${escapeHtml(e.message || 'Произошла ошибка')}</p>
        <button class="btn btn-primary" id="retryProfileBtn" type="button">
          Повторить
        </button>
      </div>
    `;

    document.getElementById('retryProfileBtn')?.addEventListener('click', openProfile);
  }
}
