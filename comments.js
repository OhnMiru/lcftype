// =========================================================
// Летопись — комментарии к статье
// =========================================================


const COMMENT_REACTIONS = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢'
};


// =========================================================
// Получить комментарии
// =========================================================

async function fetchComments(articleId) {
  const r =
    await callTelegramApi(
      'get-article-comments',
      {
        articleId
      }
    );

  return Array.isArray(r.comments)
    ? r.comments
    : [];
}


// =========================================================
// Формат даты комментария
// =========================================================

function formatCommentDate(value) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  return date.toLocaleString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }
  );
}


// =========================================================
// Экранирование текста комментария
// =========================================================

function renderCommentText(text) {
  return escapeHtml(
    String(text || '')
  ).replace(
    /\n/g,
    '<br>'
  );
}


// =========================================================
// Построить дерево комментариев
// =========================================================

function buildCommentTree(comments) {

  const map =
    new Map();

  const roots = [];

  comments.forEach(comment => {
    map.set(
      comment.id,
      {
        ...comment,
        children: []
      }
    );
  });

  comments.forEach(comment => {

    const item =
      map.get(comment.id);

    if (!item) {
      return;
    }

    if (
      comment.parent_id &&
      map.has(comment.parent_id)
    ) {
      map
        .get(comment.parent_id)
        .children
        .push(item);

    } else {
      roots.push(item);
    }
  });

  return roots;
}


// =========================================================
// Одна реакция
// =========================================================

function renderCommentReaction(
  comment,
  type
) {

  const count =
    Number(
      comment?.reactions?.[type] || 0
    );

  const active =
    comment?.my_reaction === type;

  return `
    <button
      class="comment-reaction${
        active
          ? ' active'
          : ''
      }"
      type="button"
      data-comment-reaction="${type}"
      data-comment-id="${escapeHtml(
        comment.id
      )}"
      aria-label="${
        type
      }"
    >

      <span class="comment-reaction-emoji">
        ${COMMENT_REACTIONS[type]}
      </span>

      ${
        count > 0
          ? `
            <span class="comment-reaction-count">
              ${count}
            </span>
          `
          : ''
      }

    </button>
  `;
}


// =========================================================
// Рендер одного комментария
// =========================================================

function renderComment(
  comment,
  depth = 0
) {

  const reactions =
    Object.keys(
      COMMENT_REACTIONS
    )
      .map(
        type =>
          renderCommentReaction(
            comment,
            type
          )
      )
      .join('');

  const children =
    Array.isArray(
      comment.children
    )
      ? comment.children
      : [];

  return `
    <div
      class="comment-thread"
      data-comment-id="${escapeHtml(
        comment.id
      )}"
    >

      <article
        class="comment"
        style="--comment-depth:${Math.min(
          depth,
          2
        )}"
      >

        <div class="comment-head">

          <div class="comment-author">
            ${escapeHtml(
              comment.author_name ||
              'Пользователь'
            )}
          </div>

          <time class="comment-date">
            ${escapeHtml(
              formatCommentDate(
                comment.created_at
              )
            )}
          </time>

        </div>


        <div class="comment-content">
          ${renderCommentText(
            comment.content
          )}
        </div>


        <div class="comment-actions">

          <div class="comment-reactions">
            ${reactions}
          </div>

          <button
            class="comment-reply"
            type="button"
            data-comment-reply="${
              escapeHtml(comment.id)
            }"
          >
            Ответить
          </button>

        </div>


        <div
          class="comment-reply-form"
          data-reply-form="${
            escapeHtml(comment.id)
          }"
          hidden
        >

          <textarea
            class="comment-input"
            rows="2"
            maxlength="2000"
            placeholder="Ваш ответ…"
          ></textarea>

          <div class="comment-form-actions">

            <button
              class="btn btn-secondary comment-cancel-reply"
              type="button"
            >
              Отмена
            </button>

            <button
              class="btn btn-primary comment-send-reply"
              type="button"
              data-parent-id="${
                escapeHtml(comment.id)
              }"
            >
              Ответить
            </button>

          </div>

        </div>

      </article>


      ${
        children.length
          ? `
            <div class="comment-children">
              ${children
                .map(
                  child =>
                    renderComment(
                      child,
                      depth + 1
                    )
                )
                .join('')}
            </div>
          `
          : ''
      }

    </div>
  `;
}


// =========================================================
// Рендер блока комментариев
// =========================================================

async function renderComments(
  articleId
) {

  const container =
    document.getElementById(
      'articleComments'
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="comments-loading">
      Загружаем комментарии…
    </div>
  `;

  try {

    const comments =
      await fetchComments(
        articleId
      );

    const tree =
      buildCommentTree(
        comments
      );

    container.innerHTML = `
      <section class="comments-section">

        <div class="comments-title-row">

          <h2 class="comments-title">
            Комментарии
          </h2>

          <span class="comments-count">
            ${comments.length}
          </span>

        </div>


        <div class="comment-new-form">

          <textarea
            id="newCommentInput"
            class="comment-input"
            rows="3"
            maxlength="2000"
            placeholder="Написать комментарий…"
          ></textarea>

          <div class="comment-form-bottom">

            <span class="comment-limit">
              До 2000 символов
            </span>

            <button
              id="sendCommentBtn"
              class="btn btn-primary"
              type="button"
            >
              Комментировать
            </button>

          </div>

        </div>


        <div class="comments-list">

          ${
            tree.length
              ? tree
                  .map(
                    comment =>
                      renderComment(
                        comment
                      )
                  )
                  .join('')
              : `
                <div class="comments-empty">
                  Пока нет комментариев.
                  Будьте первым.
                </div>
              `
          }

        </div>

      </section>
    `;

    bindComments(
      articleId
    );

  } catch (e) {

    console.error(
      'renderComments:',
      e
    );

    container.innerHTML = `
      <section class="comments-section">

        <div class="comments-title-row">

          <h2 class="comments-title">
            Комментарии
          </h2>

        </div>

        <div class="comments-error">
          Не удалось загрузить комментарии.
        </div>

      </section>
    `;
  }
}


// =========================================================
// Отправить комментарий
// =========================================================

async function submitComment(
  articleId,
  content,
  parentId = null
) {

  const text =
    String(content || '')
      .trim();

  if (!text) {
    showToast(
      'Напишите комментарий'
    );

    return false;
  }

  if (text.length > 2000) {
    showToast(
      'Максимум 2000 символов'
    );

    return false;
  }


  // -------------------------------------------------------
  // Проверяем профиль
  // -------------------------------------------------------

  const profile =
    await ensureProfile(true);

  if (!profile) {
    return false;
  }


  await callTelegramApi(
    'create-comment',
    {
      articleId,
      content: text,
      parentId
    }
  );

  return true;
}


// =========================================================
// Привязка событий
// =========================================================

function bindComments(
  articleId
) {

  const send =
    document.getElementById(
      'sendCommentBtn'
    );

  const input =
    document.getElementById(
      'newCommentInput'
    );


  // -------------------------------------------------------
  // Новый комментарий
  // -------------------------------------------------------

  send?.addEventListener(
    'click',
    async () => {

      const text =
        input?.value || '';

      send.disabled = true;
      send.textContent =
        'Публикуем…';

      try {

        const ok =
          await submitComment(
            articleId,
            text
          );

        if (!ok) {
          return;
        }

        showToast(
          'Комментарий опубликован'
        );

        await renderComments(
          articleId
        );

      } catch (e) {

        showToast(
          e.message ||
          'Не удалось добавить комментарий'
        );

      } finally {

        send.disabled = false;
        send.textContent =
          'Комментировать';
      }
    }
  );


  // -------------------------------------------------------
  // Ответить
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '[data-comment-reply]'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const id =
            button.dataset.commentReply;

          const form =
            document.querySelector(
              `[data-reply-form="${CSS.escape(id)}"]`
            );

          if (!form) {
            return;
          }

          form.hidden =
            !form.hidden;

          if (!form.hidden) {

            form
              .querySelector(
                'textarea'
              )
              ?.focus();
          }
        }
      );
    });


  // -------------------------------------------------------
  // Отмена ответа
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '.comment-cancel-reply'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const form =
            button.closest(
              '.comment-reply-form'
            );

          if (form) {
            form.hidden = true;
          }
        }
      );
    });


  // -------------------------------------------------------
  // Отправка ответа
  // -------------------------------------------------------

  document
    .querySelectorAll(
      '.comment-send-reply'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        async () => {

          const parentId =
            button.dataset.parentId;

          const form =
            button.closest(
              '.comment-reply-form'
            );

          const input =
            form?.querySelector(
              'textarea'
            );

          if (!input) {
            return;
          }

          button.disabled = true;
          button.textContent =
            'Публикуем…';

          try {

            const ok =
              await submitComment(
                articleId,
                input.value,
                parentId
              );

            if (!ok) {
              return;
            }

            showToast(
              'Ответ опубликован'
            );

            await renderComments(
              articleId
            );

          } catch (e) {

            showToast(
              e.message ||
              'Не удалось добавить ответ'
            );

          } finally {

            button.disabled = false;
            button.textContent =
              'Ответить';
          }
        }
      );
    });


// -------------------------------------------------------
// Реакции
// -------------------------------------------------------

document
  .querySelectorAll(
    '[data-comment-reaction]'
  )
  .forEach(button => {

    button.addEventListener(
      'click',
      async () => {

        const commentId =
          button.dataset.commentId;

        const reactionType =
          button.dataset.commentReaction;

        if (
          !commentId ||
          !reactionType
        ) {
          return;
        }

        // Не даём нажать повторно,
        // пока запрос ещё выполняется
        button.disabled = true;

        try {

          const result =
            await callTelegramApi(
              'react-comment',
              {
                commentId,
                reactionType
              }
            );

          /*
           * Backend возвращает:
           *
           * {
           *   reactions: {
           *     counts: {...},
           *     total: ...,
           *     my_reaction: ...
           *   }
           * }
           */

          const reactions =
            result?.reactions;

          if (!reactions) {
            throw new Error(
              'Сервер не вернул данные реакции'
            );
          }


          // -------------------------------------------------
          // Обновляем только кнопки реакций
          // -------------------------------------------------

          const commentElement =
            document.querySelector(
              `.comment-thread[data-comment-id="${CSS.escape(commentId)}"]`
            );

          if (!commentElement) {
            return;
          }


          const reactionButtons =
            commentElement.querySelectorAll(
              '[data-comment-reaction]'
            );


          reactionButtons.forEach(
            reactionButton => {

              const type =
                reactionButton.dataset.commentReaction;

              if (!type) {
                return;
              }


              const count =
                Number(
                  reactions.counts?.[type] || 0
                );


              const isActive =
                reactions.my_reaction === type;


              // ---------------------------------------------
              // active
              // ---------------------------------------------

              reactionButton.classList.toggle(
                'active',
                isActive
              );


              // ---------------------------------------------
              // Счётчик
              // ---------------------------------------------

              let countElement =
                reactionButton.querySelector(
                  '.comment-reaction-count'
                );


              if (count > 0) {

                if (!countElement) {

                  countElement =
                    document.createElement(
                      'span'
                    );

                  countElement.className =
                    'comment-reaction-count';

                  reactionButton.appendChild(
                    countElement
                  );
                }

                countElement.textContent =
                  String(count);

              } else {

                countElement?.remove();
              }

            }
          );


        } catch (e) {

          console.error(
            'comment reaction:',
            e
          );

          showToast(
            e.message ||
            'Не удалось поставить реакцию'
          );

        } finally {

          button.disabled = false;

        }

      }
    );
}

  });
