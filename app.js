// =========================================================
// ЛЕТОПИСЬ — Telegram Mini App
// app.js
// =========================================================


// =========================================================
// НАСТРОЙКИ
// =========================================================

const BOT_USERNAME = 'your_bot_username';
const MINIAPP_SHORT_NAME = 'letopis';


// =========================================================
// SUPABASE / TELEGRAM
// =========================================================

const db =
  window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

const tg =
  window.Telegram
    ? window.Telegram.WebApp
    : null;


if (tg) {
  tg.ready();
  tg.expand();
}


const tgUser =
  tg &&
  tg.initDataUnsafe &&
  tg.initDataUnsafe.user
    ? tg.initDataUnsafe.user
    : null;


// =========================================================
// СОСТОЯНИЕ
// =========================================================

const state = {

  view: 'feed',

  articles: [],

  currentArticle: null,

  currentId: null,

  draft: null,

  profile: null,

  selectedAuthors: new Set(),

  search: '',

  sort: 'new',

  activeAuthorId: null,

  activeAuthorName: null

};


// =========================================================
// EDGE FUNCTION
// =========================================================

const EDGE_FUNCTION_URL =
  `${window.SUPABASE_URL}/functions/v1/telegram-api`;


// =========================================================
// TOAST
// =========================================================

function showToast(message) {

  const toast =
    document.getElementById('toast');

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add('show');

  clearTimeout(
    showToast._timer
  );

  showToast._timer =
    setTimeout(() => {

      toast.classList.remove('show');

    }, 2200);
}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(value) {

  const div =
    document.createElement('div');

  div.textContent =
    value == null
      ? ''
      : String(value);

  return div.innerHTML;
}


// =========================================================
// SANITIZE HTML
// =========================================================

const ALLOWED_TAGS =
  new Set([
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'BR',
    'SPAN',
    'DIV'
  ]);


function sanitizeHtml(html) {

  const wrapper =
    document.createElement('div');

  wrapper.innerHTML =
    html || '';

  function clean(node) {

    [
      ...node.childNodes
    ].forEach(child => {

      if (child.nodeType === 1) {

        if (
          !ALLOWED_TAGS.has(
            child.tagName
          )
        ) {

          const parent =
            child.parentNode;

          while (
            child.firstChild
          ) {

            parent.insertBefore(
              child.firstChild,
              child
            );

          }

          parent.removeChild(
            child
          );

          return;
        }

        [
          ...child.attributes
        ].forEach(attribute => {

          child.removeAttribute(
            attribute.name
          );

        });

        clean(child);

      } else if (
        child.nodeType !== 3
      ) {

        child.parentNode.removeChild(
          child
        );

      }

    });

  }

  clean(wrapper);

  return wrapper.innerHTML;
}


// =========================================================
// DATE
// =========================================================

function fmtDate(iso) {

  if (!iso) return '';

  return new Date(
    iso
  ).toLocaleDateString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }
  );
}


function fmtDateTime(iso) {

  if (!iso) return '';

  return new Date(
    iso
  ).toLocaleString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
  );

}


// =========================================================
// TELEGRAM BACK BUTTON
// =========================================================

function setBackButton(
  show,
  onClick
) {

  if (!tg || !tg.BackButton) {
    return;
  }

  try {

    if (
      setBackButton._last
    ) {

      tg.BackButton.offClick(
        setBackButton._last
      );

    }

  } catch (error) {
    console.warn(error);
  }


  if (show) {

    setBackButton._last =
      onClick;

    tg.BackButton.onClick(
      onClick
    );

    tg.BackButton.show();

  } else {

    setBackButton._last =
      null;

    tg.BackButton.hide();

  }

}


// =========================================================
// ВЫЗОВ EDGE FUNCTION
// =========================================================

async function callApi(
  action,
  payload = {}
) {

  if (
    !tg ||
    !tg.initData
  ) {

    throw new Error(
      'Приложение должно быть открыто внутри Telegram'
    );

  }


  const response =
    await fetch(
      EDGE_FUNCTION_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            action,
            initData:
              tg.initData,
            ...payload
          })
      }
    );


  let result;

  try {

    result =
      await response.json();

  } catch {

    throw new Error(
      'Сервер вернул некорректный ответ'
    );

  }


  if (
    !response.ok ||
    result.error
  ) {

    throw new Error(
      result.error ||
      'Ошибка сервера'
    );

  }


  return result;
}


// =========================================================
// ПРОФИЛЬ
// =========================================================

async function loadMyProfile() {

  try {

    const result =
      await callApi(
        'get-profile'
      );

    state.profile =
      result.profile || null;

    return state.profile;

  } catch (error) {

    console.error(
      'loadMyProfile:',
      error
    );

    state.profile =
      null;

    return null;
  }

}


// =========================================================
// СОХРАНЕНИЕ НИКА
// =========================================================

async function saveMyProfile(
  username
) {

  const result =
    await callApi(
      'set-profile',
      {
        username
      }
    );

  state.profile =
    result.profile;

  return state.profile;
}


// =========================================================
// ПОЛУЧЕНИЕ СТАТЕЙ
// =========================================================

async function fetchFeed() {

  const {
    data,
    error
  } =
    await db
      .from('articles')
      .select(
        `
        id,
        title,
        excerpt,
        cover,
        author_id,
        author_name,
        created_at,
        updated_at
        `
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      'fetchFeed:',
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// ОДНА СТАТЬЯ
// =========================================================

async function fetchArticle(id) {

  const {
    data,
    error
  } =
    await db
      .from('articles')
      .select('*')
      .eq(
        'id',
        id
      )
      .single();


  if (error) {

    console.error(
      'fetchArticle:',
      error
    );

    return null;
  }


  return data;
}


// =========================================================
// СТАТЬИ АВТОРА
// =========================================================

async function fetchAuthorArticles(
  authorId
) {

  const {
    data,
    error
  } =
    await db
      .from('articles')
      .select(
        `
        id,
        title,
        excerpt,
        cover,
        author_id,
        author_name,
        created_at,
        updated_at
        `
      )
      .eq(
        'author_id',
        authorId
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      'fetchAuthorArticles:',
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// КОММЕНТАРИИ
// =========================================================

async function fetchComments(
  articleId
) {

  const {
    data,
    error
  } =
    await db
      .from('article_comments')
      .select(
        `
        id,
        article_id,
        author_id,
        author_name,
        content,
        parent_id,
        created_at,
        updated_at
        `
      )
      .eq(
        'article_id',
        articleId
      )
      .order(
        'created_at',
        {
          ascending: true
        }
      );


  if (error) {

    console.error(
      'fetchComments:',
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// РЕАКЦИИ СТАТЬИ
// =========================================================

async function fetchArticleReactions(
  articleId
) {

  const {
    data,
    error
  } =
    await db
      .from('article_reactions')
      .select(
        `
        id,
        article_id,
        user_id,
        reaction_type,
        created_at
        `
      )
      .eq(
        'article_id',
        articleId
      );


  if (error) {

    console.error(
      'fetchArticleReactions:',
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// РЕАКЦИИ КОММЕНТАРИЕВ
// =========================================================

async function fetchCommentReactions(
  commentIds
) {

  if (!commentIds.length) {
    return [];
  }


  const {
    data,
    error
  } =
    await db
      .from('comment_reactions')
      .select(
        `
        id,
        comment_id,
        user_id,
        reaction_type,
        created_at
        `
      )
      .in(
        'comment_id',
        commentIds
      );


  if (error) {

    console.error(
      'fetchCommentReactions:',
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// МОИ СТАТЬИ
// =========================================================

async function fetchMyArticles() {

  if (!tgUser) {
    return [];
  }


  const {
    data,
    error
  } =
    await db
      .from('articles')
      .select('*')
      .eq(
        'author_id',
        tgUser.id
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// МОИ КОММЕНТАРИИ
// =========================================================

async function fetchMyComments() {

  if (!tgUser) {
    return [];
  }


  const {
    data,
    error
  } =
    await db
      .from('article_comments')
      .select(
        `
        id,
        article_id,
        author_id,
        author_name,
        content,
        parent_id,
        created_at
        `
      )
      .eq(
        'author_id',
        tgUser.id
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (error) {

    console.error(
      error
    );

    throw error;
  }


  return data || [];
}


// =========================================================
// ФИЛЬТРАЦИЯ
// =========================================================

function getFilteredArticles() {

  let articles =
    [...state.articles];


  const search =
    state.search
      .trim()
      .toLowerCase();


  if (search) {

    articles =
      articles.filter(
        article =>
          String(
            article.title || ''
          )
            .toLowerCase()
            .includes(search)
      );

  }


  if (
    state.selectedAuthors.size
  ) {

    articles =
      articles.filter(
        article =>
          state.selectedAuthors.has(
            String(
              article.author_id
            )
          )
      );

  }


  articles.sort(
    (a, b) => {

      const da =
        new Date(
          a.created_at
        ).getTime();

      const db =
        new Date(
          b.created_at
        ).getTime();

      return state.sort === 'new'
        ? db - da
        : da - db;

    }
  );


  return articles;
}


// =========================================================
// УНИКАЛЬНЫЕ АВТОРЫ
// =========================================================

function getAuthors() {

  const map =
    new Map();


  state.articles.forEach(
    article => {

      if (
        article.author_id == null
      ) {
        return;
      }


      const id =
        String(
          article.author_id
        );


      if (!map.has(id)) {

        map.set(
          id,
          {
            id,
            name:
              article.author_name ||
              'Пользователь'
          }
        );

      }

    }
  );


  return [
    ...map.values()
  ].sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        'ru'
      )
  );
}


// =========================================================
// КОНТРОЛЫ ЛЕНТЫ
// =========================================================

function renderFeedControls() {

  const authors =
    getAuthors();


  return `
    <div class="feed-controls chrome">

      <div class="search-wrap">
        <input
          type="search"
          id="articleSearch"
          class="search-input"
          placeholder="Поиск по названию"
          value="${escapeHtml(state.search)}"
          autocomplete="off"
        >
      </div>

      <div class="filter-wrap">
        <button
          type="button"
          class="filter-button"
          id="authorFilterBtn"
        >
          Автор
          <span class="filter-count" id="filterCount"></span>
        </button>

        <div
          class="author-filter-menu"
          id="authorFilterMenu"
          hidden
        >
          <div class="filter-menu-title">
            Авторы
          </div>

          <div class="author-filter-list">

            ${
              authors.length
                ? authors.map(
                    author => `
                      <label class="author-filter-item">

                        <input
                          type="checkbox"
                          class="author-filter-checkbox"
                          value="${escapeHtml(author.id)}"
                          ${
                            state.selectedAuthors.has(
                              author.id
                            )
                              ? 'checked'
                              : ''
                          }
                        >

                        <span>
                          ${escapeHtml(author.name)}
                        </span>

                      </label>
                    `
                  ).join('')
                : `
                  <div class="filter-empty">
                    Авторов пока нет
                  </div>
                `
            }

          </div>

          ${
            authors.length
              ? `
                <button
                  type="button"
                  class="filter-reset"
                  id="clearAuthorFilter"
                >
                  Сбросить фильтр
                </button>
              `
              : ''
          }

        </div>
      </div>

      <div class="sort-wrap">

        <select
          id="articleSort"
          class="sort-select"
        >
          <option
            value="new"
            ${
              state.sort === 'new'
                ? 'selected'
                : ''
            }
          >
            Новые → старые
          </option>

          <option
            value="old"
            ${
              state.sort === 'old'
                ? 'selected'
                : ''
            }
          >
            Старые → новые
          </option>
        </select>

      </div>

    </div>
  `;
}


// =========================================================
// ПОДКЛЮЧЕНИЕ КОНТРОЛОВ
// =========================================================

function bindFeedControls() {

  const search =
    document.getElementById(
      'articleSearch'
    );

  if (search) {

    search.addEventListener(
      'input',
      event => {

        state.search =
          event.target.value;

        renderFeedResults();

      }
    );

  }


  const sort =
    document.getElementById(
      'articleSort'
    );

  if (sort) {

    sort.addEventListener(
      'change',
      event => {

        state.sort =
          event.target.value;

        renderFeedResults();

      }
    );

  }


  const filterButton =
    document.getElementById(
      'authorFilterBtn'
    );

  const filterMenu =
    document.getElementById(
      'authorFilterMenu'
    );


  if (
    filterButton &&
    filterMenu
  ) {

    filterButton.addEventListener(
      'click',
      event => {

        event.stopPropagation();

        filterMenu.hidden =
          !filterMenu.hidden;

      }
    );


    filterMenu.addEventListener(
      'click',
      event => {
        event.stopPropagation();
      }
    );


    document.addEventListener(
      'click',
      () => {

        filterMenu.hidden =
          true;

      },
      {
        once: false
      }
    );

  }


  document
    .querySelectorAll(
      '.author-filter-checkbox'
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          'change',
          event => {

            const id =
              String(
                event.target.value
              );


            if (
              event.target.checked
            ) {

              state.selectedAuthors.add(
                id
              );

            } else {

              state.selectedAuthors.delete(
                id
              );

            }


            updateFilterCount();

            renderFeedResults();

          }
        );

      }
    );


  const clear =
    document.getElementById(
      'clearAuthorFilter'
    );


  if (clear) {

    clear.addEventListener(
      'click',
      () => {

        state.selectedAuthors.clear();

        document
          .querySelectorAll(
            '.author-filter-checkbox'
          )
          .forEach(
            checkbox => {
              checkbox.checked =
                false;
            }
          );

        updateFilterCount();

        renderFeedResults();

      }
    );

  }


  updateFilterCount();

}


// =========================================================
// СЧЁТЧИК ФИЛЬТРА
// =========================================================

function updateFilterCount() {

  const count =
    document.getElementById(
      'filterCount'
    );

  if (!count) return;


  count.textContent =
    state.selectedAuthors.size
      ? `(${state.selectedAuthors.size})`
      : '';

}


// =========================================================
// РЕЗУЛЬТАТЫ ЛЕНТЫ
// =========================================================

function renderFeedResults() {

  const host =
    document.getElementById(
      'feedResults'
    );

  if (!host) return;


  const articles =
    getFilteredArticles();


  if (!articles.length) {

    host.innerHTML = `
      <div class="empty-state">
        <h2>Ничего не найдено</h2>
        <p>
          Попробуйте изменить поиск
          или фильтр автора.
        </p>
      </div>
    `;

    return;
  }


  host.innerHTML =
    articles.map(
      article => `

        <div
          class="feed-item"
          data-id="${escapeHtml(article.id)}"
        >

          ${
            article.cover
              ? `
                <img
                  class="thumb"
                  src="${escapeHtml(article.cover)}"
                  alt=""
                  loading="lazy"
                >
              `
              : ''
          }

          <div class="feed-content">

            <div class="feed-meta">
              ${fmtDate(article.created_at)}
            </div>

            <h3>
              ${escapeHtml(
                article.title ||
                'Без названия'
              )}
            </h3>

            ${
              article.excerpt
                ? `
                  <p>
                    ${escapeHtml(
                      article.excerpt
                    )}
                  </p>
                `
                : ''
            }

            ${
              article.author_name
                ? `
                  <div
                    class="feed-author"
                    data-author-id="${escapeHtml(
                      String(article.author_id || '')
                    )}"
                  >
                    ${escapeHtml(
                      article.author_name
                    )}
                  </div>
                `
                : ''
            }

          </div>

        </div>
      `
    ).join('');


  host
    .querySelectorAll(
      '.feed-item'
    )
    .forEach(
      item => {

        item.addEventListener(
          'click',
          event => {

            if (
              event.target.closest(
                '.feed-author'
              )
            ) {
              return;
            }

            openReader(
              item.dataset.id
            );

          }
        );

      }
    );


  host
    .querySelectorAll(
      '.feed-author'
    )
    .forEach(
      author => {

        author.addEventListener(
          'click',
          event => {

            event.stopPropagation();

            openAuthorProfile(
              author.dataset.authorId,
              author.textContent.trim()
            );

          }
        );

      }
    );

}


// =========================================================
// ЛЕНТА
// =========================================================

async function renderFeed() {

  state.view =
    'feed';

  state.currentArticle =
    null;

  state.currentId =
    null;

  state.activeAuthorId =
    null;

  state.activeAuthorName =
    null;


  setBackButton(
    false
  );


  const main =
    document.getElementById(
      'main'
    );


  main.innerHTML =
    '<div class="loading">Загрузка статей…</div>';


  try {

    state.articles =
      await fetchFeed();


    main.innerHTML = `

      ${renderFeedControls()}

      <div id="feedResults"></div>

    `;


    bindFeedControls();

    renderFeedResults();


  } catch (error) {

    console.error(error);

    main.innerHTML = `
      <div class="empty-state">
        <h2>Не удалось загрузить статьи</h2>
        <p>
          ${escapeHtml(
            error.message ||
            'Попробуйте ещё раз.'
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// SHARE URL
// =========================================================

function getArticleShareUrl(
  articleId
) {

  return (
    `https://t.me/` +
    `${BOT_USERNAME}/` +
    `${MINIAPP_SHORT_NAME}` +
    `?startapp=` +
    encodeURIComponent(
      articleId
    )
  );

}


// =========================================================
// COPY LINK
// =========================================================

async function copyArticleLink(
  article
) {

  const url =
    getArticleShareUrl(
      article.id
    );


  try {

    await navigator.clipboard.writeText(
      url
    );

    showToast(
      'Ссылка скопирована'
    );

    return;

  } catch (error) {

    console.warn(
      'Clipboard API failed:',
      error
    );

  }


  const textarea =
    document.createElement(
      'textarea'
    );

  textarea.value =
    url;

  textarea.style.position =
    'fixed';

  textarea.style.opacity =
    '0';

  document.body.appendChild(
    textarea
  );

  textarea.select();


  try {

    document.execCommand(
      'copy'
    );

    showToast(
      'Ссылка скопирована'
    );

  } catch {

    showToast(
      'Не удалось скопировать ссылку'
    );

  }


  textarea.remove();

}


// =========================================================
// РЕНДЕР БЛОКОВ СТАТЬИ
// =========================================================

function renderArticleBlocks(
  blocks
) {

  if (
    !Array.isArray(blocks)
  ) {

    return '';

  }


  return blocks
    .map(
      block => {

        if (
          block.type === 'text'
        ) {

          const html =
            sanitizeHtml(
              block.html || ''
            );

          return html.trim()
            ? `<p>${html}</p>`
            : '';

        }


        if (
          block.type === 'image'
        ) {

          return `
            <figure>

              <img
                src="${escapeHtml(
                  block.src || ''
                )}"
                alt=""
                loading="lazy"
              >

              ${
                block.caption
                  ? `
                    <figcaption>
                      ${escapeHtml(
                        block.caption
                      )}
                    </figcaption>
                  `
                  : ''
              }

            </figure>
          `;

        }


        return '';

      }
    )
    .join('');

}


// =========================================================
// РЕАКЦИИ — ГРУППИРОВКА
// =========================================================

function groupReactions(
  reactions
) {

  const result = {

    like: 0,
    love: 0,
    laugh: 0,
    wow: 0,
    sad: 0

  };


  reactions.forEach(
    reaction => {

      if (
        result[
          reaction.reaction_type
        ] !== undefined
      ) {

        result[
          reaction.reaction_type
        ]++;

      }

    }
  );


  return result;
}


// =========================================================
// ТЕКУЩАЯ РЕАКЦИЯ ПОЛЬЗОВАТЕЛЯ
// =========================================================

function getMyReaction(
  reactions
) {

  if (!tgUser) {
    return null;
  }


  const found =
    reactions.find(
      reaction =>
        Number(
          reaction.user_id
        ) ===
        Number(
          tgUser.id
        )
    );


  return found
    ? found.reaction_type
    : null;
}


// =========================================================
// БЛОК РЕАКЦИЙ СТАТЬИ
// =========================================================

function renderArticleReactions(
  reactions
) {

  const counts =
    groupReactions(
      reactions
    );


  const mine =
    getMyReaction(
      reactions
    );


  const buttons = [

    ['like', '👍'],
    ['love', '❤️'],
    ['laugh', '😂'],
    ['wow', '😮'],
    ['sad', '😢']

  ];


  return `

    <div class="article-reactions">

      ${
        buttons.map(
          ([type, emoji]) => `

            <button
              type="button"
              class="reaction-btn ${
                mine === type
                  ? 'active'
                  : ''
              }"
              data-reaction="${type}"
            >

              <span>
                ${emoji}
              </span>

              <b>
                ${counts[type] || 0}
              </b>

            </button>

          `
        ).join('')
      }

    </div>

  `;

}


// =========================================================
// УСТАНОВКА РЕАКЦИИ НА СТАТЬЮ
// =========================================================

async function setArticleReaction(
  articleId,
  reactionType
) {

  await callApi(
    'set-article-reaction',
    {
      articleId,
      reactionType
    }
  );

}


// =========================================================
// КОММЕНТАРИЙ: ДЕРЕВО
// =========================================================

function buildCommentTree(
  comments
) {

  const map =
    new Map();


  comments.forEach(
    comment => {

      map.set(
        comment.id,
        {
          ...comment,
          children: []
        }
      );

    }
  );


  const roots = [];


  comments.forEach(
    comment => {

      const current =
        map.get(
          comment.id
        );


      if (
        comment.parent_id &&
        map.has(
          comment.parent_id
        )
      ) {

        map
          .get(
            comment.parent_id
          )
          .children
          .push(
            current
          );

      } else {

        roots.push(
          current
        );

      }

    }
  );


  return roots;
}


// =========================================================
// РЕНДЕР ОДНОГО КОММЕНТАРИЯ
// =========================================================

function renderComment(
  comment,
  reactionMap,
  depth = 0
) {

  const reactions =
    reactionMap[
      comment.id
    ] || [];


  const counts =
    groupReactions(
      reactions
    );


  const mine =
    getMyReaction(
      reactions
    );


  const isMine =
    tgUser &&
    Number(
      comment.author_id
    ) ===
    Number(
      tgUser.id
    );


  return `

    <div
      class="comment"
      data-comment-id="${escapeHtml(comment.id)}"
      style="--comment-depth:${Math.min(depth, 4)}"
    >

      <div class="comment-head">

        <button
          type="button"
          class="comment-author"
          data-author-id="${escapeHtml(
            String(comment.author_id)
          )}"
        >
          ${escapeHtml(
            comment.author_name ||
            'Пользователь'
          )}
        </button>

        <span class="comment-date">
          ${fmtDateTime(
            comment.created_at
          )}
        </span>

      </div>


      <div class="comment-content">
        ${escapeHtml(
          comment.content
        )}
      </div>


      <div class="comment-actions">

        <button
          type="button"
          class="comment-reply-btn"
          data-comment-id="${escapeHtml(comment.id)}"
        >
          Ответить
        </button>


        ${
          isMine
            ? `
              <button
                type="button"
                class="comment-delete-btn"
                data-comment-id="${escapeHtml(comment.id)}"
              >
                Удалить
              </button>
            `
            : ''
        }


        <div class="comment-reactions">

          <button
            type="button"
            class="comment-reaction-btn ${
              mine === 'like'
                ? 'active'
                : ''
            }"
            data-comment-id="${escapeHtml(comment.id)}"
            data-reaction="like"
          >
            👍 ${counts.like || 0}
          </button>

          <button
            type="button"
            class="comment-reaction-btn ${
              mine === 'love'
                ? 'active'
                : ''
            }"
            data-comment-id="${escapeHtml(comment.id)}"
            data-reaction="love"
          >
            ❤️ ${counts.love || 0}
          </button>

        </div>

      </div>


      ${
        comment.children &&
        comment.children.length
          ? `
            <div class="comment-children">

              ${
                comment.children
                  .map(
                    child =>
                      renderComment(
                        child,
                        reactionMap,
                        depth + 1
                      )
                  )
                  .join('')
              }

            </div>
          `
          : ''
      }

    </div>

  `;

}


// =========================================================
// БЛОК КОММЕНТАРИЕВ
// =========================================================

function renderCommentsSection(
  comments,
  commentReactions
) {

  const tree =
    buildCommentTree(
      comments
    );


  const reactionMap = {};


  commentReactions.forEach(
    reaction => {

      if (
        !reactionMap[
          reaction.comment_id
        ]
      ) {

        reactionMap[
          reaction.comment_id
        ] = [];

      }


      reactionMap[
        reaction.comment_id
      ].push(
        reaction
      );

    }
  );


  return `

    <section
      class="comments-section"
      id="commentsSection"
    >

      <h2>
        Комментарии
        <span>
          ${comments.length}
        </span>
      </h2>


      <div
        class="comment-form"
        id="commentForm"
      >

        <textarea
          id="commentInput"
          class="comment-input"
          rows="3"
          maxlength="2000"
          placeholder="Напишите комментарий…"
        ></textarea>


        <div class="comment-form-bottom">

          <span
            class="reply-indicator"
            id="replyIndicator"
            hidden
          ></span>

          <button
            type="button"
            class="btn btn-primary"
            id="sendCommentBtn"
          >
            Комментировать
          </button>

        </div>

      </div>


      <div
        id="commentsList"
        class="comments-list"
      >

        ${
          tree.length
            ? tree
                .map(
                  comment =>
                    renderComment(
                      comment,
                      reactionMap
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

}


// =========================================================
// ДОБАВЛЕНИЕ КОММЕНТАРИЯ
// =========================================================

async function addComment(
  articleId,
  content,
  parentId = null
) {

  return await callApi(
    'add-comment',
    {
      articleId,
      content,
      parentId
    }
  );

}


// =========================================================
// УДАЛЕНИЕ КОММЕНТАРИЯ
// =========================================================

async function deleteComment(
  commentId
) {

  return await callApi(
    'delete-comment',
    {
      commentId
    }
  );

}


// =========================================================
// РЕАКЦИЯ КОММЕНТАРИЯ
// =========================================================

async function setCommentReaction(
  commentId,
  reactionType
) {

  return await callApi(
    'set-comment-reaction',
    {
      commentId,
      reactionType
    }
  );

}


// =========================================================
// ПРОФИЛЬ АВТОРА
// =========================================================

async function openAuthorProfile(
  authorId,
  authorName
) {

  state.view =
    'author';

  state.activeAuthorId =
    authorId;

  state.activeAuthorName =
    authorName;


  setBackButton(
    true,
    renderFeed
  );


  const main =
    document.getElementById(
      'main'
    );


  main.innerHTML =
    '<div class="loading">Загрузка статей автора…</div>';


  try {

    const articles =
      await fetchAuthorArticles(
        authorId
      );


    main.innerHTML = `

      <div class="author-page">

        <div class="author-page-head">

          <button
            type="button"
            class="author-back-btn"
            id="authorBackBtn"
          >
            ← Назад
          </button>

          <div>

            <div class="author-page-label">
              Автор
            </div>

            <h1>
              ${escapeHtml(
                authorName ||
                'Пользователь'
              )}
            </h1>

            <div class="author-page-count">
              Статей: ${articles.length}
            </div>

          </div>

        </div>


        <div
          class="author-articles"
          id="authorArticles"
        >

          ${
            articles.length
              ? articles.map(
                  article => `

                    <div
                      class="feed-item"
                      data-id="${escapeHtml(article.id)}"
                    >

                      ${
                        article.cover
                          ? `
                            <img
                              class="thumb"
                              src="${escapeHtml(
                                article.cover
                              )}"
                              alt=""
                              loading="lazy"
                            >
                          `
                          : ''
                      }

                      <div class="feed-content">

                        <div class="feed-meta">
                          ${fmtDate(
                            article.created_at
                          )}
                        </div>

                        <h3>
                          ${escapeHtml(
                            article.title ||
                            'Без названия'
                          )}
                        </h3>

                        ${
                          article.excerpt
                            ? `
                              <p>
                                ${escapeHtml(
                                  article.excerpt
                                )}
                              </p>
                            `
                            : ''
                        }

                      </div>

                    </div>

                  `
                ).join('')
              : `
                <div class="empty-state">
                  <h2>
                    Пока нет статей
                  </h2>
                </div>
              `
          }

        </div>

      </div>

    `;


    document
      .getElementById(
        'authorBackBtn'
      )
      .addEventListener(
        'click',
        renderFeed
      );


    main
      .querySelectorAll(
        '.feed-item'
      )
      .forEach(
        item => {

          item.addEventListener(
            'click',
            () =>
              openReader(
                item.dataset.id
              )
          );

        }
      );


  } catch (error) {

    console.error(error);

    main.innerHTML = `
      <div class="empty-state">
        <h2>Не удалось загрузить статьи</h2>
        <p>
          ${escapeHtml(
            error.message
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// ЧТЕНИЕ СТАТЬИ
// =========================================================

async function openReader(
  id
) {

  state.view =
    'reader';

  state.currentId =
    id;


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


  try {

    const article =
      await fetchArticle(
        id
      );


    if (!article) {

      main.innerHTML = `
        <div class="empty-state">
          <h2>Статья не найдена</h2>
          <p>
            Возможно, её удалили.
          </p>
        </div>
      `;

      return;
    }


    state.currentArticle =
      article;


    const [
      articleReactions,
      comments
    ] =
      await Promise.all([
        fetchArticleReactions(
          article.id
        ),
        fetchComments(
          article.id
        )
      ]);


    const commentIds =
      comments.map(
        comment => comment.id
      );


    const commentReactions =
      await fetchCommentReactions(
        commentIds
      );


    const bodyHtml =
      renderArticleBlocks(
        article.blocks
      );


    const shareUrl =
      getArticleShareUrl(
        article.id
      );


    const isOwner =
      tgUser &&
      Number(
        article.author_id
      ) ===
      Number(
        tgUser.id
      );


    main.innerHTML = `

      <div class="reader">

        <div class="reader-meta">

          <span>
            ${fmtDate(
              article.created_at
            )}
          </span>


          ${
            isOwner
              ? `
                <button
                  class="btn btn-danger"
                  id="deleteBtn"
                  type="button"
                >
                  Удалить
                </button>
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


        ${
          article.author_name
            ? `
              <button
                type="button"
                class="reader-author"
                id="readerAuthorBtn"
              >
                ${escapeHtml(
                  article.author_name
                )}
              </button>
            `
            : ''
        }


        <div class="reader-body">
          ${
            bodyHtml ||
            `
              <p class="empty-text">
                Статья пока пуста.
              </p>
            `
          }
        </div>


        <div class="article-actions chrome">

          ${renderArticleReactions(
            articleReactions
          )}


          <button
            type="button"
            class="btn btn-primary share-btn"
            id="shareBtn"
          >
            Поделиться
          </button>

        </div>


        <div
          id="commentsHost"
        >
          ${renderCommentsSection(
            comments,
            commentReactions
          )}
        </div>

      </div>

    `;


    // -----------------------------------------------------
    // Автор
    // -----------------------------------------------------

    const authorBtn =
      document.getElementById(
        'readerAuthorBtn'
      );


    if (authorBtn) {

      authorBtn.addEventListener(
        'click',
        () => {

          openAuthorProfile(
            article.author_id,
            article.author_name
          );

        }
      );

    }


    // -----------------------------------------------------
    // Поделиться
    // -----------------------------------------------------

    const shareBtn =
      document.getElementById(
        'shareBtn'
      );


    if (shareBtn) {

      shareBtn.addEventListener(
        'click',
        () =>
          copyArticleLink(
            article
          )
      );

    }


    // -----------------------------------------------------
    // Реакции статьи
    // -----------------------------------------------------

    document
      .querySelectorAll(
        '.reaction-btn'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            async () => {

              try {

                await setArticleReaction(
                  article.id,
                  button.dataset.reaction
                );


                await refreshReader(
                  article.id
                );


              } catch (error) {

                console.error(
                  error
                );

                showToast(
                  error.message ||
                  'Не удалось поставить реакцию'
                );

              }

            }
          );

        }
      );


    // -----------------------------------------------------
    // Комментарий
    // -----------------------------------------------------

    let replyTo =
      null;


    const commentInput =
      document.getElementById(
        'commentInput'
      );


    const replyIndicator =
      document.getElementById(
        'replyIndicator'
      );


    function clearReply() {

      replyTo =
        null;

      if (replyIndicator) {

        replyIndicator.hidden =
          true;

        replyIndicator.textContent =
          '';

      }

    }


    document
      .querySelectorAll(
        '.comment-reply-btn'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            () => {

              replyTo =
                button.dataset.commentId;


              const comment =
                comments.find(
                  item =>
                    item.id ===
                    replyTo
                );


              if (
                replyIndicator
              ) {

                replyIndicator.hidden =
                  false;

                replyIndicator.innerHTML = `
                  Ответ пользователю
                  <b>
                    ${escapeHtml(
                      comment
                        ? comment.author_name
                        : 'Пользователю'
                    )}
                  </b>

                  <button
                    type="button"
                    id="cancelReplyBtn"
                  >
                    ×
                  </button>
                `;


                const cancel =
                  document.getElementById(
                    'cancelReplyBtn'
                  );


                if (cancel) {

                  cancel.addEventListener(
                    'click',
                    clearReply
                  );

                }

              }


              commentInput.focus();

            }
          );

        }
      );


    const sendCommentBtn =
      document.getElementById(
        'sendCommentBtn'
      );


    if (sendCommentBtn) {

      sendCommentBtn.addEventListener(
        'click',
        async () => {

          const content =
            commentInput.value.trim();


          if (!content) {

            showToast(
              'Напишите комментарий'
            );

            return;

          }


          sendCommentBtn.disabled =
            true;


          try {

            await addComment(
              article.id,
              content,
              replyTo
            );


            commentInput.value =
              '';

            clearReply();

            showToast(
              'Комментарий добавлен'
            );


            await refreshReader(
              article.id
            );


          } catch (error) {

            console.error(
              error
            );

            showToast(
              error.message ||
              'Не удалось добавить комментарий'
            );

          } finally {

            sendCommentBtn.disabled =
              false;

          }

        }
      );

    }


    // -----------------------------------------------------
    // Удаление комментариев
    // -----------------------------------------------------

    document
      .querySelectorAll(
        '.comment-delete-btn'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            async () => {

              if (
                !confirm(
                  'Удалить комментарий?'
                )
              ) {
                return;
              }


              try {

                await deleteComment(
                  button.dataset.commentId
                );


                showToast(
                  'Комментарий удалён'
                );


                await refreshReader(
                  article.id
                );


              } catch (error) {

                console.error(
                  error
                );

                showToast(
                  error.message ||
                  'Не удалось удалить комментарий'
                );

              }

            }
          );

        }
      );


    // -----------------------------------------------------
    // Реакции комментариев
    // -----------------------------------------------------

    document
      .querySelectorAll(
        '.comment-reaction-btn'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            async () => {

              try {

                await setCommentReaction(
                  button.dataset.commentId,
                  button.dataset.reaction
                );


                await refreshReader(
                  article.id
                );


              } catch (error) {

                console.error(
                  error
                );

                showToast(
                  error.message ||
                  'Не удалось поставить реакцию'
                );

              }

            }
          );

        }
      );


    // -----------------------------------------------------
    // Удаление статьи
    // -----------------------------------------------------

    const deleteBtn =
      document.getElementById(
        'deleteBtn'
      );


    if (deleteBtn) {

      deleteBtn.addEventListener(
        'click',
        async () => {

          if (
            !confirm(
              'Удалить статью безвозвратно?'
            )
          ) {

            return;

          }


          try {

            await callApi(
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


          } catch (error) {

            console.error(
              error
            );

            showToast(
              error.message ||
              'Не удалось удалить статью'
            );

          }

        }
      );

    }


  } catch (error) {

    console.error(
      'openReader:',
      error
    );


    main.innerHTML = `
      <div class="empty-state">
        <h2>
          Не удалось открыть статью
        </h2>

        <p>
          ${escapeHtml(
            error.message ||
            'Попробуйте ещё раз.'
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// ПЕРЕЗАГРУЗКА СТАТЬИ
// =========================================================

async function refreshReader(
  id
) {

  if (
    state.view !== 'reader'
  ) {

    return;

  }


  await openReader(
    id
  );

}


// =========================================================
// НОВЫЙ ЧЕРНОВИК
// =========================================================

function newDraft() {

  return {

    title: '',

    blocks: [
      {
        type: 'text',
        html: ''
      }
    ]

  };

}


// =========================================================
// КОМПРЕССИЯ ИЗОБРАЖЕНИЯ
// =========================================================

function compressImageFile(
  file,
  maxW = 1200,
  quality = 0.82
) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload =
        event => {

          const img =
            new Image();


          img.onload =
            () => {

              let width =
                img.width;

              let height =
                img.height;


              if (
                width > maxW
              ) {

                height =
                  Math.round(
                    height *
                    (maxW / width)
                  );

                width =
                  maxW;

              }


              const canvas =
                document.createElement(
                  'canvas'
                );


              canvas.width =
                width;

              canvas.height =
                height;


              const context =
                canvas.getContext(
                  '2d'
                );


              context.drawImage(
                img,
                0,
                0,
                width,
                height
              );


              resolve(
                canvas.toDataURL(
                  'image/jpeg',
                  quality
                )
              );

            };


          img.onerror =
            reject;


          img.src =
            event.target.result;

        };


      reader.onerror =
        reject;


      reader.readAsDataURL(
        file
      );

    }
  );

}


// =========================================================
// ЗАГРУЗКА ИЗОБРАЖЕНИЯ
// =========================================================

async function uploadImage(
  dataUrl,
  filename
) {

  const response =
    await fetch(
      dataUrl
    );


  const blob =
    await response.blob();


  const safeName =
    String(
      filename || 'image.jpg'
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );


  const path =
    `${Date.now()}-` +
    `${Math.random()
      .toString(36)
      .slice(2, 10)}-` +
    safeName;


  const {
    error
  } =
    await db
      .storage
      .from('images')
      .upload(
        path,
        blob,
        {
          contentType:
            blob.type ||
            'image/jpeg',
          upsert: false
        }
      );


  if (error) {
    throw error;
  }


  const {
    data
  } =
    db
      .storage
      .from('images')
      .getPublicUrl(
        path
      );


  return data.publicUrl;

}


// =========================================================
// РЕДАКТОР
// =========================================================

let activeBlockEl =
  null;


function openEditor() {

  state.view =
    'editor';

  state.draft =
    newDraft();


  setBackButton(
    true,
    () => {

      if (
        confirm(
          'Отменить редактирование? Черновик будет потерян.'
        )
      ) {

        renderFeed();

      }

    }
  );


  renderEditor();

}


// =========================================================
// RENDER EDITOR
// =========================================================

function renderEditor() {

  const main =
    document.getElementById(
      'main'
    );


  const draft =
    state.draft;


  main.innerHTML = `

    <div class="editor">

      <input
        class="editor-title-input"
        id="titleInput"
        placeholder="Заголовок статьи"
        value="${escapeHtml(
          draft.title
        )}"
      >


      <div
        class="toolbar chrome"
        id="toolbar"
      >

        <button
          type="button"
          data-cmd="bold"
        >
          B
        </button>

        <button
          type="button"
          data-cmd="italic"
        >
          I
        </button>

        <button
          type="button"
          data-cmd="underline"
        >
          U
        </button>

      </div>


      <div id="blocksHost"></div>


      <div class="add-row">

        <button
          type="button"
          class="add-btn"
          id="addTextBtn"
        >
          ＋ Текст
        </button>

        <button
          type="button"
          class="add-btn"
          id="addImageBtn"
        >
          ＋ Картинка
        </button>

      </div>


      <button
        type="button"
        class="btn btn-primary"
        id="publishBtn"
        style="width:100%;padding:14px;"
      >
        Опубликовать
      </button>


      <input
        type="file"
        accept="image/*"
        id="fileInput"
        style="display:none"
      >


      <div
        class="hint chrome"
        id="editorHint"
      ></div>

    </div>

  `;


  document
    .getElementById(
      'titleInput'
    )
    .addEventListener(
      'input',
      event => {

        draft.title =
          event.target.value;

      }
    );


  document
    .getElementById(
      'toolbar'
    )
    .querySelectorAll(
      'button'
    )
    .forEach(
      button => {

        button.addEventListener(
          'mousedown',
          event => {

            event.preventDefault();


            if (
              !activeBlockEl
            ) {

              return;

            }


            document.execCommand(
              button.dataset.cmd,
              false,
              null
            );


            activeBlockEl.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true
                }
              )
            );

          }
        );

      }
    );


  document
    .getElementById(
      'addTextBtn'
    )
    .addEventListener(
      'click',
      () => {

        draft.blocks.push(
          {
            type: 'text',
            html: ''
          }
        );


        renderBlocks();

      }
    );


  document
    .getElementById(
      'addImageBtn'
    )
    .addEventListener(
      'click',
      () => {

        document
          .getElementById(
            'fileInput'
          )
          .click();

      }
    );


  document
    .getElementById(
      'fileInput'
    )
    .addEventListener(
      'change',
      async event => {

        const file =
          event.target.files[0];


        if (!file) {
          return;
        }


        const hint =
          document.getElementById(
            'editorHint'
          );


        hint.textContent =
          'Обрабатываем изображение…';


        try {

          const dataUrl =
            await compressImageFile(
              file
            );


          draft.blocks.push(
            {
              type: 'image',
              src: dataUrl,
              caption: '',
              _pendingFile: true
            }
          );


          renderBlocks();


        } catch (error) {

          console.error(
            error
          );

          showToast(
            'Не удалось обработать изображение'
          );

        }


        hint.textContent =
          '';

        event.target.value =
          '';

      }
    );


  document
    .getElementById(
      'publishBtn'
    )
    .addEventListener(
      'click',
      publishDraft
    );


  renderBlocks();

}


// =========================================================
// РЕНДЕР БЛОКОВ РЕДАКТОРА
// =========================================================

function renderBlocks() {

  const host =
    document.getElementById(
      'blocksHost'
    );


  if (!host) {
    return;
  }


  const draft =
    state.draft;


  host.innerHTML =
    draft.blocks
      .map(
        (block, index) => {

          if (
            block.type === 'text'
          ) {

            return `

              <div
                class="block"
                data-i="${index}"
              >

                <button
                  type="button"
                  class="block-remove"
                  data-act="del"
                  data-i="${index}"
                >
                  ✕
                </button>


                <div
                  class="block-text"
                  contenteditable="true"
                  data-i="${index}"
                  data-placeholder="Текст абзаца…"
                >
                  ${sanitizeHtml(
                    block.html || ''
                  )}
                </div>

              </div>

            `;

          }


          if (
            block.type === 'image'
          ) {

            return `

              <div
                class="block block-image-wrap"
                data-i="${index}"
              >

                <button
                  type="button"
                  class="block-remove"
                  data-act="del"
                  data-i="${index}"
                >
                  ✕
                </button>


                <img
                  src="${escapeHtml(
                    block.src || ''
                  )}"
                  alt=""
                >


                <input
                  class="block-caption"
                  data-i="${index}"
                  placeholder="Подпись (необязательно)"
                  value="${escapeHtml(
                    block.caption || ''
                  )}"
                >

              </div>

            `;

          }


          return '';

        }
      )
      .join('');


  host
    .querySelectorAll(
      '.block-text'
    )
    .forEach(
      element => {

        element.addEventListener(
          'focus',
          () => {

            activeBlockEl =
              element;

          }
        );


        element.addEventListener(
          'input',
          event => {

            const index =
              Number(
                event.target.dataset.i
              );


            draft.blocks[
              index
            ].html =
              sanitizeHtml(
                event.target.innerHTML
              );

          }
        );

      }
    );


  host
    .querySelectorAll(
      '.block-caption'
    )
    .forEach(
      element => {

        element.addEventListener(
          'input',
          event => {

            const index =
              Number(
                event.target.dataset.i
              );


            draft.blocks[
              index
            ].caption =
              event.target.value;

          }
        );

      }
    );


  host
    .querySelectorAll(
      '[data-act="del"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const index =
              Number(
                button.dataset.i
              );


            draft.blocks.splice(
              index,
              1
            );


            renderBlocks();

          }
        );

      }
    );

}


// =========================================================
// ПУБЛИКАЦИЯ
// =========================================================

async function publishDraft() {

  const draft =
    state.draft;


  const hasContent =
    draft.title.trim() ||
    draft.blocks.some(
      block => {

        if (
          block.type === 'text'
        ) {

          return (
            block.html
              .replace(
                /<[^>]+>/g,
                ''
              )
              .trim()
          );

        }


        return (
          block.type === 'image'
        );

      }
    );


  if (!hasContent) {

    showToast(
      'Добавьте заголовок или содержимое'
    );

    return;

  }


  const hint =
    document.getElementById(
      'editorHint'
    );


  const publishBtn =
    document.getElementById(
      'publishBtn'
    );


  publishBtn.disabled =
    true;


  hint.textContent =
    'Публикуем…';


  try {

    // -----------------------------------------------------
    // Загружаем изображения
    // -----------------------------------------------------

    for (
      const block
      of draft.blocks
    ) {

      if (
        block.type === 'image' &&
        block._pendingFile
      ) {

        const url =
          await uploadImage(
            block.src,
            'image.jpg'
          );


        block.src =
          url;


        delete block._pendingFile;

      }

    }


    // -----------------------------------------------------
    // Excerpt
    // -----------------------------------------------------

    const firstText =
      draft.blocks.find(
        block =>
          block.type === 'text' &&
          block.html.trim()
      );


    const excerpt =
      firstText
        ? firstText.html
            .replace(
              /<[^>]+>/g,
              ''
            )
            .trim()
            .slice(
              0,
              500
            )
        : '';


    const firstImage =
      draft.blocks.find(
        block =>
          block.type === 'image'
      );


    // -----------------------------------------------------
    // Сохраняем через Edge Function
    // -----------------------------------------------------

    const result =
      await callApi(
        'create-article',
        {
          article: {

            title:
              draft.title
                .trim() ||
              'Без названия',

            excerpt,

            cover:
              firstImage
                ? firstImage.src
                : null,

            blocks:
              draft.blocks

          }
        }
      );


    showToast(
      'Статья опубликована'
    );


    if (
      result.article &&
      result.article.id
    ) {

      await openReader(
        result.article.id
      );

    } else {

      await renderFeed();

    }


  } catch (error) {

    console.error(
      'publishDraft:',
      error
    );


    hint.textContent =
      '';


    showToast(
      'Ошибка публикации: ' +
      (
        error.message ||
        'неизвестная ошибка'
      )
    );


  } finally {

    publishBtn.disabled =
      false;

  }

}


// =========================================================
// ПРОФИЛЬ — СТАТИСТИКА
// =========================================================

async function getProfileStats() {

  if (!tgUser) {

    return {

      articles: 0,
      comments: 0

    };

  }


  const [
    articlesResult,
    commentsResult
  ] =
    await Promise.all([

      db
        .from('articles')
        .select(
          'id',
          {
            count: 'exact',
            head: true
          }
        )
        .eq(
          'author_id',
          tgUser.id
        ),

      db
        .from('article_comments')
        .select(
          'id',
          {
            count: 'exact',
            head: true
          }
        )
        .eq(
          'author_id',
          tgUser.id
        )

    ]);


  if (
    articlesResult.error
  ) {

    throw articlesResult.error;

  }


  if (
    commentsResult.error
  ) {

    throw commentsResult.error;

  }


  return {

    articles:
      articlesResult.count || 0,

    comments:
      commentsResult.count || 0

  };

}


// =========================================================
// ПРОФИЛЬ
// =========================================================

async function openProfile() {

  state.view =
    'profile';


  setBackButton(
    true,
    renderFeed
  );


  const main =
    document.getElementById(
      'main'
    );


  main.innerHTML =
    '<div class="loading">Загружаем профиль…</div>';


  try {

    const [
      profile,
      stats
    ] =
      await Promise.all([
        loadMyProfile(),
        getProfileStats()
      ]);


    const displayName =
      profile &&
      profile.username
        ? profile.username
        : 'Пользователь';


    main.innerHTML = `

      <div class="profile-page">

        <div class="profile-card chrome">

          <div class="profile-avatar">
            ${escapeHtml(
              displayName
                .charAt(0)
                .toUpperCase()
            )}
          </div>


          <div class="profile-name">
            ${escapeHtml(
              displayName
            )}
          </div>


          <div class="profile-telegram">
            Telegram ID:
            ${tgUser
              ? escapeHtml(
                  String(
                    tgUser.id
                  )
                )
              : '—'}
          </div>


          <div class="profile-edit">

            <input
              type="text"
              id="profileNameInput"
              class="profile-name-input"
              maxlength="30"
              value="${escapeHtml(
                profile
                  ? profile.username
                  : ''
              )}"
              placeholder="Ваш ник"
            >


            <button
              type="button"
              class="btn btn-primary"
              id="saveProfileBtn"
            >
              Сохранить ник
            </button>

          </div>

        </div>


        <div class="profile-stats chrome">

          <div class="stat-item">

            <strong>
              ${stats.articles}
            </strong>

            <span>
              Статьи
            </span>

          </div>


          <div class="stat-item">

            <strong>
              ${stats.comments}
            </strong>

            <span>
              Комментарии
            </span>

          </div>

        </div>


        <div class="profile-menu">

          <button
            type="button"
            class="profile-menu-item"
            id="myArticlesBtn"
          >
            <span>
              Мои статьи
            </span>

            <span>
              →
            </span>
          </button>


          <button
            type="button"
            class="profile-menu-item"
            id="myCommentsBtn"
          >
            <span>
              Мои комментарии
            </span>

            <span>
              →
            </span>
          </button>

        </div>

      </div>

    `;


    // -----------------------------------------------------
    // Сохранить ник
    // -----------------------------------------------------

    document
      .getElementById(
        'saveProfileBtn'
      )
      .addEventListener(
        'click',
        async () => {

          const input =
            document.getElementById(
              'profileNameInput'
            );


          const username =
            input.value.trim();


          if (
            username.length < 2
          ) {

            showToast(
              'Ник должен содержать минимум 2 символа'
            );

            return;

          }


          try {

            await saveMyProfile(
              username
            );


            showToast(
              'Ник сохранён'
            );


            await openProfile();


          } catch (error) {

            console.error(
              error
            );

            showToast(
              error.message ||
              'Не удалось сохранить ник'
            );

          }

        }
      );


    // -----------------------------------------------------
    // Мои статьи
    // -----------------------------------------------------

    document
      .getElementById(
        'myArticlesBtn'
      )
      .addEventListener(
        'click',
        openMyArticles
      );


    // -----------------------------------------------------
    // Мои комментарии
    // -----------------------------------------------------

    document
      .getElementById(
        'myCommentsBtn'
      )
      .addEventListener(
        'click',
        openMyComments
      );


  } catch (error) {

    console.error(
      error
    );


    main.innerHTML = `
      <div class="empty-state">
        <h2>
          Не удалось загрузить профиль
        </h2>

        <p>
          ${escapeHtml(
            error.message
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// МОИ СТАТЬИ
// =========================================================

async function openMyArticles() {

  state.view =
    'my-articles';


  setBackButton(
    true,
    openProfile
  );


  const main =
    document.getElementById(
      'main'
    );


  main.innerHTML =
    '<div class="loading">Загружаем ваши статьи…</div>';


  try {

    const articles =
      await fetchMyArticles();


    main.innerHTML = `

      <div class="profile-subpage">

        <div class="subpage-head">

          <button
            type="button"
            id="profileBackBtn"
          >
            ← Профиль
          </button>

          <h1>
            Мои статьи
          </h1>

        </div>


        <div class="my-articles-list">

          ${
            articles.length
              ? articles.map(
                  article => `

                    <div
                      class="feed-item"
                      data-id="${escapeHtml(
                        article.id
                      )}"
                    >

                      ${
                        article.cover
                          ? `
                            <img
                              class="thumb"
                              src="${escapeHtml(
                                article.cover
                              )}"
                              alt=""
                            >
                          `
                          : ''
                      }

                      <div class="feed-content">

                        <div class="feed-meta">
                          ${fmtDate(
                            article.created_at
                          )}
                        </div>

                        <h3>
                          ${escapeHtml(
                            article.title ||
                            'Без названия'
                          )}
                        </h3>

                        ${
                          article.excerpt
                            ? `
                              <p>
                                ${escapeHtml(
                                  article.excerpt
                                )}
                              </p>
                            `
                            : ''
                        }

                      </div>

                    </div>

                  `
                ).join('')
              : `
                <div class="empty-state">
                  <h2>
                    Вы ещё ничего не опубликовали
                  </h2>
                </div>
              `
          }

        </div>

      </div>

    `;


    document
      .getElementById(
        'profileBackBtn'
      )
      .addEventListener(
        'click',
        openProfile
      );


    main
      .querySelectorAll(
        '.feed-item'
      )
      .forEach(
        item => {

          item.addEventListener(
            'click',
            () =>
              openReader(
                item.dataset.id
              )
          );

        }
      );


  } catch (error) {

    console.error(
      error
    );


    main.innerHTML = `
      <div class="empty-state">
        <h2>
          Не удалось загрузить статьи
        </h2>

        <p>
          ${escapeHtml(
            error.message
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// МОИ КОММЕНТАРИИ
// =========================================================

async function openMyComments() {

  state.view =
    'my-comments';


  setBackButton(
    true,
    openProfile
  );


  const main =
    document.getElementById(
      'main'
    );


  main.innerHTML =
    '<div class="loading">Загружаем комментарии…</div>';


  try {

    const comments =
      await fetchMyComments();


    main.innerHTML = `

      <div class="profile-subpage">

        <div class="subpage-head">

          <button
            type="button"
            id="profileBackBtn"
          >
            ← Профиль
          </button>

          <h1>
            Мои комментарии
          </h1>

        </div>


        <div class="my-comments-list">

          ${
            comments.length
              ? comments.map(
                  comment => `

                    <div
                      class="my-comment-item"
                      data-article-id="${escapeHtml(
                        comment.article_id
                      )}"
                    >

                      <div class="my-comment-date">
                        ${fmtDateTime(
                          comment.created_at
                        )}
                      </div>

                      <div class="my-comment-text">
                        ${escapeHtml(
                          comment.content
                        )}
                      </div>

                      <div class="my-comment-open">
                        Открыть статью →
                      </div>

                    </div>

                  `
                ).join('')
              : `
                <div class="empty-state">
                  <h2>
                    Вы ещё не оставляли комментариев
                  </h2>
                </div>
              `
          }

        </div>

      </div>

    `;


    document
      .getElementById(
        'profileBackBtn'
      )
      .addEventListener(
        'click',
        openProfile
      );


    main
      .querySelectorAll(
        '.my-comment-item'
      )
      .forEach(
        item => {

          item.addEventListener(
            'click',
            () =>
              openReader(
                item.dataset.articleId
              )
          );

        }
      );


  } catch (error) {

    console.error(
      error
    );


    main.innerHTML = `
      <div class="empty-state">
        <h2>
          Не удалось загрузить комментарии
        </h2>

        <p>
          ${escapeHtml(
            error.message
          )}
        </p>
      </div>
    `;

  }

}


// =========================================================
// НАВИГАЦИЯ
// =========================================================

const homeLink =
  document.getElementById(
    'homeLink'
  );


if (homeLink) {

  homeLink.addEventListener(
    'click',
    renderFeed
  );

}


const newArticleBtn =
  document.getElementById(
    'newArticleBtn'
  );


if (newArticleBtn) {

  newArticleBtn.addEventListener(
    'click',
    openEditor
  );

}


const profileBtn =
  document.getElementById(
    'profileBtn'
  );


if (profileBtn) {

  profileBtn.addEventListener(
    'click',
    openProfile
  );

}


// =========================================================
// INIT
// =========================================================

(async function init() {

  try {

    await loadMyProfile();

  } catch (error) {

    console.warn(
      'Profile init error:',
      error
    );

  }


  const startParam =
    tg &&
    tg.initDataUnsafe
      ? tg.initDataUnsafe.start_param
      : null;


  if (startParam) {

    await openReader(
      startParam
    );

  } else {

    await renderFeed();

  }

})();
