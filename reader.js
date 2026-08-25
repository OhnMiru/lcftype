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

  if (!main) {
    console.error(
      'openReader: элемент #main не найден'
    );

    return;
  }

  main.innerHTML =
    '<div class="loading">Открываем статью…</div>';


  // =======================================================
  // Загрузка статьи
  // =======================================================

  let article;

  try {

    article =
      await fetchArticle(id);

  } catch (e) {

    console.error(
      'openReader:',
      e
    );

    main.innerHTML = `
      <div class="empty-state">

        <h2>
          Не удалось открыть статью
        </h2>

        <p>
          ${escapeHtml(
            e?.message ||
            'Произошла ошибка загрузки.'
          )}
        </p>

      </div>
    `;

    return;
  }


  // =======================================================
  // Статья не найдена
  // =======================================================

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


  // =======================================================
  // Тело статьи
  // =======================================================

  const bodyHtml =
    (Array.isArray(article.blocks)
      ? article.blocks
      : []
    )
      .map(b => {

        if (
          b?.type === 'text'
        ) {

          return b.html?.trim()
            ? `
              <p>
                ${sanitizeHtml(
                  b.html
                )}
              </p>
            `
            : '';
        }


        if (
          b?.type === 'image'
        ) {

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


  // =======================================================
  // Ссылка для шаринга
  // =======================================================

  const shareUrl =
    `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=${article.id}`;


  // =======================================================
  // Владелец статьи
  // =======================================================

  const owner =
    isArticleOwner(article);


  // =======================================================
  // Рендер статьи
  // =======================================================

  main.innerHTML = `
    <div class="reader">

      <!-- =================================================
           META
           ================================================= -->

      <div class="reader-meta reader-meta-row">

        <span>

          ${escapeHtml(
            fmtDate(
              article.created_at
            )
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
                  type="button"
                >
                  Редактировать
                </button>

                <button
                  class="btn btn-danger"
                  id="deleteBtn"
                  type="button"
                >
                  Удалить
                </button>

              </div>
            `
            : ''
        }

      </div>


      <!-- =================================================
           TITLE
           ================================================= -->

      <h1>
        ${escapeHtml(
          article.title ||
          'Без названия'
        )}
      </h1>


      <!-- =================================================
           ARTICLE BODY
           ================================================= -->

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


      <!-- =================================================
           SHARE
           ================================================= -->

      <div class="share-box chrome">

        <div class="share-box-label">
          Поделиться
        </div>

        <button
          class="btn btn-primary"
          id="shareBtn"
          type="button"
        >
          Копировать ссылку
        </button>

      </div>


      <!-- =================================================
           COMMENTS
           ================================================= -->

      <div
        id="articleComments"
        class="article-comments"
      ></div>

    </div>
  `;


  // =======================================================
  // Копирование ссылки
  // =======================================================

  const shareBtn =
    document.getElementById(
      'shareBtn'
    );


  shareBtn?.addEventListener(
    'click',
    async () => {

      try {

        // ---------------------------------------------------
        // Современный Clipboard API
        // ---------------------------------------------------

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


        // ---------------------------------------------------
        // Fallback для старых WebView
        // ---------------------------------------------------

        const textarea =
          document.createElement(
            'textarea'
          );

        textarea.value =
          shareUrl;

        textarea.style.position =
          'fixed';

        textarea.style.left =
          '-9999px';

        textarea.style.top =
          '0';

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

        console.error(
          'share:',
          e
        );

        showToast(
          'Не удалось скопировать ссылку'
        );
      }
    }
  );


  // =======================================================
  // Действия владельца статьи
  // =======================================================

  if (owner) {

    const editBtn =
      document.getElementById(
        'editBtn'
      );

    const deleteBtn =
      document.getElementById(
        'deleteBtn'
      );


    // -----------------------------------------------------
    // Редактирование
    // -----------------------------------------------------

    editBtn?.addEventListener(
      'click',
      () => {
        editArticle(article);
      }
    );


    // -----------------------------------------------------
    // Удаление
    // -----------------------------------------------------

    deleteBtn?.addEventListener(
      'click',
      async () => {

        if (
          !confirm(
            'Удалить статью безвозвратно?'
          )
        ) {
          return;
        }


        deleteBtn.disabled = true;

        deleteBtn.textContent =
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

          console.error(
            'delete-article:',
            e
          );


          deleteBtn.disabled =
            false;

          deleteBtn.textContent =
            'Удалить';


          showToast(
            e?.message ||
            'Не удалось удалить статью'
          );
        }
      }
    );
  }


  // =======================================================
  // Комментарии
  // =======================================================

  /*
   * renderComments находится в comments.js.
   *
   * Он:
   *
   * 1. Загружает комментарии статьи.
   * 2. Строит дерево ответов.
   * 3. Показывает форму нового комментария.
   * 4. Показывает ответы.
   * 5. Показывает реакции.
   * 6. Проверяет профиль перед публикацией.
   */

  if (
    typeof renderComments ===
    'function'
  ) {

    await renderComments(
      article.id
    );

  } else {

    console.error(
      'renderComments: функция не найдена. Проверьте подключение comments.js.'
    );

    const comments =
      document.getElementById(
        'articleComments'
      );

    if (comments) {

      comments.innerHTML = `
        <section class="comments-section">

          <div class="comments-title-row">

            <h2 class="comments-title">
              Комментарии
            </h2>

          </div>

          <div class="comments-error">
            Комментарии временно недоступны.
          </div>

        </section>
      `;
    }
  }
}
