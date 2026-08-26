// =========================================================
// Летопись — просмотр статьи
// =========================================================


// =========================================================
// Реакции статей
// =========================================================

const ARTICLE_REACTIONS = {
  like: '👍',
  love: '❤️',
  laugh: '🔥',
  wow: '😮',
  sad: '😢'
};


// =========================================================
// СПОЙЛЕРЫ В ЧИТАЛКЕ
// =========================================================

// Глобальный обработчик через делегирование событий
// Один обработчик на весь документ — работает с динамическими элементами
document.addEventListener('click', (e) => {
  const spoiler = e.target.closest('.reader-body .tg-spoiler');
  if (spoiler) {
    spoiler.classList.toggle('revealed');
  }
});


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
// Экранирование ID для CSS
// =========================================================

function escapeSelectorValue(value) {

  return CSS.escape(
    String(value || '')
  );
}


// =========================================================
// Рендер одной реакции статьи
// =========================================================

function renderArticleReaction(
  type,
  count,
  active
) {

  return `
    <button
      class="article-reaction${
        active
          ? ' active'
          : ''
      }"
      type="button"
      data-article-reaction="${escapeHtml(
        type
      )}"
      aria-label="${escapeHtml(
        type
      )}"
      aria-pressed="${
        active
          ? 'true'
          : 'false'
      }"
    >

      <span class="article-reaction-emoji">
        ${ARTICLE_REACTIONS[type]}
      </span>

      ${
        count > 0
          ? `
            <span class="article-reaction-count">
              ${count}
            </span>
          `
          : ''
      }

    </button>
  `;
}


// =========================================================
// Рендер блока реакций статьи
// =========================================================

function renderArticleReactionsHtml(
  reactions
) {

  const counts =
    reactions?.counts || {};

  const myReaction =
    reactions?.my_reaction || null;


  return `
    <div
      class="article-reactions"
      id="articleReactions"
    >

      <div class="article-reactions-list">

        ${
          Object.keys(
            ARTICLE_REACTIONS
          )
            .map(type => {

              const count =
                Number(
                  counts[type] || 0
                );

              const active =
                myReaction === type;

              return renderArticleReaction(
                type,
                count,
                active
              );

            })
            .join('')
        }

      </div>

    </div>
  `;
}


// =========================================================
// Получить реакции статьи
// =========================================================

async function fetchArticleReactions(
  articleId
) {

  const result =
    await callTelegramApi(
      'get-article-reactions',
      {
        articleId
      }
    );


  return (
    result?.reactions || {
      counts: {},
      total: 0,
      my_reaction: null
    }
  );
}


// =========================================================
// Обновить только реакции статьи
// =========================================================

function updateArticleReactions(
  reactions
) {

  const container =
    document.getElementById(
      'articleReactions'
    );


  if (!container) {
    return;
  }


  const counts =
    reactions?.counts || {};

  const myReaction =
    reactions?.my_reaction || null;


  const buttons =
    container.querySelectorAll(
      '[data-article-reaction]'
    );


  buttons.forEach(button => {

    const type =
      button.dataset.articleReaction;


    if (!type) {
      return;
    }


    const count =
      Number(
        counts[type] || 0
      );


    const active =
      myReaction === type;


    // -------------------------------------------------------
    // Активная реакция
    // -------------------------------------------------------

    button.classList.toggle(
      'active',
      active
    );


    button.setAttribute(
      'aria-pressed',
      active
        ? 'true'
        : 'false'
    );


    // -------------------------------------------------------
    // Счётчик
    // -------------------------------------------------------

    let countElement =
      button.querySelector(
        '.article-reaction-count'
      );


    if (count > 0) {

      if (!countElement) {

        countElement =
          document.createElement(
            'span'
          );

        countElement.className =
          'article-reaction-count';

        button.appendChild(
          countElement
        );
      }


      countElement.textContent =
        String(count);

    } else {

      countElement?.remove();

    }

  });
}


// =========================================================
// Привязка реакций статьи
// =========================================================

function bindArticleReactions(
  articleId
) {

  const container =
    document.getElementById(
      'articleReactions'
    );


  if (!container) {
    return;
  }


  const buttons =
    container.querySelectorAll(
      '[data-article-reaction]'
    );


  buttons.forEach(button => {

    button.addEventListener(
      'click',
      async () => {

        const reactionType =
          button.dataset.articleReaction;


        if (!articleId || !reactionType) {
          return;
        }


        // ---------------------------------------------------
        // Блокируем только нажатую кнопку
        // ---------------------------------------------------

        button.disabled = true;


        try {

          const result =
            await callTelegramApi(
              'react-article',
              {
                articleId,
                reactionType
              }
            );


          const reactions =
            result?.reactions;


          if (!reactions) {

            throw new Error(
              'Сервер не вернул данные реакции'
            );
          }


          // -------------------------------------------------
          // Обновляем только блок реакций статьи
          // -------------------------------------------------

          updateArticleReactions(
            reactions
          );


        } catch (e) {

          console.error(
            'article reaction:',
            e
          );


          showToast(
            e?.message ||
            'Не удалось поставить реакцию'
          );


        } finally {

          button.disabled = false;

        }

      }
    );

  });
}


// =========================================================
// Инициализация реакций статьи
// =========================================================

async function initArticleReactions(
  articleId
) {

  const container =
    document.getElementById(
      'articleReactions'
    );


  if (!container) {
    return;
  }


  try {

    const reactions =
      await fetchArticleReactions(
        articleId
      );


    updateArticleReactions(
      reactions
    );


    bindArticleReactions(
      articleId
    );


  } catch (e) {

    console.error(
      'initArticleReactions:',
      e
    );


    container.innerHTML = `
      <div class="article-reactions-error">
        Реакции временно недоступны.
      </div>
    `;

  }
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
  // Проверяем донаты автора
  // =======================================================

  const donationLink = await getDonationLink(article.author_id);


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
  // Загружаем начальные реакции
  // =======================================================

  let initialReactions = {
    counts: {},
    total: 0,
    my_reaction: null
  };


  try {

    initialReactions =
      await fetchArticleReactions(
        article.id
      );

  } catch (e) {

    console.error(
      'fetchArticleReactions:',
      e
    );

  }


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

          ${escapeHtml(fmtDate(article.created_at))}

          ${article.author_name ? `
            · 
            <span 
              class="author-clickable" 
              data-author-id="${escapeHtml(article.author_id)}" 
              data-author-name="${escapeHtml(article.author_name)}"
            >
              ${escapeHtml(article.author_name)}
            </span>
          ` : ''}

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
           ARTICLE REACTIONS
           ================================================= -->

      ${renderArticleReactionsHtml(
        initialReactions
      )}


      <!-- =================================================
           DONATE
           ================================================= -->

      ${donationLink ? `
        <div class="donate-box chrome">
          <button
            class="btn btn-primary donate-btn"
            id="donateBtn"
            type="button"
          >
            Поддержать автора
          </button>
        </div>
      ` : ''}


      <!-- =================================================
           SHARE
           ================================================= -->

      <div class="share-box chrome">

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
  // Делаем имена авторов кликабельными
  // =======================================================

  if (typeof makeAuthorClickable === 'function') {
    makeAuthorClickable(main);
  }


  // =======================================================
  // Донат — открывает ссылку CloudTips
  // =======================================================

  const donateBtn = document.getElementById('donateBtn');

  if (donateBtn && donationLink) {
    donateBtn.addEventListener('click', () => {
      // Открываем ссылку в новом окне
      window.open(donationLink, '_blank');
    });
  }


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
  // Реакции статьи
  // =======================================================

  bindArticleReactions(
    article.id
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

        editArticle(
          article
        );

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
