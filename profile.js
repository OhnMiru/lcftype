// =========================================================
// Летопись — профиль пользователя
// =========================================================


// =========================================================
// Получить профиль
// =========================================================

async function getProfile() {
  const r =
    await callTelegramApi(
      'get-profile'
    );

  state.profile =
    r.profile || null;

  return state.profile;
}


// =========================================================
// Сохранить профиль
// =========================================================

async function saveProfile(username) {
  const r =
    await callTelegramApi(
      'set-profile',
      {
        username
      }
    );

  state.profile = r.profile;

  return state.profile;
}


// =========================================================
// Проверить профиль
// =========================================================

async function ensureProfile(
  ask = true
) {
  const p = await getProfile();

  if (p) {
    return p;
  }

  return ask
    ? openUsernameDialog(null)
    : null;
}


// =========================================================
// Диалог создания / изменения ника
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
          Придумайте имя автора. Его будут видеть рядом с вашими статьями.
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

    const input =
      overlay.querySelector(
        '#profileUsernameInput'
      );

    const save =
      overlay.querySelector(
        '#profileSaveBtn'
      );

    const cancel =
      overlay.querySelector(
        '#profileCancelBtn'
      );

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    cancel.onclick = () => {
      overlay.remove();
      resolve(null);
    };

    save.onclick = async () => {
      const username =
        input.value
          .trim()
          .replace(/\s+/g, ' ');

      if (username.length < 2) {
        return showToast(
          'Минимум 2 символа'
        );
      }

      if (username.length > 30) {
        return showToast(
          'Максимум 30 символов'
        );
      }

      save.disabled = true;
      save.textContent =
        'Сохраняем…';

      try {
        const p =
          await saveProfile(
            username
          );

        overlay.remove();

        showToast(
          'Ник сохранён'
        );

        resolve(p);

      } catch (e) {
        showToast(
          e.message ||
          'Не удалось сохранить ник'
        );

        save.disabled = false;
        save.textContent =
          'Сохранить';
      }
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        save.click();
      }

      if (e.key === 'Escape') {
        cancel.click();
      }
    };
  });
}


// =========================================================
// Страница профиля
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
    const p =
      await ensureProfile(false);

    if (!p) {
      main.innerHTML = `
        <div class="profile-page">

          <div class="profile-card chrome">

            <div class="profile-avatar">
              ?
            </div>

            <h2>Профиль</h2>

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
        .onclick = async () => {
          if (
            await ensureProfile(true)
          ) {
            openProfile();
          }
        };

      return;
    }

    const first =
      p.username
        .trim()
        .charAt(0)
        .toUpperCase();

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
            class="btn btn-primary profile-edit-btn"
            id="changeUsernameBtn"
          >
            Изменить ник
          </button>

          <div class="profile-description">
            Этот ник отображается рядом с вашими статьями.
          </div>

        </div>

      </div>
    `;

    document
      .getElementById(
        'changeUsernameBtn'
      )
      .onclick = async () => {
        if (
          await openUsernameDialog(
            p.username
          )
        ) {
          openProfile();
        }
      };

  } catch (e) {
    main.innerHTML = `
      <div class="empty-state">

        <h2>
          Не удалось открыть профиль
        </h2>

        <p>
          ${escapeHtml(
            e.message || ''
          )}
        </p>

      </div>
    `;
  }
}
