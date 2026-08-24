/* =========================================================
   ЛЕТОПИСЬ — app.js
   =========================================================

   ВАЖНО:
   - Supabase client называется supabaseClient.
   - Не объявляем переменную "supabase", потому что
     UMD-библиотека Supabase уже создаёт window.supabase.
   - Telegram ID берём только из Telegram.WebApp.initData.
   - Запись статей / профилей / комментариев / реакций
     выполняется через Edge Function telegram-api.
   ========================================================= */


/* =========================================================
   1. TELEGRAM
   ========================================================= */

const tg =
  window.Telegram &&
  window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

if (tg) {
  tg.ready();
  tg.expand();
}


/* =========================================================
   2. SUPABASE
   ========================================================= */

const supabaseClient =
  window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );


/* =========================================================
   3. EDGE FUNCTION
   ========================================================= */

const API_URL =
  `${window.SUPABASE_URL}/functions/v1/telegram-api`;


/* =========================================================
   4. STATE
   ========================================================= */

const state = {

  articles: [],

  currentArticle: null,

  profile: null,

  comments: [],

  articleReactions: [],

  commentReactions: [],

  search: "",

  selectedAuthors: [],

  sort: "new",

  page: "home",

  loading: false

};


/* =========================================================
   5. DOM
   ========================================================= */

const main =
  document.getElementById("main");

const toast =
  document.getElementById("toast");

const homeLink =
  document.getElementById("homeLink");

const newArticleBtn =
  document.getElementById("newArticleBtn");

const profileBtn =
  document.getElementById("profileBtn");


/* =========================================================
   6. HELPERS
   ========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {

  return escapeHtml(value)
    .replace(/`/g, "&#096;");
}


function formatDate(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(
    "ru-RU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }
  );
}


function formatDateShort(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}


function showToast(message) {

  if (!toast) {
    return;
  }

  toast.textContent =
    message;

  toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {

      toast.classList.remove(
        "show"
      );

    }, 2500);
}


function setLoading(
  text = "Загрузка…"
) {

  main.innerHTML = `
    <div class="loading">
      ${escapeHtml(text)}
    </div>
  `;
}


function getInitData() {

  if (
    tg &&
    tg.initData
  ) {
    return tg.initData;
  }

  return "";
}


function getTelegramUser() {

  if (
    tg &&
    tg.initDataUnsafe &&
    tg.initDataUnsafe.user
  ) {
    return tg.initDataUnsafe.user;
  }

  return null;
}


function getTelegramId() {

  const user =
    getTelegramUser();

  return user
    ? Number(user.id)
    : null;
}


function requireTelegram() {

  const initData =
    getInitData();

  if (!initData) {

    showToast(
      "Откройте приложение через Telegram"
    );

    return null;
  }

  return initData;
}


function getArticleUrl(articleId) {

  return `${window.location.origin}${window.location.pathname}#article/${articleId}`;
}


function getInitials(name) {

  const value =
    String(name || "П")
      .trim();

  if (!value) {
    return "П";
  }

  const parts =
    value.split(/\s+/);

  if (parts.length >= 2) {

    return (
      parts[0][0] +
      parts[1][0]
    ).toUpperCase();

  }

  return value
    .slice(0, 2)
    .toUpperCase();
}


function debounce(
  callback,
  delay = 250
) {

  let timer;

  return (...args) => {

    clearTimeout(timer);

    timer =
      setTimeout(
        () => callback(...args),
        delay
      );
  };
}


/* =========================================================
   7. EDGE FUNCTION REQUEST
   ========================================================= */

async function apiRequest(
  action,
  extra = {}
) {

  const initData =
    requireTelegram();

  if (!initData) {
    throw new Error(
      "Telegram initData отсутствует"
    );
  }

  const response =
    await fetch(
      API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          action,
          initData,
          ...extra
        })
      }
    );

  let data;

  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      "Сервер вернул некорректный ответ"
    );
  }

  if (!response.ok) {

    throw new Error(
      data?.error ||
      "Ошибка сервера"
    );
  }

  if (data?.error) {

    throw new Error(
      data.error
    );
  }

  return data;
}


/* =========================================================
   8. LOAD ARTICLES
   ========================================================= */

async function loadArticles() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("articles")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  state.articles =
    data || [];
}


/* =========================================================
   9. LOAD PROFILE
   ========================================================= */

async function loadProfile() {

  try {

    const data =
      await apiRequest(
        "get-profile"
      );

    state.profile =
      data.profile || null;

  } catch (error) {

    console.error(
      "loadProfile:",
      error
    );

    state.profile = null;
  }
}


/* =========================================================
   10. FILTERED ARTICLES
   ========================================================= */

function getAuthors() {

  const map =
    new Map();

  state.articles.forEach(
    article => {

      const id =
        String(
          article.author_id ?? ""
        );

      const name =
        article.author_name ||
        "Пользователь";

      if (!map.has(id)) {

        map.set(
          id,
          {
            id,
            name
          }
        );

      }

    }
  );

  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        "ru"
      )
  );
}


function getFilteredArticles() {

  let result =
    [...state.articles];

  const search =
    state.search
      .trim()
      .toLocaleLowerCase("ru");

  if (search) {

    result =
      result.filter(
        article => {

          const title =
            String(
              article.title || ""
            ).toLocaleLowerCase(
              "ru"
            );

          const excerpt =
            String(
              article.excerpt || ""
            ).toLocaleLowerCase(
              "ru"
            );

          const author =
            String(
              article.author_name || ""
            ).toLocaleLowerCase(
              "ru"
            );

          return (
            title.includes(search) ||
            excerpt.includes(search) ||
            author.includes(search)
          );
        }
      );
  }


  if (
    state.selectedAuthors.length
  ) {

    result =
      result.filter(
        article =>
          state.selectedAuthors
            .includes(
              String(
                article.author_id ?? ""
              )
            )
      );
  }


  result.sort(
    (a, b) => {

      const first =
        new Date(
          a.created_at
        ).getTime();

      const second =
        new Date(
          b.created_at
        ).getTime();

      return state.sort === "new"
        ? second - first
        : first - second;
    }
  );

  return result;
}


/* =========================================================
   11. HOME
   ========================================================= */

function renderHome() {

  state.page =
    "home";

  state.currentArticle =
    null;

  const authors =
    getAuthors();

  const articles =
    getFilteredArticles();

  main.innerHTML = `

    <section class="home-page">

      <div class="home-controls">

        <div class="search-wrap">

          <span class="search-icon">
            ⌕
          </span>

          <input
            id="articleSearch"
            class="search-input"
            type="search"
            placeholder="Поиск по названию..."
            value="${escapeAttribute(
              state.search
            )}"
            autocomplete="off"
          >

          <button
            id="clearSearch"
            class="search-clear"
            type="button"
            aria-label="Очистить поиск"
            ${state.search ? "" : "hidden"}
          >
            ×
          </button>

        </div>


        <div class="filters-row">

          <div class="author-filter">

            <button
              class="filter-button"
              id="authorFilterBtn"
              type="button"
            >
              <span>Автор</span>
              <span class="filter-arrow">
                ▾
              </span>
            </button>

            <div
              class="filter-dropdown"
              id="authorDropdown"
              hidden
            >

              <div class="filter-dropdown-title">
                Авторы
              </div>

              ${
                authors.length
                  ? authors.map(
                      author => {

                        const checked =
                          state.selectedAuthors
                            .includes(
                              author.id
                            );

                        return `
                          <label
                            class="author-option"
                          >

                            <input
                              type="checkbox"
                              class="author-checkbox"
                              value="${escapeAttribute(
                                author.id
                              )}"
                              ${
                                checked
                                  ? "checked"
                                  : ""
                              }
                            >

                            <span class="author-checkmark"></span>

                            <span>
                              ${escapeHtml(
                                author.name
                              )}
                            </span>

                          </label>
                        `;
                      }
                    ).join("")
                  : `
                    <div class="filter-empty">
                      Авторов пока нет
                    </div>
                  `
              }

              <button
                id="clearAuthors"
                class="filter-clear"
                type="button"
              >
                Сбросить
              </button>

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
                  state.sort === "new"
                    ? "selected"
                    : ""
                }
              >
                Новые
              </option>

              <option
                value="old"
                ${
                  state.sort === "old"
                    ? "selected"
                    : ""
                }
              >
                Старые
              </option>
            </select>

          </div>

        </div>

      </div>


      ${
        articles.length
          ? `
            <div
              class="articles-grid"
              id="articlesGrid"
            >
              ${articles
                .map(
                  renderArticleCard
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-state">

              <div class="empty-state-title">
                Статей не найдено
              </div>

              <div class="empty-state-text">
                Попробуйте изменить запрос
                или параметры фильтра.
              </div>

            </div>
          `
      }

    </section>
  `;


  bindHomeControls();

  bindArticleCards();
}


function renderArticleCard(
  article
) {

  const cover =
    article.cover
      ? `
        <img
          class="article-card-cover"
          src="${escapeAttribute(
            article.cover
          )}"
          alt=""
        >
      `
      : `
        <div
          class="article-card-cover article-card-cover-empty"
        >
          Летопись
        </div>
      `;

  return `

    <article
      class="article-card"
      data-article-id="${escapeAttribute(
        article.id
      )}"
    >

      ${cover}

      <div class="article-card-body">

        <div class="article-card-date">
          ${escapeHtml(
            formatDateShort(
              article.created_at
            )
          )}
        </div>

        <h2 class="article-card-title">
          ${escapeHtml(
            article.title ||
            "Без названия"
          )}
        </h2>

        ${
          article.excerpt
            ? `
              <p class="article-card-excerpt">
                ${escapeHtml(
                  article.excerpt
                )}
              </p>
            `
            : ""
        }

        <button
          class="article-author-link"
          data-author-id="${escapeAttribute(
            article.author_id
          )}"
          type="button"
        >
          ${escapeHtml(
            article.author_name ||
            "Пользователь"
          )}
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   12. HOME CONTROLS
   ========================================================= */

function bindHomeControls() {

  const searchInput =
    document.getElementById(
      "articleSearch"
    );

  const clearSearch =
    document.getElementById(
      "clearSearch"
    );

  const filterButton =
    document.getElementById(
      "authorFilterBtn"
    );

  const dropdown =
    document.getElementById(
      "authorDropdown"
    );

  const sortSelect =
    document.getElementById(
      "articleSort"
    );

  const clearAuthors =
    document.getElementById(
      "clearAuthors"
    );


  if (searchInput) {

    searchInput.addEventListener(
      "input",
      debounce(
        event => {

          state.search =
            event.target.value;

          if (clearSearch) {

            clearSearch.hidden =
              !state.search;
          }

          renderHome();

          const input =
            document.getElementById(
              "articleSearch"
            );

          if (input) {

            input.focus();

            try {

              input.setSelectionRange(
                input.value.length,
                input.value.length
              );

            } catch {}

          }

        },
        120
      )
    );

  }


  if (clearSearch) {

    clearSearch.addEventListener(
      "click",
      event => {

        event.preventDefault();

        state.search = "";

        renderHome();

        const input =
          document.getElementById(
            "articleSearch"
          );

        if (input) {
          input.focus();
        }
      }
    );

  }


  if (
    filterButton &&
    dropdown
  ) {

    filterButton.addEventListener(
      "click",
      event => {

        event.stopPropagation();

        dropdown.hidden =
          !dropdown.hidden;
      }
    );

  }


  document
    .querySelectorAll(
      ".author-checkbox"
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          "change",
          () => {

            state.selectedAuthors =
              Array.from(
                document.querySelectorAll(
                  ".author-checkbox:checked"
                )
              ).map(
                item =>
                  item.value
              );

            renderHome();
          }
        );

      }
    );


  if (clearAuthors) {

    clearAuthors.addEventListener(
      "click",
      () => {

        state.selectedAuthors =
          [];

        renderHome();
      }
    );

  }


  if (sortSelect) {

    sortSelect.addEventListener(
      "change",
      event => {

        state.sort =
          event.target.value === "old"
            ? "old"
            : "new";

        renderHome();
      }
    );

  }


  document.addEventListener(
    "click",
    closeAuthorDropdown,
    {
      once: true
    }
  );
}


function closeAuthorDropdown() {

  const dropdown =
    document.getElementById(
      "authorDropdown"
    );

  const button =
    document.getElementById(
      "authorFilterBtn"
    );

  if (
    dropdown &&
    button &&
    !dropdown.hidden
  ) {

    document.addEventListener(
      "click",
      event => {

        if (
          !dropdown.contains(
            event.target
          ) &&
          !button.contains(
            event.target
          )
        ) {

          dropdown.hidden =
            true;
        }

      },
      {
        once: true
      }
    );
  }
}


/* =========================================================
   13. ARTICLE CARDS
   ========================================================= */

function bindArticleCards() {

  document
    .querySelectorAll(
      ".article-card"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          event => {

            if (
              event.target.closest(
                ".article-author-link"
              )
            ) {
              return;
            }

            const id =
              card.dataset.articleId;

            openArticle(id);
          }
        );

      }
    );


  document
    .querySelectorAll(
      ".article-author-link"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            const authorId =
              button.dataset.authorId;

            openAuthor(
              authorId
            );
          }
        );

      }
    );
}


/* =========================================================
   14. OPEN ARTICLE
   ========================================================= */

async function openArticle(
  articleId
) {

  const article =
    state.articles.find(
      item =>
        String(item.id) ===
        String(articleId)
    );

  if (!article) {

    showToast(
      "Статья не найдена"
    );

    return;
  }

  state.page =
    "article";

  state.currentArticle =
    article;

  history.replaceState(
    null,
    "",
    `#article/${article.id}`
  );

  setLoading(
    "Загрузка статьи…"
  );

  try {

    await loadArticleMeta(
      article.id
    );

  } catch (error) {

    console.error(error);

    state.comments = [];
    state.articleReactions = [];
    state.commentReactions = [];
  }

  renderArticle(
    article
  );
}


async function loadArticleMeta(
  articleId
) {

  const [
    commentsResult,
    articleReactionsResult,
    commentReactionsResult
  ] =
    await Promise.all([

      supabaseClient
        .from("article_comments")
        .select("*")
        .eq(
          "article_id",
          articleId
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        ),

      supabaseClient
        .from("article_reactions")
        .select("*")
        .eq(
          "article_id",
          articleId
        ),

      Promise.resolve({
        data: [],
        error: null
      })
    ]);


  if (
    commentsResult.error
  ) {
    throw commentsResult.error;
  }

  if (
    articleReactionsResult.error
  ) {
    throw articleReactionsResult.error;
  }


  state.comments =
    commentsResult.data || [];

  state.articleReactions =
    articleReactionsResult.data || [];


  if (
    state.comments.length
  ) {

    const ids =
      state.comments.map(
        comment =>
          comment.id
      );

    const {
      data,
      error
    } =
      await supabaseClient
        .from("comment_reactions")
        .select("*")
        .in(
          "comment_id",
          ids
        );

    if (error) {
      throw error;
    }

    state.commentReactions =
      data || [];

  } else {

    state.commentReactions =
      [];
  }
}


/* =========================================================
   15. RENDER ARTICLE
   ========================================================= */

function renderArticle(
  article
) {

  const blocks =
    Array.isArray(
      article.blocks
    )
      ? article.blocks
      : [];

  const cover =
    article.cover
      ? `
        <img
          class="article-cover"
          src="${escapeAttribute(
            article.cover
          )}"
          alt=""
        >
      `
      : "";


  const reactions =
    getReactionCounts(
      state.articleReactions
    );

  const myReaction =
    getMyReaction(
      state.articleReactions
    );


  main.innerHTML = `

    <article
      class="article-page"
    >

      <button
        class="back-button"
        id="backHomeBtn"
        type="button"
      >
        ← Все статьи
      </button>


      ${cover}


      <header class="article-header">

        <div class="article-date">
          ${escapeHtml(
            formatDate(
              article.created_at
            )
          )}
        </div>

        <h1 class="article-title">
          ${escapeHtml(
            article.title ||
            "Без названия"
          )}
        </h1>

        ${
          article.excerpt
            ? `
              <p class="article-excerpt">
                ${escapeHtml(
                  article.excerpt
                )}
              </p>
            `
            : ""
        }


        <button
          class="article-author-button"
          id="articleAuthorBtn"
          type="button"
          data-author-id="${escapeAttribute(
            article.author_id
          )}"
        >

          <span class="author-avatar">
            ${escapeHtml(
              getInitials(
                article.author_name
              )
            )}
          </span>

          <span>
            ${escapeHtml(
              article.author_name ||
              "Пользователь"
            )}
          </span>

        </button>

      </header>


      <div class="article-content">

        ${
          blocks.length
            ? blocks
                .map(
                  renderBlock
                )
                .join("")
            : `
              <p class="article-empty">
                Содержание статьи отсутствует.
              </p>
            `
        }

      </div>


      <div class="article-footer-actions">

        <button
          class="share-button"
          id="shareArticleBtn"
          type="button"
        >
          Поделиться
        </button>

      </div>


      <section class="article-reactions">

        <div class="reaction-title">
          Реакции
        </div>

        <div class="reaction-buttons">

          ${renderReactionButton(
            "like",
            "👍",
            reactions.like,
            myReaction
          )}

          ${renderReactionButton(
            "love",
            "❤️",
            reactions.love,
            myReaction
          )}

          ${renderReactionButton(
            "laugh",
            "😂",
            reactions.laugh,
            myReaction
          )}

          ${renderReactionButton(
            "wow",
            "😮",
            reactions.wow,
            myReaction
          )}

          ${renderReactionButton(
            "sad",
            "😢",
            reactions.sad,
            myReaction
          )}

        </div>

      </section>


      ${renderCommentsSection()}

    </article>
  `;


  bindArticlePage();
}


function renderBlock(
  block
) {

  if (
    !block ||
    typeof block !== "object"
  ) {
    return "";
  }

  const type =
    block.type ||
    "text";

  const content =
    block.content ??
    block.text ??
    "";


  if (
    type === "image" ||
    type === "img"
  ) {

    const src =
      block.src ||
      block.url ||
      block.content;

    if (!src) {
      return "";
    }

    return `
      <figure class="article-block-image">

        <img
          src="${escapeAttribute(
            src
          )}"
          alt="${escapeAttribute(
            block.alt || ""
          )}"
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
            : ""
        }

      </figure>
    `;
  }


  if (
    type === "quote"
  ) {

    return `
      <blockquote
        class="article-block-quote"
      >
        ${escapeHtml(
          content
        )}
      </blockquote>
    `;
  }


  if (
    type === "heading" ||
    type === "h2"
  ) {

    return `
      <h2 class="article-block-heading">
        ${escapeHtml(
          content
        )}
      </h2>
    `;
  }


  if (
    type === "h3"
  ) {

    return `
      <h3 class="article-block-heading">
        ${escapeHtml(
          content
        )}
      </h3>
    `;
  }


  if (
    type === "divider" ||
    type === "separator"
  ) {

    return `
      <hr class="article-block-divider">
    `;
  }


  if (
    type === "list"
  ) {

    const items =
      Array.isArray(
        block.items
      )
        ? block.items
        : String(content)
            .split("\n");

    return `
      <ul class="article-block-list">

        ${items
          .map(
            item => `
              <li>
                ${escapeHtml(
                  item
                )}
              </li>
            `
          )
          .join("")}

      </ul>
    `;
  }


  return `
    <p class="article-block-text">
      ${escapeHtml(
        content
      ).replace(
        /\n/g,
        "<br>"
      )}
    </p>
  `;
}


/* =========================================================
   16. REACTIONS
   ========================================================= */

function getReactionCounts(
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
        Object.prototype.hasOwnProperty.call(
          result,
          reaction.reaction_type
        )
      ) {

        result[
          reaction.reaction_type
        ]++;
      }

    }
  );

  return result;
}


function getMyReaction(
  reactions
) {

  const userId =
    getTelegramId();

  if (!userId) {
    return null;
  }

  const reaction =
    reactions.find(
      item =>
        Number(
          item.user_id
        ) ===
        Number(userId)
    );

  return reaction
    ? reaction.reaction_type
    : null;
}


function renderReactionButton(
  type,
  emoji,
  count,
  selected
) {

  return `
    <button
      class="reaction-button ${
        selected === type
          ? "active"
          : ""
      }"
      data-reaction-type="${type}"
      type="button"
    >

      <span>
        ${emoji}
      </span>

      <span class="reaction-count">
        ${count || ""}
      </span>

    </button>
  `;
}


async function toggleArticleReaction(
  type
) {

  try {

    await apiRequest(
      "toggle-article-reaction",
      {
        articleId:
          state.currentArticle.id,

        reactionType:
          type
      }
    );

    await loadArticleMeta(
      state.currentArticle.id
    );

    renderArticle(
      state.currentArticle
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось поставить реакцию"
    );
  }
}


/* =========================================================
   17. COMMENTS
   ========================================================= */

function renderCommentsSection() {

  const roots =
    state.comments.filter(
      comment =>
        !comment.parent_id
    );


  return `

    <section
      class="comments-section"
      id="commentsSection"
    >

      <div class="comments-heading">

        <h2>
          Комментарии
        </h2>

        <span class="comments-count">
          ${state.comments.length}
        </span>

      </div>


      <form
        class="comment-form"
        id="commentForm"
      >

        <textarea
          id="commentInput"
          class="comment-input"
          rows="3"
          maxlength="2000"
          placeholder="Напишите комментарий..."
        ></textarea>

        <div class="comment-form-bottom">

          <span class="comment-author-hint">
            ${
              state.profile?.username
                ? `Вы: ${escapeHtml(
                    state.profile.username
                  )}`
                : "Ваш профиль"
            }
          </span>

          <button
            class="comment-submit"
            type="submit"
          >
            Отправить
          </button>

        </div>

      </form>


      <div class="comments-list">

        ${
          roots.length
            ? roots
                .map(
                  renderComment
                )
                .join("")
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


function renderComment(
  comment
) {

  const replies =
    state.comments.filter(
      item =>
        String(
          item.parent_id
        ) ===
        String(comment.id)
    );


  const reactionCounts =
    getReactionCounts(
      state.commentReactions
        .filter(
          item =>
            String(
              item.comment_id
            ) ===
            String(comment.id)
        )
    );


  const myReaction =
    getMyReaction(
      state.commentReactions
        .filter(
          item =>
            String(
              item.comment_id
            ) ===
            String(comment.id)
        )
    );


  return `

    <div
      class="comment-thread"
      data-comment-id="${escapeAttribute(
        comment.id
      )}"
    >

      <div class="comment">

        <div class="comment-avatar">
          ${escapeHtml(
            getInitials(
              comment.author_name
            )
          )}
        </div>

        <div class="comment-main">

          <div class="comment-top">

            <button
              class="comment-author"
              type="button"
              data-author-id="${escapeAttribute(
                comment.author_id
              )}"
            >
              ${escapeHtml(
                comment.author_name ||
                "Пользователь"
              )}
            </button>

            <span class="comment-date">
              ${escapeHtml(
                formatDateShort(
                  comment.created_at
                )
              )}
            </span>

          </div>

          <div class="comment-text">
            ${escapeHtml(
              comment.content
            ).replace(
              /\n/g,
              "<br>"
            )}
          </div>


          <div class="comment-actions">

            <button
              class="comment-action reply-comment-btn"
              type="button"
              data-comment-id="${escapeAttribute(
                comment.id
              )}"
            >
              Ответить
            </button>


            <div class="comment-reactions">

              ${renderCommentReaction(
                comment.id,
                "like",
                "👍",
                reactionCounts.like,
                myReaction
              )}

              ${renderCommentReaction(
                comment.id,
                "love",
                "❤️",
                reactionCounts.love,
                myReaction
              )}

            </div>

          </div>


          <div
            class="reply-form-wrap"
            id="reply-form-${escapeAttribute(
              comment.id
            )}"
            hidden
          >

            <form
              class="reply-form"
              data-parent-id="${escapeAttribute(
                comment.id
              )}"
            >

              <textarea
                class="comment-input reply-input"
                rows="2"
                maxlength="2000"
                placeholder="Ваш ответ..."
              ></textarea>

              <div class="reply-form-actions">

                <button
                  class="comment-cancel"
                  type="button"
                >
                  Отмена
                </button>

                <button
                  class="comment-submit"
                  type="submit"
                >
                  Ответить
                </button>

              </div>

            </form>

          </div>

        </div>

      </div>


      ${
        replies.length
          ? `
            <div class="comment-replies">
              ${replies
                .map(
                  renderCommentReply
                )
                .join("")}
            </div>
          `
          : ""
      }

    </div>
  `;
}


function renderCommentReply(
  comment
) {

  const reactions =
    state.commentReactions
      .filter(
        item =>
          String(
            item.comment_id
          ) ===
          String(comment.id)
      );

  const counts =
    getReactionCounts(
      reactions
    );

  const myReaction =
    getMyReaction(
      reactions
    );


  return `

    <div
      class="comment reply-comment"
      data-comment-id="${escapeAttribute(
        comment.id
      )}"
    >

      <div class="comment-avatar">
        ${escapeHtml(
          getInitials(
            comment.author_name
          )
        )}
      </div>

      <div class="comment-main">

        <div class="comment-top">

          <button
            class="comment-author"
            type="button"
            data-author-id="${escapeAttribute(
              comment.author_id
            )}"
          >
            ${escapeHtml(
              comment.author_name ||
              "Пользователь"
            )}
          </button>

          <span class="comment-date">
            ${escapeHtml(
              formatDateShort(
                comment.created_at
              )
            )}
          </span>

        </div>

        <div class="comment-text">
          ${escapeHtml(
            comment.content
          ).replace(
            /\n/g,
            "<br>"
          )}
        </div>


        <div class="comment-actions">

          <div class="comment-reactions">

            ${renderCommentReaction(
              comment.id,
              "like",
              "👍",
              counts.like,
              myReaction
            )}

            ${renderCommentReaction(
              comment.id,
              "love",
              "❤️",
              counts.love,
              myReaction
            )}

          </div>

        </div>

      </div>

    </div>
  `;
}


function renderCommentReaction(
  commentId,
  type,
  emoji,
  count,
  selected
) {

  return `
    <button
      class="comment-reaction-button ${
        selected === type
          ? "active"
          : ""
      }"
      type="button"
      data-comment-id="${escapeAttribute(
        commentId
      )}"
      data-reaction-type="${type}"
    >
      ${emoji}
      ${
        count
          ? `<span>${count}</span>`
          : ""
      }
    </button>
  `;
}


function bindComments() {

  const form =
    document.getElementById(
      "commentForm"
    );

  if (form) {

    form.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        const input =
          document.getElementById(
            "commentInput"
          );

        const content =
          input?.value.trim();

        if (!content) {

          showToast(
            "Введите комментарий"
          );

          return;
        }

        await createComment(
          content,
          null
        );
      }
    );
  }


  document
    .querySelectorAll(
      ".reply-comment-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const id =
              button.dataset.commentId;

            const formWrap =
              document.getElementById(
                `reply-form-${id}`
              );

            if (formWrap) {

              formWrap.hidden =
                !formWrap.hidden;
            }
          }
        );
      }
    );


  document
    .querySelectorAll(
      ".reply-form"
    )
    .forEach(
      replyForm => {

        replyForm.addEventListener(
          "submit",
          async event => {

            event.preventDefault();

            const parentId =
              replyForm.dataset.parentId;

            const textarea =
              replyForm.querySelector(
                "textarea"
              );

            const content =
              textarea?.value.trim();

            if (!content) {

              showToast(
                "Введите ответ"
              );

              return;
            }

            await createComment(
              content,
              parentId
            );
          }
        );

        const cancel =
          replyForm.querySelector(
            ".comment-cancel"
          );

        if (cancel) {

          cancel.addEventListener(
            "click",
            () => {

              const wrap =
                replyForm.closest(
                  ".reply-form-wrap"
                );

              if (wrap) {
                wrap.hidden = true;
              }

              replyForm.reset();
            }
          );
        }

      }
    );


  document
    .querySelectorAll(
      ".comment-reaction-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            await toggleCommentReaction(
              button.dataset.commentId,
              button.dataset.reactionType
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      ".comment-author"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            openAuthor(
              button.dataset.authorId
            );
          }
        );
      }
    );
}


async function createComment(
  content,
  parentId
) {

  try {

    await apiRequest(
      "create-comment",
      {
        articleId:
          state.currentArticle.id,

        parentId:
          parentId || null,

        content
      }
    );

    await loadArticleMeta(
      state.currentArticle.id
    );

    renderArticle(
      state.currentArticle
    );

    showToast(
      parentId
        ? "Ответ добавлен"
        : "Комментарий добавлен"
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось добавить комментарий"
    );
  }
}


async function toggleCommentReaction(
  commentId,
  type
) {

  try {

    await apiRequest(
      "toggle-comment-reaction",
      {
        commentId,
        reactionType:
          type
      }
    );

    await loadArticleMeta(
      state.currentArticle.id
    );

    renderArticle(
      state.currentArticle
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось поставить реакцию"
    );
  }
}


/* =========================================================
   18. ARTICLE PAGE EVENTS
   ========================================================= */

function bindArticlePage() {

  const back =
    document.getElementById(
      "backHomeBtn"
    );

  if (back) {

    back.addEventListener(
      "click",
      () => {

        history.replaceState(
          null,
          "",
          window.location.pathname
        );

        renderHome();
      }
    );
  }


  const share =
    document.getElementById(
      "shareArticleBtn"
    );

  if (share) {

    share.addEventListener(
      "click",
      copyArticleLink
    );
  }


  const authorButton =
    document.getElementById(
      "articleAuthorBtn"
    );

  if (authorButton) {

    authorButton.addEventListener(
      "click",
      () => {

        openAuthor(
          authorButton.dataset.authorId
        );
      }
    );
  }


  document
    .querySelectorAll(
      ".reaction-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            await toggleArticleReaction(
              button.dataset.reactionType
            );
          }
        );
      }
    );


  bindComments();
}


async function copyArticleLink() {

  const article =
    state.currentArticle;

  if (!article) {
    return;
  }

  const url =
    getArticleUrl(
      article.id
    );

  try {

    await navigator.clipboard.writeText(
      url
    );

    showToast(
      "Ссылка скопирована"
    );

  } catch {

    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      url;

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    try {
      document.execCommand(
        "copy"
      );

      showToast(
        "Ссылка скопирована"
      );

    } catch {

      showToast(
        url
      );
    }

    textarea.remove();
  }
}


/* =========================================================
   19. AUTHOR PAGE
   ========================================================= */

function openAuthor(
  authorId
) {

  const articles =
    state.articles.filter(
      article =>
        String(
          article.author_id
        ) ===
        String(authorId)
    );

  const authorName =
    articles[0]?.author_name ||
    "Пользователь";


  state.page =
    "author";

  main.innerHTML = `

    <section class="author-page">

      <button
        class="back-button"
        id="backFromAuthorBtn"
        type="button"
      >
        ← Все статьи
      </button>


      <div class="author-profile-card">

        <div class="author-avatar large">
          ${escapeHtml(
            getInitials(
              authorName
            )
          )}
        </div>

        <div>

          <h1 class="author-page-title">
            ${escapeHtml(
              authorName
            )}
          </h1>

          <div class="author-page-count">
            Статей: ${articles.length}
          </div>

        </div>

      </div>


      <div class="author-articles">

        ${
          articles.length
            ? articles
                .sort(
                  (a, b) =>
                    new Date(
                      b.created_at
                    ) -
                    new Date(
                      a.created_at
                    )
                )
                .map(
                  renderArticleCard
                )
                .join("")
            : `
              <div class="empty-state">
                Статей пока нет.
              </div>
            `
        }

      </div>

    </section>
  `;


  const back =
    document.getElementById(
      "backFromAuthorBtn"
    );

  if (back) {

    back.addEventListener(
      "click",
      renderHome
    );
  }


  bindArticleCards();
}


/* =========================================================
   20. PROFILE PAGE
   ========================================================= */

async function renderProfilePage() {

  state.page =
    "profile";

  setLoading(
    "Загрузка профиля…"
  );

  await loadProfile();

  const userId =
    getTelegramId();

  const myArticles =
    state.articles.filter(
      article =>
        Number(
          article.author_id
        ) ===
        Number(userId)
    );


  let myComments = [];

  if (userId) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("article_comments")
        .select("*")
        .eq(
          "author_id",
          userId
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );

    if (!error) {
      myComments =
        data || [];
    }
  }


  const username =
    state.profile?.username ||
    "Пользователь";


  main.innerHTML = `

    <section class="profile-page">

      <div class="profile-head">

        <div class="profile-avatar">
          ${escapeHtml(
            getInitials(
              username
            )
          )}
        </div>

        <div>

          <h1 class="profile-title">
            Профиль
          </h1>

          <div class="profile-name">
            ${escapeHtml(
              username
            )}
          </div>

        </div>

      </div>


      <section class="profile-settings-card">

        <h2>
          Мой ник
        </h2>

        <form
          id="profileForm"
          class="profile-form"
        >

          <input
            id="profileUsername"
            class="profile-input"
            type="text"
            maxlength="30"
            minlength="2"
            value="${escapeAttribute(
              username === "Пользователь"
                ? ""
                : username
            )}"
            placeholder="Введите ник"
          >

          <button
            class="profile-save"
            type="submit"
          >
            Сохранить
          </button>

        </form>

      </section>


      <section class="profile-stats">

        <div class="profile-stat">

          <strong>
            ${myArticles.length}
          </strong>

          <span>
            Статей
          </span>

        </div>


        <div class="profile-stat">

          <strong>
            ${myComments.length}
          </strong>

          <span>
            Комментариев
          </span>

        </div>

      </section>


      <section class="profile-section">

        <h2>
          Мои статьи
        </h2>

        ${
          myArticles.length
            ? `
              <div class="profile-articles">
                ${myArticles
                  .sort(
                    (a, b) =>
                      new Date(
                        b.created_at
                      ) -
                      new Date(
                        a.created_at
                      )
                  )
                  .map(
                    renderArticleCard
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="profile-empty">
                Вы ещё не опубликовали
                ни одной статьи.
              </div>
            `
        }

      </section>


      <section class="profile-section">

        <h2>
          Мои комментарии
        </h2>

        ${
          myComments.length
            ? `
              <div class="my-comments-list">
                ${myComments
                  .map(
                    renderMyComment
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="profile-empty">
                Вы ещё не оставляли
                комментариев.
              </div>
            `
        }

      </section>

    </section>
  `;


  bindProfilePage();
}


function renderMyComment(
  comment
) {

  const article =
    state.articles.find(
      item =>
        String(item.id) ===
        String(comment.article_id)
    );


  return `

    <button
      class="my-comment-item"
      type="button"
      data-article-id="${escapeAttribute(
        comment.article_id
      )}"
    >

      <div class="my-comment-date">
        ${escapeHtml(
          formatDateShort(
            comment.created_at
          )
        )}
      </div>

      <div class="my-comment-article">
        ${
          article
            ? escapeHtml(
                article.title
              )
            : "Статья"
        }
      </div>

      <div class="my-comment-text">
        ${escapeHtml(
          comment.content
        )}
      </div>

    </button>
  `;
}


function bindProfilePage() {

  const form =
    document.getElementById(
      "profileForm"
    );

  if (form) {

    form.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        const input =
          document.getElementById(
            "profileUsername"
          );

        const username =
          input?.value.trim();

        if (!username) {

          showToast(
            "Введите ник"
          );

          return;
        }

        try {

          const data =
            await apiRequest(
              "set-profile",
              {
                username
              }
            );

          state.profile =
            data.profile;

          state.articles =
            state.articles.map(
              article => {

                if (
                  Number(
                    article.author_id
                  ) ===
                  Number(
                    getTelegramId()
                  )
                ) {

                  return {
                    ...article,
                    author_name:
                      state.profile.username
                  };
                }

                return article;
              }
            );

          showToast(
            "Профиль сохранён"
          );

          renderProfilePage();

        } catch (error) {

          console.error(error);

          showToast(
            error.message ||
            "Не удалось сохранить профиль"
          );
        }

      }
    );
  }


  document
    .querySelectorAll(
      ".profile-articles .article-card"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          () => {

            openArticle(
              card.dataset.articleId
            );
          }
        );

      }
    );


  document
    .querySelectorAll(
      ".my-comment-item"
    )
    .forEach(
      item => {

        item.addEventListener(
          "click",
          () => {

            openArticle(
              item.dataset.articleId
            );
          }
        );
      }
    );
}


/* =========================================================
   21. NEW ARTICLE
   ========================================================= */

function renderNewArticlePage() {

  state.page =
    "new-article";


  main.innerHTML = `

    <section class="editor-page">

      <button
        class="back-button"
        id="backFromEditorBtn"
        type="button"
      >
        ← Назад
      </button>


      <h1 class="editor-title">
        Новая статья
      </h1>


      <form
        id="articleForm"
        class="article-form"
      >

        <label class="form-label">

          <span>
            Название
          </span>

          <input
            id="articleTitle"
            class="form-input"
            type="text"
            maxlength="200"
            required
            placeholder="Название статьи"
          >

        </label>


        <label class="form-label">

          <span>
            Краткое описание
          </span>

          <textarea
            id="articleExcerpt"
            class="form-input"
            rows="4"
            maxlength="500"
            placeholder="Краткое описание"
          ></textarea>

        </label>


        <label class="form-label">

          <span>
            Обложка
          </span>

          <input
            id="articleCover"
            class="form-input"
            type="url"
            placeholder="https://..."
          >

        </label>


        <label class="form-label">

          <span>
            Текст статьи
          </span>

          <textarea
            id="articleContent"
            class="form-input article-editor-textarea"
            rows="16"
            placeholder="Текст статьи..."
            required
          ></textarea>

        </label>


        <div class="editor-actions">

          <button
            class="profile-save"
            type="submit"
          >
            Опубликовать
          </button>

        </div>

      </form>

    </section>
  `;


  const back =
    document.getElementById(
      "backFromEditorBtn"
    );

  if (back) {

    back.addEventListener(
      "click",
      renderHome
    );
  }


  const form =
    document.getElementById(
      "articleForm"
    );

  if (form) {

    form.addEventListener(
      "submit",
      createArticleFromForm
    );
  }
}


async function createArticleFromForm(
  event
) {

  event.preventDefault();

  const title =
    document
      .getElementById(
        "articleTitle"
      )
      .value
      .trim();

  const excerpt =
    document
      .getElementById(
        "articleExcerpt"
      )
      .value
      .trim();

  const cover =
    document
      .getElementById(
        "articleCover"
      )
      .value
      .trim();

  const content =
    document
      .getElementById(
        "articleContent"
      )
      .value
      .trim();


  if (!title) {

    showToast(
      "Введите название статьи"
    );

    return;
  }


  if (!content) {

    showToast(
      "Введите текст статьи"
    );

    return;
  }


  try {

    const result =
      await apiRequest(
        "create-article",
        {
          article: {

            title,

            excerpt,

            cover:
              cover ||
              null,

            blocks: [
              {
                type: "text",
                content
              }
            ]
          }
        }
      );


    if (result.article) {

      state.articles.unshift(
        result.article
      );
    }


    showToast(
      "Статья опубликована"
    );


    if (
      result.article
    ) {

      openArticle(
        result.article.id
      );

    } else {

      renderHome();
    }

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось создать статью"
    );
  }
}


/* =========================================================
   22. NAVIGATION
   ========================================================= */

if (homeLink) {

  homeLink.addEventListener(
    "click",
    () => {

      history.replaceState(
        null,
        "",
        window.location.pathname
      );

      renderHome();
    }
  );
}


if (newArticleBtn) {

  newArticleBtn.addEventListener(
    "click",
    async () => {

      if (!getInitData()) {

        showToast(
          "Откройте приложение через Telegram"
        );

        return;
      }

      await loadProfile();

      if (!state.profile) {

        showToast(
          "Сначала создайте профиль"
        );

        await renderProfilePage();

        return;
      }

      renderNewArticlePage();
    }
  );
}


if (profileBtn) {

  profileBtn.addEventListener(
    "click",
    renderProfilePage
  );
}


/* =========================================================
   23. HASH ROUTING
   ========================================================= */

function handleHash() {

  const hash =
    window.location.hash || "";

  if (
    hash.startsWith(
      "#article/"
    )
  ) {

    const id =
      hash.replace(
        "#article/",
        ""
      );

    if (id) {
      openArticle(id);
      return;
    }
  }

  renderHome();
}


window.addEventListener(
  "hashchange",
  handleHash
);


/* =========================================================
   24. INITIALIZATION
   ========================================================= */

async function init() {

  try {

    setLoading(
      "Загрузка…"
    );

    await loadArticles();

    await loadProfile();

    handleHash();

  } catch (error) {

    console.error(
      "Initialization error:",
      error
    );

    main.innerHTML = `

      <div class="error-state">

        <h2>
          Не удалось загрузить приложение
        </h2>

        <p>
          ${escapeHtml(
            error.message ||
            "Неизвестная ошибка"
          )}
        </p>

        <button
          class="profile-save"
          id="retryBtn"
          type="button"
        >
          Повторить
        </button>

      </div>
    `;


    const retry =
      document.getElementById(
        "retryBtn"
      );

    if (retry) {

      retry.addEventListener(
        "click",
        init
      );
    }
  }
}


init();
