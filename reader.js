// =========================================================
// Летопись — просмотр статьи
// =========================================================


// =========================================================
// Проверка владельца статьи
// =========================================================

function isArticleOwner(a) {
  return !!(
    tgUser &&
    a?.author_id &&
    Number(a.author_id) ===
      Number(tgUser.id)
  );
}


// =========================================================
// Открыть статью
// =========================================================

async function openReader(id) {
  state.view = 'reader';
  state.currentId = id;

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
    (article.blocks || [])
      .map(b => {

        if (b.type === 'text') {
          return b.html?.trim()
            ? `<p>${sanitizeHtml(
                b.html
              )}</p>`
            : '';
        }

        if (b.type === 'image') {
          return `
            <figure>

              <img
                src="${escapeHtml(
                  b.src || ''
                )}"
                alt=""
              >

              ${
                b.caption
                  ? `
                    <figcaption>
                      ${escapeHtml(
                        b.caption
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
              ? ` · ${escapeHtml(
                  article.author_name
                )}`
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
          '<p class="reader-empty">Статья пока пуста.</p>'
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
          Копировать ссылку
        </button>

      </div>

    </div>
  `;


  // =======================================================
  // Копирование ссылки
  // =======================================================

  document
    .getElementById('shareBtn')
    .onclick = async () => {

      try {

        if (
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(
            shareUrl
          );

          showToast(
            'Ссылка скопирована'
          );

          return;
        }

        const textarea =
          document.createElement(
            'textarea'
          );

        textarea.value =
          shareUrl;

        textarea.style.position =
          'fixed';

        textarea.style.opacity =
          '0';

        document.body.appendChild(
          textarea
        );

        textarea.focus();
        textarea.select();

        const copied =
          document.execCommand(
            'copy'
          );

        textarea.remove();

        if (copied) {
          showToast(
            'Ссылка скопирована'
          );
        } else {
          showToast(
            'Не удалось скопировать ссылку'
          );
        }

      } catch (e) {
        console.error(e);

        showToast(
          'Не удалось скопировать ссылку'
        );
      }
    };


  // =======================================================
  // Действия владельца
  // =======================================================

  if (owner) {

    document
      .getElementById('editBtn')
      .onclick =
        () => editArticle(article);

    document
      .getElementById('deleteBtn')
      .onclick = async () => {

        if (
          !confirm(
            'Удалить статью безвозвратно?'
          )
        ) {
          return;
        }

        const b =
          document.getElementById(
            'deleteBtn'
          );

        b.disabled = true;
        b.textContent =
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

        } catch (e) {

          b.disabled = false;
          b.textContent =
            'Удалить';

          showToast(
            e.message ||
            'Не удалось удалить статью'
          );
        }
      };
  }
}
